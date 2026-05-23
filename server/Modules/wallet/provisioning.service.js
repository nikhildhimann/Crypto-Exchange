const mongoose = require("mongoose");

const Wallet = require("./model");
const WalletAddress = require("./address.model");
const { AppError } = require("../../helpers/errors");
const {
  assertChainFeature,
  assertSupportedChainNetwork,
  getChainContext,
  listAutoProvisionTargets,
} = require("../../common/utils/chain");
const {
  buildWalletVisibilityFilter,
  mergeWalletState,
} = require("../../common/utils/walletState");
const logger = require("../../common/utils/logger");
const operationsConfig = require("../../config/operations");

const DEFERRED_PROVISIONING_SYNC_MODE = "background";
const PROVISIONING_CONCURRENCY_LIMIT = operationsConfig.concurrency.provisioningLimit;
const AUTO_PROVISION_DEFAULT_SCOPE = String(
  process.env.WALLET_AUTO_PROVISION_DEFAULT_SCOPE || "primary",
)
  .trim()
  .toLowerCase();
const AUTO_PROVISION_CHAIN_ALLOWLIST = new Set(
  String(process.env.WALLET_AUTO_PROVISION_CHAINS || "")
    .split(",")
    .map((chain) => chain.trim().toLowerCase())
    .filter(Boolean),
);
const ADA_INITIAL_IMPORT_DISCOVERY_OPTIONS = Object.freeze({
  maxAccounts: 4,
  probeReceiveEnd: 4,
  probeChangeEnd: 2,
  probeConcurrency: 4,
});
const deferredProvisioningSyncInFlight = new Map();

function isSameTarget(a, b) {
  return a && b && a.chain === b.chain && a.network === b.network;
}

function getTargetKey(target) {
  return `${target.chain}:${target.network}`;
}

function shouldDefaultToPrimaryProvisioning() {
  return !["all", "full", "legacy"].includes(AUTO_PROVISION_DEFAULT_SCOPE);
}

function filterAutoProvisionTargets(targets = []) {
  if (!AUTO_PROVISION_CHAIN_ALLOWLIST.size) {
    return targets;
  }

  return targets.filter((target) =>
    AUTO_PROVISION_CHAIN_ALLOWLIST.has(String(target?.chain || "").toLowerCase()),
  );
}

function getTargetPriority(target, fallback = Number.MAX_SAFE_INTEGER) {
  const priority = Number(target?.priority);
  return Number.isFinite(priority) ? priority : fallback;
}

function getNetworkLabel(context, network) {
  return (
    context.supportedNetworks.find((item) => item.code === network)?.label ||
    String(network)
  );
}

function buildProvisioningLabel({
  context,
  target,
  primaryTarget,
  preferredLabel,
}) {
  if (preferredLabel && isSameTarget(target, primaryTarget)) {
    return preferredLabel;
  }

  return `${getNetworkLabel(context, target.network)} ${context.assetSymbol} Wallet`;
}

function buildWalletPersistence(chain, metadata = {}) {
  const context = getChainContext(chain);

  return {
    chain: context.chain,
    asset: context.assetSymbol,
    metadata: mergeWalletState({
      chainLabel: context.label,
      nativeAssetSymbol: context.assetSymbol,
      assetDecimals: context.decimals,
      baseUnitName: context.baseUnitName,
      supportedNetworks: context.supportedNetworks,
      addressExtras: context.addressExtras,
      explorer: context.explorer,
      routing: {
        executionParams: {},
      },
      ...metadata,
    }),
  };
}

function getProvisionedWalletIds(wallets = []) {
  return Array.from(
    new Set(
      wallets
        .map((wallet) => String(wallet?._id || wallet?.walletId || "").trim())
        .filter(Boolean),
    ),
  );
}

function getDeferredProvisioningSyncKey(userId, walletIds = []) {
  return `${String(userId)}:${[...walletIds].sort().join(",")}`;
}

async function updateProvisionedWalletSyncMetadata(
  wallets,
  {
    status,
    hydrationPending,
    trigger,
    mode,
    deferredAt,
    startedAt,
    completedAt,
    lastAttemptAt,
    lastError,
  } = {},
) {
  const walletIds = getProvisionedWalletIds(wallets);
  if (!walletIds.length) {
    return;
  }

  const $set = {};

  if (status !== undefined) {
    $set["metadata.provisioning.sync.status"] = status;
  }
  if (hydrationPending !== undefined) {
    $set["metadata.provisioning.sync.hydrationPending"] = hydrationPending;
  }
  if (trigger !== undefined) {
    $set["metadata.provisioning.sync.trigger"] = trigger;
  }
  if (mode !== undefined) {
    $set["metadata.provisioning.sync.mode"] = mode;
  }
  if (deferredAt !== undefined) {
    $set["metadata.provisioning.sync.deferredAt"] = deferredAt;
  }
  if (startedAt !== undefined) {
    $set["metadata.provisioning.sync.startedAt"] = startedAt;
  }
  if (completedAt !== undefined) {
    $set["metadata.provisioning.sync.completedAt"] = completedAt;
  }
  if (lastAttemptAt !== undefined) {
    $set["metadata.provisioning.sync.lastAttemptAt"] = lastAttemptAt;
  }
  if (lastError !== undefined) {
    $set["metadata.provisioning.sync.lastError"] = lastError;
  }

  if (!Object.keys($set).length) {
    return;
  }

  await Wallet.updateMany(
    { _id: { $in: walletIds } },
    {
      $set,
    },
  );
}

async function markProvisionedWalletSetSyncPending(wallets, options = {}) {
  const deferredAt = options.deferredAt || new Date();
  await updateProvisionedWalletSyncMetadata(wallets, {
    status: "pending",
    hydrationPending: true,
    trigger: options.trigger,
    mode: options.mode || DEFERRED_PROVISIONING_SYNC_MODE,
    deferredAt,
    lastError: null,
  });
  return deferredAt;
}

async function applyProvisionedWalletSyncOutcome(
  wallets,
  syncResult = {},
  options = {},
) {
  const walletIds = getProvisionedWalletIds(wallets);
  if (!walletIds.length) {
    return;
  }

  const completedAt = options.completedAt || new Date();
  const failureMap = new Map(
    (Array.isArray(syncResult.failures) ? syncResult.failures : [])
      .filter((failure) => failure?.walletId)
      .map((failure) => [
        String(failure.walletId),
        failure?.error ? String(failure.error) : "Provisioning sync failed",
      ]),
  );

  const operations = walletIds.map((walletId) => {
    const failureMessage = failureMap.get(walletId) || null;

    return {
      updateOne: {
        filter: { _id: walletId },
        update: {
          $set: {
            "metadata.provisioning.sync.status": failureMessage
              ? "failed"
              : "completed",
            "metadata.provisioning.sync.hydrationPending": Boolean(
              failureMessage,
            ),
            "metadata.provisioning.sync.completedAt": completedAt,
            "metadata.provisioning.sync.lastAttemptAt": completedAt,
            "metadata.provisioning.sync.lastError": failureMessage,
          },
        },
      },
    };
  });

  await Wallet.bulkWrite(operations, { ordered: false });
}

async function createWalletRecord(payload) {
  try {
    return await Wallet.create(payload);
  } catch (error) {
    if (
      error instanceof mongoose.Error &&
      "code" in error &&
      Number(error.code) === 11000
    ) {
      throw AppError.conflict("Wallet already exists on the selected network");
    }

    throw error;
  }
}

function buildProvisioningMetadata({
  target,
  primaryTarget,
  mode,
  material,
  existingWallet = null,
  existingMetadata = {},
}) {
  const materialMetadata =
    material?.metadata && typeof material.metadata === "object"
      ? material.metadata
      : {};
  const existingActivation =
    existingMetadata.activation &&
    typeof existingMetadata.activation === "object"
      ? existingMetadata.activation
      : {};
  const materialActivation =
    materialMetadata.activation &&
    typeof materialMetadata.activation === "object"
      ? materialMetadata.activation
      : {};
  const isPendingHbarActivation =
    target?.chain === "hbar" &&
    String(materialActivation.status || "")
      .trim()
      .toLowerCase() === "pending";
  const existingCanonicalAccountId = String(
    existingActivation.canonicalAddress ||
      existingMetadata.canonicalAccountId ||
      existingMetadata.derivation?.canonicalAccountId ||
      existingWallet?.address ||
      "",
  ).trim();
  const existingActivationStatus = String(existingActivation.status || "")
    .trim()
    .toLowerCase();
  const shouldPreserveExistingHbarActivation =
    target?.chain === "hbar" &&
    /^\d+\.\d+\.\d+$/.test(existingCanonicalAccountId) &&
    (existingActivationStatus === "active" || existingActivationStatus === "");
  const mergedMetadata = mergeWalletState({
    ...existingMetadata,
    ...materialMetadata,
    provisioning: {
      ...(existingMetadata.provisioning || {}),
      ...(materialMetadata.provisioning &&
      typeof materialMetadata.provisioning === "object"
        ? materialMetadata.provisioning
        : {}),
      rootRecovery: "master_mnemonic",
      autoProvisioned: !isPendingHbarActivation,
      isPrimaryTarget: isSameTarget(target, primaryTarget),
      mode,
      provisionedAt: new Date(),
    },
    activation: {
      ...existingActivation,
      ...materialActivation,
    },
    derivation: {
      ...(existingMetadata.derivation || {}),
      ...(materialMetadata.derivation &&
      typeof materialMetadata.derivation === "object"
        ? materialMetadata.derivation
        : {}),
      ...(material.derivation && typeof material.derivation === "object"
        ? material.derivation
        : {}),
      ...(materialMetadata.discovery
        ? { discovery: materialMetadata.discovery }
        : {}),
      sourceMnemonic: "master",
      address: material.address,
      publicKey: material.publicKey,
    },
    routing: {
      executionParams: {
        ...(existingMetadata.routing?.executionParams || {}),
      },
    },
  });

  if (!shouldPreserveExistingHbarActivation || !isPendingHbarActivation) {
    return mergedMetadata;
  }

  const existingAliasAccountId = String(
    existingActivation.aliasAddress ||
      existingMetadata.aliasAccountId ||
      existingMetadata.derivation?.aliasAccountId ||
      "",
  ).trim();

  return mergeWalletState(mergedMetadata, {
    identifierType: existingMetadata.identifierType || mergedMetadata.identifierType || "accountId",
    canonicalAccountId: existingCanonicalAccountId,
    aliasAccountId: existingAliasAccountId || mergedMetadata.aliasAccountId || null,
    evmAddress:
      existingMetadata.evmAddress ||
      existingMetadata.derivation?.evmAddress ||
      mergedMetadata.evmAddress ||
      null,
    accountCreatedOnNetwork:
      existingMetadata.accountCreatedOnNetwork !== false,
    provisioning: {
      ...(mergedMetadata.provisioning || {}),
      autoProvisioned: true,
    },
    activation: {
      ...(mergedMetadata.activation || {}),
      ...existingActivation,
      status: "active",
      canonicalAddress: existingCanonicalAccountId,
      aliasAddress: existingAliasAccountId || mergedMetadata.activation?.aliasAddress || null,
      displayAddress: existingCanonicalAccountId,
    },
    derivation: {
      ...(mergedMetadata.derivation || {}),
      canonicalAccountId:
        existingMetadata.derivation?.canonicalAccountId || existingCanonicalAccountId,
      aliasAccountId:
        existingMetadata.derivation?.aliasAccountId ||
        existingAliasAccountId ||
        mergedMetadata.derivation?.aliasAccountId ||
        null,
      evmAddress:
        existingMetadata.derivation?.evmAddress ||
        mergedMetadata.derivation?.evmAddress ||
        null,
      accountCreatedOnNetwork: true,
      activationStatus: "active",
    },
  });
}

function shouldPreserveExistingHbarAddress(existingWallet, target, material) {
  if (target?.chain !== "hbar" || !existingWallet) {
    return false;
  }

  const existingStatus = String(existingWallet?.metadata?.activation?.status || "")
    .trim()
    .toLowerCase();
  const materialStatus = String(material?.metadata?.activation?.status || "")
    .trim()
    .toLowerCase();

  return (
    /^\d+\.\d+\.\d+$/.test(String(existingWallet.address || "").trim()) &&
    existingStatus === "active" &&
    materialStatus === "pending"
  );
}

function collectManagedAddressesFromMaterial(material = {}) {
  const managedAddresses = [
    material?.managedAddress && typeof material.managedAddress === "object"
      ? material.managedAddress
      : null,
    ...(Array.isArray(material?.additionalManagedAddresses)
      ? material.additionalManagedAddresses.filter(
          (entry) => entry && typeof entry === "object",
        )
      : []),
  ].filter(Boolean);

  return managedAddresses
    .map((entry) => ({
      ...entry,
      address: String(entry.address || "").trim(),
    }))
    .filter((entry) => entry.address);
}

function isDogeTarget(target = {}) {
  return (
    String(target.chain || "")
      .trim()
      .toLowerCase() === "doge"
  );
}

function buildProvisionedWatchLabel({ wallet, target, managedAddress }) {
  const purpose =
    String(managedAddress.purpose || "receive").trim() || "receive";

  return [
    "wallet",
    String(wallet._id),
    target.chain,
    target.network,
    purpose,
    Number.isFinite(Number(managedAddress.branch))
      ? `b${Number(managedAddress.branch)}`
      : null,
    Number.isFinite(Number(managedAddress.addressIndex))
      ? `i${Number(managedAddress.addressIndex)}`
      : null,
  ]
    .filter(Boolean)
    .join(":");
}

function shouldRegisterProvisionedWatchAddress({ target, managedAddress }) {
  if (managedAddress.isActive === false) {
    return false;
  }

  if (managedAddress.isChange === true && !isDogeTarget(target)) {
    return false;
  }

  return true;
}

function resolveProvisionedWatchRescan({ target, mode }) {
  return isDogeTarget(target) && mode === "import";
}

function shouldHardFailWatchRegistration(target) {
  return isDogeTarget(target);
}

async function registerProvisionedWatchAddresses({
  wallet,
  target,
  material,
  context,
  mode = "create",
}) {
  const registerWatchAddress = context?.adapter?.deposit?.registerWatchAddress;

  if (typeof registerWatchAddress !== "function") {
    return [];
  }

  const managedAddresses = collectManagedAddressesFromMaterial(material);
  if (!wallet?._id || !managedAddresses.length) {
    return [];
  }

  const results = [];

  for (const managedAddress of managedAddresses) {
    if (!shouldRegisterProvisionedWatchAddress({ target, managedAddress })) {
      continue;
    }

    const address = String(managedAddress.address || "").trim();
    if (!address) {
      continue;
    }

    const label = buildProvisionedWatchLabel({
      wallet,
      target,
      managedAddress,
    });

    const response = await registerWatchAddress({
      network: target.network,
      address,
      label,
      rescan: resolveProvisionedWatchRescan({ target, mode }),
    });

    results.push({
      address,
      label,
      response,
    });
  }

  return results;
}

async function ensureProvisionedWalletWatchAddresses({
  wallet,
  target,
  material,
  context,
  mode = "create",
}) {
  try {
    return await registerProvisionedWatchAddresses({
      wallet,
      target,
      material,
      context,
      mode,
    });
  } catch (error) {
    logger.warn(
      "Failed to register watch-only addresses for provisioned wallet",
      {
        event: "wallet_provision_watch_registration_failed",
        chain: target.chain,
        network: target.network,
        mode,
        error: error?.message || String(error),
      },
    );

    if (shouldHardFailWatchRegistration(target)) {
      throw new AppError(
        `Failed to register required ${String(target.chain || "").toUpperCase()} watch-only addresses`,
        {
          status: 502,
          errors: {
            reason: error?.message || String(error),
            chain: target.chain,
            network: target.network,
            mode,
          },
        },
      );
    }

    return [];
  }
}

async function persistManagedWalletAddress({ wallet, target, material }) {
  const managedAddresses = [
    material?.managedAddress && typeof material.managedAddress === "object"
      ? material.managedAddress
      : null,
    ...(Array.isArray(material?.additionalManagedAddresses)
      ? material.additionalManagedAddresses.filter(
          (entry) => entry && typeof entry === "object",
        )
      : []),
  ].filter(Boolean);

  if (!wallet?._id || !managedAddresses.length) {
    return null;
  }

  const persisted = [];

  for (const managedAddress of managedAddresses) {
    const address = String(managedAddress.address || "").trim();
    if (!address) {
      continue;
    }

    const payload = {
      walletId: wallet._id,
      userId: wallet.userId,
      chain: target.chain,
      network: target.network,
      address,
      memo: "",
      derivationPath: String(
        managedAddress.derivationPath || material.derivationPath || "",
      ).trim(),
      branch: Number.isFinite(Number(managedAddress.branch))
        ? Number(managedAddress.branch)
        : 0,
      addressIndex: Number.isFinite(Number(managedAddress.addressIndex))
        ? Number(managedAddress.addressIndex)
        : 0,
      addressType: String(managedAddress.addressType || "").trim(),
      purpose: String(managedAddress.purpose || "receive").trim(),
      isActive: managedAddress.isActive !== false,
      isChange: managedAddress.isChange === true,
      metadata:
        managedAddress.metadata && typeof managedAddress.metadata === "object"
          ? managedAddress.metadata
          : {},
      status: managedAddress.isActive === false ? "inactive" : "active",
    };

    await WalletAddress.updateOne(
      { walletId: wallet._id, address },
      { $set: payload },
      { upsert: true },
    );

    persisted.push(payload);
  }

  return persisted[0] || null;
}

function sortTargets(targets, primaryTarget) {
  const uniqueTargets = [];
  const seen = new Set();

  const ordered = [primaryTarget, ...targets].filter(Boolean).sort((a, b) => {
    if (isSameTarget(a, primaryTarget)) {
      return -1;
    }

    if (isSameTarget(b, primaryTarget)) {
      return 1;
    }

    const priorityDelta = getTargetPriority(a) - getTargetPriority(b);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return getTargetKey(a).localeCompare(getTargetKey(b));
  });
  for (const target of ordered) {
    const key = getTargetKey(target);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueTargets.push(target);
  }

  return uniqueTargets;
}

function applyDeferredAdaRecoveryMetadata(
  material,
  discoveryOptions = ADA_INITIAL_IMPORT_DISCOVERY_OPTIONS,
) {
  const metadata =
    material?.metadata && typeof material.metadata === "object"
      ? material.metadata
      : {};
  const discovery =
    metadata.discovery && typeof metadata.discovery === "object"
      ? metadata.discovery
      : {};
  const provisioning =
    metadata.provisioning && typeof metadata.provisioning === "object"
      ? metadata.provisioning
      : {};

  return {
    ...material,
    metadata: {
      ...metadata,
      discovery: {
        ...discovery,
        mode: "initial_shallow",
        pendingFullDiscovery: true,
        fullDiscoveryDeferred: true,
        initialScanRanges: {
          maxAccounts: Number(discoveryOptions.maxAccounts),
          receiveEnd: Number(discoveryOptions.probeReceiveEnd),
          changeEnd: Number(discoveryOptions.probeChangeEnd),
        },
      },
      provisioning: {
        ...provisioning,
        status: "pending_recovery",
        recoveryPending: true,
        discoveryPending: true,
        recoveryReason: "ada_initial_discovery_deferred",
        recoveryTrigger: "deferred_provisioning_sync",
        discoveryProfile: "initial_shallow",
        lastRecoveryOutcome: "deferred_initial_account_discovery",
      },
    },
  };
}

async function settleWithConcurrencyLimit(
  items = [],
  limit = 1,
  iterator = async (value) => value,
) {
  const settledResults = new Array(items.length);
  const maxConcurrency = Math.max(
    1,
    Math.min(Number(limit) || 1, items.length || 1),
  );
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        settledResults[currentIndex] = {
          status: "fulfilled",
          value: await iterator(items[currentIndex], currentIndex),
        };
      } catch (error) {
        settledResults[currentIndex] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: maxConcurrency }, () => runWorker()),
  );

  return settledResults;
}

async function persistWalletRoutingMetadata(
  walletId,
  routingExecutionParams = {},
) {
  const normalizedEntries = Object.entries(routingExecutionParams).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (!normalizedEntries.length) {
    return;
  }

  const update = normalizedEntries.reduce((result, [key, value]) => {
    result[`metadata.routing.executionParams.${key}`] = value;
    return result;
  }, {});

  await Wallet.updateOne(
    { _id: walletId },
    {
      $set: update,
    },
  );
}

async function assignManagedExecutionParams({
  userId,
  accountId,
  walletId,
  target,
  context,
}) {
  const resolver = context.adapter?.wallet?.assignManagedReceiveExecutionParams;
  if (typeof resolver !== "function") {
    return;
  }

  const executionParams = await resolver({
    userId,
    accountId,
    walletId,
    chain: target.chain,
    network: target.network,
    context,
  });

  await persistWalletRoutingMetadata(walletId, executionParams || {});
}

async function ensureManagedRoutingMetadata({
  userId,
  accountId,
  wallet,
  target,
  context,
}) {
  if (!wallet?._id) {
    return;
  }

  await assignManagedExecutionParams({
    userId,
    accountId,
    walletId: wallet._id,
    target,
    context,
  });
}

async function initializeProvisionedRuntimeContext({
  wallet,
  target,
  context,
  mnemonic,
} = {}) {
  const initializer = context?.adapter?.transaction?.ensureRuntimeWalletContext;
  if (!wallet?._id || typeof initializer !== "function") {
    return;
  }

  try {
    await initializer({
      wallet,
      walletRecord: wallet,
      network: target.network,
      address: wallet.address,
      fromAddress: wallet.address,
      mnemonic,
      persistChangeAddress: true,
    });
  } catch (error) {
    logger.warn("Failed to initialize provisioned wallet runtime context", {
      event: "wallet_runtime_context_init_failed",
      chain: target?.chain || null,
      network: target?.network || null,
      walletId: String(wallet?._id || ""),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildProvisioningOwnershipFilter({ userId, accountId } = {}) {
  if (accountId) {
    return { accountId };
  }

  return { userId };
}

async function updateWalletStateMetadata(walletId, patch = {}) {
  const currentWallet = await Wallet.findById(walletId).lean();
  if (!currentWallet) {
    throw AppError.notFound("Wallet not found");
  }

  const metadata = mergeWalletState(currentWallet.metadata || {}, patch);
  await Wallet.updateOne({ _id: walletId }, { $set: { metadata } });
  return metadata;
}

async function promotePrimaryWallet({ walletId, userId, accountId }) {
  const scope = buildProvisioningOwnershipFilter({ userId, accountId });

  await Wallet.updateMany(
    {
      ...scope,
      _id: { $ne: walletId },
    },
    {
      $set: {
        "metadata.walletState.isPrimary": false,
      },
    },
  );

  await updateWalletStateMetadata(walletId, {
    isPrimary: true,
    hidden: false,
    archived: false,
  });
}

async function promoteDefaultWalletForChain({
  walletId,
  userId,
  accountId,
  chain,
}) {
  const scope = buildProvisioningOwnershipFilter({ userId, accountId });

  await Wallet.updateMany(
    {
      ...scope,
      chain,
      _id: { $ne: walletId },
    },
    {
      $set: {
        "metadata.walletState.isDefaultForChain": false,
      },
    },
  );

  await updateWalletStateMetadata(walletId, {
    isDefaultForChain: true,
    hidden: false,
    archived: false,
  });
}

async function ensureWalletStateDefaults({
  walletId,
  userId,
  accountId,
  chain,
}) {
  const scope = buildProvisioningOwnershipFilter({ userId, accountId });
  const visibilityFilter = buildWalletVisibilityFilter();

  const [existingPrimary, existingChainDefault] = await Promise.all([
    Wallet.findOne({
      ...scope,
      _id: { $ne: walletId },
      ...visibilityFilter,
      "metadata.walletState.isPrimary": true,
    }).lean(),
    Wallet.findOne({
      ...scope,
      chain,
      _id: { $ne: walletId },
      ...visibilityFilter,
      "metadata.walletState.isDefaultForChain": true,
    }).lean(),
  ]);

  await updateWalletStateMetadata(walletId, {
    isPrimary: existingPrimary ? false : true,
    isDefaultForChain: existingChainDefault ? false : true,
    hidden: false,
    archived: false,
  });
}

async function finalizeProvisionedWalletStates({
  userId,
  accountId,
  results = [],
  primaryTarget,
}) {
  const byChain = new Map();
  const primaryResult =
    results.find((item) => isSameTarget(item.target, primaryTarget)) ||
    results[0] ||
    null;

  for (const item of results) {
    if (!item?.wallet?._id) {
      continue;
    }

    const chainKey = String(
      item.wallet.chain || item.target?.chain || "",
    ).toLowerCase();
    if (!byChain.has(chainKey)) {
      byChain.set(chainKey, item);
    }

    await updateWalletStateMetadata(String(item.wallet._id), {
      isPrimary: false,
      hidden: false,
      archived: false,
    });
  }

  if (primaryResult?.wallet?._id) {
    await promotePrimaryWallet({
      walletId: String(primaryResult.wallet._id),
      userId,
      accountId,
    });
    await promoteDefaultWalletForChain({
      walletId: String(primaryResult.wallet._id),
      userId,
      accountId,
      chain: primaryResult.wallet.chain,
    });
    byChain.set(primaryResult.wallet.chain, primaryResult);
  }

  for (const item of byChain.values()) {
    if (!item?.wallet?._id) {
      continue;
    }

    if (
      primaryResult?.wallet?._id &&
      String(primaryResult.wallet._id) === String(item.wallet._id)
    ) {
      continue;
    }

    await ensureWalletStateDefaults({
      walletId: String(item.wallet._id),
      userId,
      accountId,
      chain: item.wallet.chain,
    });
  }

  const refreshedWallets = await Wallet.find({
    _id: { $in: results.map((item) => item.wallet?._id).filter(Boolean) },
  }).lean();
  const walletMap = new Map(
    refreshedWallets.map((wallet) => [String(wallet._id), wallet]),
  );

  return results.map((item) => ({
    ...item,
    wallet: walletMap.get(String(item.wallet._id)) || item.wallet,
  }));
}

function normalizeProvisionTarget(target, feature) {
  const { chain, network } = feature
    ? assertChainFeature(target.chain, target.network, feature)
    : assertSupportedChainNetwork(target.chain, target.network);
  return {
    chain,
    network,
    priority: getTargetPriority(target),
  };
}

async function deriveWalletMaterial(target, mnemonic, feature) {
  const context = feature
    ? assertChainFeature(target.chain, target.network, feature)
    : assertSupportedChainNetwork(target.chain, target.network);

  let material;

  if (target.chain === "ada" && feature === "import") {
    const startedAt = Date.now();
    material = await context.adapter.wallet.discoverWalletFromMnemonic(
      mnemonic,
      target.network,
      ADA_INITIAL_IMPORT_DISCOVERY_OPTIONS,
    );
    material = applyDeferredAdaRecoveryMetadata(
      material,
      ADA_INITIAL_IMPORT_DISCOVERY_OPTIONS,
    );

    logger.info("ADA provisioning completed initial shallow discovery", {
      event: "ada_initial_discovery_deferred",
      network: target.network,
      feature,
      durationMs: Date.now() - startedAt,
      accountIndex: Number(material?.derivation?.account ?? 0),
      scanRanges: material?.metadata?.discovery?.initialScanRanges || {
        maxAccounts: ADA_INITIAL_IMPORT_DISCOVERY_OPTIONS.maxAccounts,
        receiveEnd: ADA_INITIAL_IMPORT_DISCOVERY_OPTIONS.probeReceiveEnd,
        changeEnd: ADA_INITIAL_IMPORT_DISCOVERY_OPTIONS.probeChangeEnd,
      },
    });
  } else {
    material = await context.adapter.wallet.importWalletFromMnemonic(
      mnemonic,
      target.network,
    );
  }

  const finalizeMaterial =
    context.adapter?.wallet?.finalizeProvisioningMaterial;

  if (typeof finalizeMaterial === "function") {
    material = await finalizeMaterial({
      target,
      network: target.network,
      mnemonic,
      material,
      feature,
      context,
    });
  }

  return {
    context,
    material,
  };
}

async function findExistingWalletForMaterial(target, material) {
  const directWallet = await Wallet.findOne({
    address: material.address,
    network: target.network,
    chain: target.chain,
  }).lean();

  if (directWallet) {
    return directWallet;
  }

  if (target.chain !== "hbar") {
    return null;
  }

  const aliasAccountId = String(
    material?.metadata?.activation?.aliasAddress ||
      material?.metadata?.aliasAccountId ||
      material?.derivation?.aliasAccountId ||
      "",
  ).trim();

  if (!aliasAccountId) {
    return null;
  }

  const managedAddress = await WalletAddress.findOne({
    chain: target.chain,
    network: target.network,
    address: aliasAccountId,
  })
    .select("walletId")
    .lean();

  if (!managedAddress?.walletId) {
    return null;
  }

  return Wallet.findOne({
    _id: managedAddress.walletId,
    chain: target.chain,
    network: target.network,
  }).lean();
}

async function updateWalletRecord(existingWalletId, payload) {
  const wallet = await Wallet.findByIdAndUpdate(
    existingWalletId,
    { $set: payload },
    { new: true },
  ).lean();

  if (!wallet) {
    throw AppError.notFound("Wallet not found");
  }

  return wallet;
}

async function provisionCreateTarget(input) {
  const {
    userId,
    accountId,
    target,
    primaryTarget,
    preferredLabel,
    encryptedRecoveryPhrase,
    mnemonic,
  } = input;
  const { context, material } = await deriveWalletMaterial(
    target,
    mnemonic,
    "create",
  );
  const existingWallet = await findExistingWalletForMaterial(target, material);

  if (existingWallet) {
    if (String(existingWallet.userId) !== String(userId)) {
      throw AppError.conflict("Wallet already exists on the selected network");
    }

    const walletAttributes = buildWalletPersistence(
      target.chain,
      buildProvisioningMetadata({
        target,
        primaryTarget,
        mode: "created",
        material,
        existingWallet,
        existingMetadata: existingWallet.metadata || {},
      }),
    );
    const persistedAddress = shouldPreserveExistingHbarAddress(existingWallet, target, material)
      ? existingWallet.address
      : material.address;
    const updatedWallet = await updateWalletRecord(existingWallet._id, {
      accountId,
      address: persistedAddress,
      publicKey: material.publicKey,
      encryptedRecoveryPhrase,
      label: isSameTarget(target, primaryTarget)
        ? buildProvisioningLabel({
            context,
            target,
            primaryTarget,
            preferredLabel,
          })
        : existingWallet.label ||
          buildProvisioningLabel({
            context,
            target,
            primaryTarget,
            preferredLabel,
          }),
      sourceType: "created",
      isImported: false,
      asset: walletAttributes.asset,
      metadata: walletAttributes.metadata,
    });

    try {
      await ensureManagedRoutingMetadata({
        userId,
        accountId,
        wallet: updatedWallet,
        target,
        context,
      });
      await persistManagedWalletAddress({
        wallet: updatedWallet,
        target,
        material,
      });
      await initializeProvisionedRuntimeContext({
        wallet: updatedWallet,
        target,
        context,
        mnemonic,
      });
      await ensureProvisionedWalletWatchAddresses({
        wallet: updatedWallet,
        target,
        material,
        context,
        mode: "create",
      });
    } catch (error) {
      if (isDogeTarget(target)) throw error;
      logger.warn("Failed to finalize provisioned wallet setup", {
        event: "wallet_provision_finalize_failed",
        chain: target.chain,
        network: target.network,
        mode: "reused_create",
        error: error.message,
      });
      if (String(target.chain || "").toLowerCase() === "ada") {
        await Wallet.updateOne(
          { _id: updatedWallet._id },
          {
            $set: {
              "metadata.provisioning.status": "pending_recovery",
              "metadata.provisioning.lastError": error.message,
              "metadata.provisioning.lastRecoveryAttemptAt": new Date(),
            },
          },
        );
      }
    }

    return {
      action: "reused",
      wallet: updatedWallet,
      target,
    };
  }

  const walletAttributes = buildWalletPersistence(
    target.chain,
    buildProvisioningMetadata({
      target,
      primaryTarget,
      mode: "created",
      material,
      existingWallet: null,
    }),
  );
  const wallet = await createWalletRecord({
    userId,
    accountId,
    chain: target.chain,
    asset: walletAttributes.asset,
    address: material.address,
    publicKey: material.publicKey,
    network: target.network,
    encryptedRecoveryPhrase,
    label: buildProvisioningLabel({
      context,
      target,
      primaryTarget,
      preferredLabel,
    }),
    sourceType: "created",
    isImported: false,
    metadata: walletAttributes.metadata,
  });

  try {
    await ensureManagedRoutingMetadata({
      userId,
      accountId,
      wallet,
      target,
      context,
    });
    await persistManagedWalletAddress({
      wallet,
      target,
      material,
    });
    await initializeProvisionedRuntimeContext({
      wallet,
      target,
      context,
      mnemonic,
    });
    await ensureProvisionedWalletWatchAddresses({
      wallet,
      target,
      material,
      context,
      mode: "create",
    });
  } catch (error) {
    if (isDogeTarget(target)) {
      throw error;
    }
    logger.warn("Failed to finalize provisioned wallet setup", {
      event: "wallet_provision_finalize_failed",
      chain: target.chain,
      network: target.network,
      mode: "create",
      error: error.message,
    });
    if (String(target.chain || "").toLowerCase() === "ada") {
      await Wallet.updateOne(
        { _id: wallet._id },
        {
          $set: {
            "metadata.provisioning.status": "pending_recovery",
            "metadata.provisioning.lastError": error.message,
            "metadata.provisioning.lastRecoveryAttemptAt": new Date(),
          },
        },
      );
    }
  }

  return {
    action: "created",
    wallet: wallet.toObject ? wallet.toObject() : wallet,
    target,
  };
}

async function provisionImportTarget(input) {
  const {
    userId,
    accountId,
    target,
    primaryTarget,
    preferredLabel,
    encryptedRecoveryPhrase,
    mnemonic,
  } = input;
  const { context, material } = await deriveWalletMaterial(
    target,
    mnemonic,
    "import",
  );
  const existingWallet = await findExistingWalletForMaterial(target, material);
  const walletAttributes = buildWalletPersistence(
    target.chain,
    buildProvisioningMetadata({
      target,
      primaryTarget,
      mode: "imported",
      material,
      existingWallet,
      existingMetadata: existingWallet?.metadata || {},
    }),
  );

  const label = buildProvisioningLabel({
    context,
    target,
    primaryTarget,
    preferredLabel,
  });

  if (existingWallet) {
    const persistedAddress = shouldPreserveExistingHbarAddress(existingWallet, target, material)
      ? existingWallet.address
      : material.address;
    const claimedWallet = await updateWalletRecord(existingWallet._id, {
      userId,
      accountId,
      chain: target.chain,
      address: persistedAddress,
      publicKey: material.publicKey,
      network: target.network,
      encryptedRecoveryPhrase,
      label: isSameTarget(target, primaryTarget)
        ? label
        : existingWallet.label || label,
      sourceType: "imported",
      isImported: true,
      asset: walletAttributes.asset,
      metadata: walletAttributes.metadata,
    });

    try {
      await ensureManagedRoutingMetadata({
        userId,
        accountId,
        wallet: claimedWallet,
        target,
        context,
      });
      await persistManagedWalletAddress({
        wallet: claimedWallet,
        target,
        material,
      });
      // Import should return quickly after wallet ownership and encrypted
      // material are persisted. Runtime hydration/discovery is deferred to the
      // background provisioning sync so the API response is not blocked by
      // chain scans or managed-address initialization work.
      await ensureProvisionedWalletWatchAddresses({
        wallet: claimedWallet,
        target,
        material,
        context,
        mode: "import",
      });
    } catch (error) {
      if (isDogeTarget(target)) throw error;
      logger.warn("Failed to finalize provisioned wallet setup", {
        event: "wallet_import_finalize_failed",
        chain: target.chain,
        network: target.network,
        mode: "reused_import",
        error: error.message,
      });
      if (String(target.chain || "").toLowerCase() === "ada") {
        await Wallet.updateOne(
          { _id: claimedWallet._id },
          {
            $set: {
              "metadata.provisioning.status": "pending_recovery",
              "metadata.provisioning.lastError": error.message,
              "metadata.provisioning.lastRecoveryAttemptAt": new Date(),
            },
          },
        );
      }
    }

    return {
      action:
        String(existingWallet.userId) === String(userId) ? "reused" : "claimed",
      wallet: claimedWallet,
      target,
    };
  }

  const wallet = await createWalletRecord({
    userId,
    accountId,
    chain: target.chain,
    asset: walletAttributes.asset,
    address: material.address,
    publicKey: material.publicKey,
    network: target.network,
    encryptedRecoveryPhrase,
    label,
    sourceType: "imported",
    isImported: true,
    metadata: walletAttributes.metadata,
  });

  try {
    await ensureManagedRoutingMetadata({
      userId,
      accountId,
      wallet,
      target,
      context,
    });
    await persistManagedWalletAddress({
      wallet,
      target,
      material,
    });
    // Import should return quickly after wallet ownership and encrypted
    // material are persisted. Runtime hydration/discovery is deferred to the
    // background provisioning sync so the API response is not blocked by
    // chain scans or managed-address initialization work.
    await ensureProvisionedWalletWatchAddresses({
      wallet,
      target,
      material,
      context,
      mode: "import",
    });
  } catch (error) {
    if (isDogeTarget(target)) {
      throw error;
    }
    logger.warn("Failed to finalize provisioned wallet setup", {
      event: "wallet_import_finalize_failed",
      chain: target.chain,
      network: target.network,
      mode: "import",
      error: error.message,
    });
    if (String(target.chain || "").toLowerCase() === "ada") {
      await Wallet.updateOne(
        { _id: wallet._id },
        {
          $set: {
            "metadata.provisioning.status": "pending_recovery",
            "metadata.provisioning.lastError": error.message,
            "metadata.provisioning.lastRecoveryAttemptAt": new Date(),
          },
        },
      );
    }
  }

  return {
    action: "created",
    wallet: wallet.toObject ? wallet.toObject() : wallet,
    target,
  };
}

async function syncProvisionedWalletSet(userId, wallets) {
  const balanceService = require("../balance/service");
  const nftService = require("../nft/service");
  const transactionService = require("../transaction/service");
  const {
    syncUtxoWallet,
  } = require("../chainAdapters/utxo/runtimeSync.service");
  const adaRecoveryService = require("../chainAdapters/ada/recovery.service");

  const results = await Promise.allSettled(
    wallets.map(async (wallet) => {
      const walletId = String(wallet._id || wallet.walletId);
      const chain = String(wallet.chain || "").toLowerCase();

      if (chain === "ada") {
        if (wallet.isImported === true) {
          try {
            await adaRecoveryService.completeDeferredAdaAccountDiscovery(
              walletId,
              {
                trigger: "provisioning_sync",
                reason: "wallet_created_or_imported",
              },
            );
          } catch (error) {
            logger.warn("Deferred ADA account discovery failed before runtime sync", {
              event: "ada_deferred_account_discovery_failed",
              walletId,
              chain: wallet.chain,
              network: wallet.network,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const syncResult = await syncUtxoWallet(walletId, {
          trigger: "provisioning_sync",
          reason: "wallet_created_or_imported",
          force: true,
          forceDiscovery: true,
        });

        if (!syncResult || syncResult.status !== "completed") {
          throw AppError.internal("ADA wallet runtime sync did not complete", {
            walletId,
            chain: wallet.chain,
            network: wallet.network,
            syncResult,
          });
        }

        return;
      }

      const syncResults = await Promise.allSettled([
        balanceService.getWalletBalance(userId, walletId, {
          force: true,
          trigger: "provisioning_sync",
        }),
        transactionService.syncWalletTransactions(userId, walletId, {
          force: true,
          trigger: "provisioning_sync",
        }),
        chain === "polygon"
          ? nftService.syncWalletNFTs({
              userId,
              walletId,
              force: true,
              trigger: "provisioning_sync",
            })
          : Promise.resolve(null),
      ]);

      const syncFailures = syncResults
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === "rejected")
        .map(({ result, index }) => ({
          step:
            index === 0
              ? "balance"
              : index === 1
                ? "transactions"
                : "nfts",
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        }));

      if (syncFailures.length > 0) {
        throw AppError.internal("Provisioned wallet sync did not fully complete", {
          walletId,
          chain: wallet.chain,
          network: wallet.network,
          syncFailures,
        });
      }
    }),
  );

  const failures = [];

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const wallet = wallets[index];
      failures.push({
        walletId: String(wallet._id || wallet.walletId),
        chain: wallet.chain,
        network: wallet.network,
        error: result.reason?.message || String(result.reason),
      });

      logger.error("Provisioning sync failed", {
        event: "wallet_provisioning_sync_failed",
        walletId: String(wallet._id || wallet.walletId),
        chain: wallet.chain,
        network: wallet.network,
        error: result.reason?.message || String(result.reason),
      });
      const chain = String(wallet.chain || "").toLowerCase();

      if (chain === "ada") {
        logger.error("ADA provisioning sync failed", {
          event: "ada_provisioning_sync_error",
          walletId: String(wallet._id || wallet.walletId),
          chain: wallet.chain,
          network: wallet.network,
          trigger: "provisioning_sync",
          reason: "wallet_created_or_imported",
          error: result.reason?.message || String(result.reason),
        });
      }
    }
  });

  return {
    success: failures.length === 0,
    failures,
  };
}

async function deferProvisionedWalletSetSync({
  userId,
  wallets,
  trigger = "wallet_import",
} = {}) {
  const walletIds = getProvisionedWalletIds(wallets);
  const deferredAt = new Date();

  if (!walletIds.length) {
    return {
      syncStatus: "pending",
      hydrationPending: true,
      syncMode: DEFERRED_PROVISIONING_SYNC_MODE,
      syncDeferredAt: deferredAt.toISOString(),
    };
  }

  try {
    await markProvisionedWalletSetSyncPending(wallets, {
      trigger,
      mode: DEFERRED_PROVISIONING_SYNC_MODE,
      deferredAt,
    });
  } catch (error) {
    logger.warn("Failed to mark provisioned wallet sync as pending", {
      event: "wallet_provisioning_sync_pending_mark_failed",
      userId: String(userId || ""),
      walletIds,
      trigger,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const syncKey = getDeferredProvisioningSyncKey(userId, walletIds);

  if (!deferredProvisioningSyncInFlight.has(syncKey)) {
    const deferredRequest = Promise.resolve()
      .then(async () => {
        logger.info("Provisioned wallet sync deferred", {
          event: "wallet_provisioning_sync_deferred",
          userId: String(userId || ""),
          walletIds,
          walletCount: walletIds.length,
          trigger,
          deferredAt,
          mode: DEFERRED_PROVISIONING_SYNC_MODE,
        });

        try {
          await updateProvisionedWalletSyncMetadata(wallets, {
            status: "in_progress",
            hydrationPending: true,
            trigger,
            mode: DEFERRED_PROVISIONING_SYNC_MODE,
            deferredAt,
            startedAt: new Date(),
            lastAttemptAt: new Date(),
            lastError: null,
          });
        } catch (error) {
          logger.warn("Failed to mark deferred provisioning sync as in progress", {
            event: "wallet_provisioning_sync_progress_mark_failed",
            userId: String(userId || ""),
            walletIds,
            trigger,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const syncResult = await syncProvisionedWalletSet(userId, wallets);

        try {
          await applyProvisionedWalletSyncOutcome(wallets, syncResult, {
            completedAt: new Date(),
          });
        } catch (error) {
          logger.warn("Failed to persist deferred provisioning sync outcome", {
            event: "wallet_provisioning_sync_outcome_mark_failed",
            userId: String(userId || ""),
            walletIds,
            trigger,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (Array.isArray(syncResult?.failures) && syncResult.failures.length) {
          logger.warn("Deferred provisioned wallet sync completed with failures", {
            event: "wallet_provisioning_sync_partial_failed",
            userId: String(userId || ""),
            walletIds,
            walletCount: walletIds.length,
            trigger,
            failureCount: syncResult.failures.length,
            failures: syncResult.failures,
          });
        } else {
          logger.info("Deferred provisioned wallet sync completed", {
            event: "wallet_provisioning_sync_completed",
            userId: String(userId || ""),
            walletIds,
            walletCount: walletIds.length,
            trigger,
          });
        }

        return syncResult;
      })
      .catch(async (error) => {
        logger.error("Deferred provisioned wallet sync failed", {
          event: "wallet_provisioning_sync_failed",
          userId: String(userId || ""),
          walletIds,
          walletCount: walletIds.length,
          trigger,
          error: error instanceof Error ? error.message : String(error),
        });

        try {
          await updateProvisionedWalletSyncMetadata(wallets, {
            status: "failed",
            hydrationPending: true,
            trigger,
            mode: DEFERRED_PROVISIONING_SYNC_MODE,
            deferredAt,
            completedAt: new Date(),
            lastAttemptAt: new Date(),
            lastError: error instanceof Error ? error.message : String(error),
          });
        } catch (metadataError) {
          logger.warn("Failed to persist deferred provisioning sync failure state", {
            event: "wallet_provisioning_sync_failure_mark_failed",
            userId: String(userId || ""),
            walletIds,
            trigger,
            error:
              metadataError instanceof Error
                ? metadataError.message
                : String(metadataError),
          });
        }
      })
      .finally(() => {
        deferredProvisioningSyncInFlight.delete(syncKey);
      });

    deferredProvisioningSyncInFlight.set(syncKey, deferredRequest);
  } else {
    logger.info("Deferred provisioned wallet sync already in flight", {
      event: "wallet_provisioning_sync_already_in_flight",
      userId: String(userId || ""),
      walletIds,
      walletCount: walletIds.length,
      trigger,
    });
  }

  return {
    syncStatus: "pending",
    hydrationPending: true,
    syncMode: DEFERRED_PROVISIONING_SYNC_MODE,
    syncDeferredAt: deferredAt.toISOString(),
  };
}

async function provisionSupportedWalletsForUser(input) {
  const {
    userId,
    accountId,
    mnemonic,
    encryptedRecoveryPhrase,
    primaryTarget,
    preferredLabel,
    mode,
    targets,
  } = input;
  const provisioningFeature = mode === "created" ? "create" : "import";
  const allDefaultTargets = filterAutoProvisionTargets(
    listAutoProvisionTargets(provisioningFeature),
  );
  const defaultTargets = shouldDefaultToPrimaryProvisioning()
    ? [primaryTarget]
    : allDefaultTargets;
  const requestedTargets =
    Array.isArray(targets) && targets.length ? targets : defaultTargets;
  const normalizedPrimaryTarget = normalizeProvisionTarget(
    primaryTarget,
    provisioningFeature,
  );
  let normalizedTargets = requestedTargets
    .map((target) => {
      try {
        return normalizeProvisionTarget(target, provisioningFeature);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);

  if (!normalizedTargets.length && requestedTargets !== defaultTargets) {
    normalizedTargets = defaultTargets
      .map((target) => {
        try {
          return normalizeProvisionTarget(target, provisioningFeature);
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
  }

  const orderedTargets = sortTargets(
    normalizedTargets,
    normalizedPrimaryTarget,
  );
  const provisioner =
    mode === "created" ? provisionCreateTarget : provisionImportTarget;
  const results = [];
  const provisioningStartedAt = Date.now();
  const [primaryProvisionTarget, ...remainingTargets] = orderedTargets;
  const accountScope = String(accountId || userId || "");

  logger.info("Wallet provisioning started", {
    event: "wallet_provision_started",
    mode,
    accountScope,
    targetCount: orderedTargets.length,
    concurrencyLimit: PROVISIONING_CONCURRENCY_LIMIT,
    primaryTarget: primaryProvisionTarget
      ? getTargetKey(primaryProvisionTarget)
      : null,
  });

  if (primaryProvisionTarget) {
    try {
      results.push(
        await provisioner({
          userId,
          accountId,
          target: primaryProvisionTarget,
          primaryTarget: normalizedPrimaryTarget,
          preferredLabel,
          encryptedRecoveryPhrase,
          mnemonic,
        }),
      );
    } catch (error) {
      logger.warn("Failed to provision wallet target", {
        event: "wallet_provision_target_failed",
        chain: primaryProvisionTarget.chain,
        network: primaryProvisionTarget.network,
        mode,
        isPrimaryTarget: true,
        error: error.message,
      });
      throw error;
    }
  }

  const settledSecondaryResults = await settleWithConcurrencyLimit(
    remainingTargets,
    PROVISIONING_CONCURRENCY_LIMIT,
    async (target) =>
      provisioner({
        userId,
        accountId,
        target,
        primaryTarget: normalizedPrimaryTarget,
        preferredLabel,
        encryptedRecoveryPhrase,
        mnemonic,
      }),
  );

  let failureCount = 0;

  settledSecondaryResults.forEach((settledResult, index) => {
    const target = remainingTargets[index];

    if (!settledResult || !target) {
      return;
    }

    if (settledResult.status === "fulfilled") {
      results.push(settledResult.value);
      return;
    }

    failureCount += 1;
    logger.warn("Failed to provision wallet target", {
      event: "wallet_provision_target_failed",
      chain: target.chain,
      network: target.network,
      mode,
      isPrimaryTarget: false,
      error: settledResult.reason?.message || String(settledResult.reason),
    });
  });

  const finalizedResults = await finalizeProvisionedWalletStates({
    userId,
    accountId,
    results,
    primaryTarget: normalizedPrimaryTarget,
  });
  const primaryWallet = finalizedResults.find((item) =>
    isSameTarget(item.target, normalizedPrimaryTarget),
  )?.wallet;
  if (!primaryWallet) {
    throw AppError.notFound("Primary wallet was not provisioned");
  }

  logger.info("Wallet provisioning completed", {
    event: "wallet_provision_completed",
    mode,
    accountScope,
    targetCount: orderedTargets.length,
    provisionedWalletCount: finalizedResults.length,
    failureCount,
    concurrencyLimit: PROVISIONING_CONCURRENCY_LIMIT,
    durationMs: Date.now() - provisioningStartedAt,
  });

  return {
    primaryWallet,
    wallets: finalizedResults.map((item) => item.wallet),
    results: finalizedResults,
    targets: orderedTargets,
  };
}

module.exports = {
  listAutoProvisionTargets,
  provisionSupportedWalletsForUser,
  syncProvisionedWalletSet,
  deferProvisionedWalletSetSync,
};
