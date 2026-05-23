const Wallet = require("./model");
const Account = require("../accounts/model");
const WalletCreationSession = require("../security/walletCreationSession.model");
const seedVault = require("../security/seedVault.service");
const mnemonicService = require("../security/mnemonic.service");
const qrService = require("./qr.service");
const provisioningService = require("./provisioning.service");
const paginate = require("../../helpers/pagination");
const { AppError } = require("../../helpers/errors");
const { defaultChain } = require("../../config/chains");
const {
  assertChainFeature,
  assertSupportedChainNetwork,
  getChainLabel,
  getExecutionParamLabels,
  getNetworkLabel,
  listSupportedChainMetadata,
  withRuntimeChainNetworkFilter,
} = require("../../common/utils/chain");
const {
  buildAddressExplorerUrl,
  buildExplorerMetadata,
} = require("../../common/utils/explorer");
const logger = require("../../common/utils/logger");
const { resolveSupportedAsset } = require("../../common/utils/assets");
const {
  getLegacyDestinationTag,
  mergeExecutionParams,
  normalizeExecutionParamsObject,
} = require("../../common/utils/executionParams");
const {
  buildWalletVisibilityFilter,
  getWalletState,
  isWalletArchived,
} = require("../../common/utils/walletState");
const AccountService = require("../accounts/service");

const operationsConfig = require("../../config/operations");

const CREATION_SESSION_TTL_MS = operationsConfig.session.creationTtlMs;
const ENCRYPTED_RECOVERY_PHRASE_SELECT =
  "+encryptedRecoveryPhrase.cipherText +encryptedRecoveryPhrase.iv +encryptedRecoveryPhrase.authTag";
const ENCRYPTED_ACCOUNT_MNEMONIC_SELECT =
  "+encryptedMnemonic.algorithm +encryptedMnemonic.cipherText +encryptedMnemonic.iv +encryptedMnemonic.authTag +encryptedMnemonic.keyVersion";
const walletCreationInitInFlight = new Map();
const AUTO_PROVISION_DEFAULT_SCOPE = String(
  process.env.WALLET_AUTO_PROVISION_DEFAULT_SCOPE || "primary",
)
  .trim()
  .toLowerCase();

function shouldDefaultToPrimaryProvisioning() {
  return !["all", "full", "legacy"].includes(AUTO_PROVISION_DEFAULT_SCOPE);
}

function buildPrimaryProvisioningTarget(chain, network) {
  return [{ chain, network, priority: 0 }];
}

// Edge case: Ensure accountId is properly set
async function ensureValidAccountId(userId, accountId) {
  if (!accountId) {
    // Get default account for backward compatibility
    const defaultAccount =
      await AccountService.ensureDefaultAccountForUser(userId);
    return defaultAccount._id;
  }

  // Validate account ownership
  const account = await AccountService.getAccountById(userId, accountId);
  if (!account) {
    throw AppError.validation("Account not found or access denied");
  }

  return accountId;
}

function toSafeWallet(wallet) {
  const addressExplorerUrl = buildAddressExplorerUrl(
    wallet.chain,
    wallet.network,
    wallet.address,
  );
  const walletState = getWalletState(wallet);

  return {
    walletId: String(wallet._id),
    accountId: wallet.accountId ? String(wallet.accountId) : null,
    chain: wallet.chain,
    chainLabel: getChainLabel(wallet.chain),
    asset: wallet.asset,
    address: wallet.address,
    publicKey: wallet.publicKey,
    network: wallet.network,
    networkLabel: getNetworkLabel(wallet.chain, wallet.network),
    createdAt: wallet.createdAt,
    isImported: wallet.isImported,
    label: wallet.label || "",
    sourceType: wallet.sourceType,
    metadata: wallet.metadata || {},
    isPrimary: walletState.isPrimary,
    isDefaultForChain: walletState.isDefaultForChain,
    hidden: walletState.hidden,
    archived: walletState.archived,
    explorerUrl: addressExplorerUrl,
    explorer: buildExplorerMetadata(wallet.chain, wallet.network, {
      address: wallet.address,
    }),
  };
}

function isSameTarget(a, b) {
  return a && b && a.chain === b.chain && a.network === b.network;
}

function getTargetPriority(target, fallback = Number.MAX_SAFE_INTEGER) {
  const priority = Number(target?.priority);
  return Number.isFinite(priority) ? priority : fallback;
}

function orderProvisioningTargets(primaryTarget, targets) {
  const ordered = [primaryTarget, ...(targets || [])]
    .filter(Boolean)
    .sort((a, b) => {
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

      return `${a.chain}:${a.network}`.localeCompare(`${b.chain}:${b.network}`);
    });
  const seen = new Set();

  return ordered.filter((target) => {
    const key = `${target.chain}:${target.network}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function resolveRequestedProvisioningTargets(input = {}) {
  const explicitTargets = Array.isArray(input.targets)
    ? input.targets
    : Array.isArray(input.provisioningTargets)
      ? input.provisioningTargets
      : [];

  return explicitTargets
    .map((target, index) => ({
      chain: String(target?.chain || "").toLowerCase(),
      network: String(target?.network || "").toLowerCase(),
      priority: Number.isFinite(Number(target?.priority))
        ? Number(target.priority)
        : index,
    }))
    .filter((target) => target.chain && target.network);
}

function buildProvisionedWalletResponse(provisioned) {
  const primaryWallet = toSafeWallet(provisioned.primaryWallet);

  return {
    ...primaryWallet,
    provisionedWallets: provisioned.wallets.map((wallet) =>
      toSafeWallet(wallet),
    ),
    provisionedWalletCount: provisioned.wallets.length,
    provisioningTargets: provisioned.targets,
  };
}

function getWalletCreationInitKey(userId, accountId, chain, network) {
  return `${String(userId)}:${String(accountId || "default")}:${chain}:${network}`;
}

async function findReusablePendingCreationSession(
  userId,
  accountId,
  chain,
  network,
) {
  return WalletCreationSession.findOne({
    userId,
    ...(accountId ? { accountId } : { accountId: null }),
    chain,
    network,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .select(ENCRYPTED_RECOVERY_PHRASE_SELECT);
}

function buildCreationSessionResponse(session, recoveryPhrase) {
  return {
    sessionId: String(session._id),
    accountId: session.accountId ? String(session.accountId) : null,
    recoveryPhrase,
    chain: session.chain,
    network: session.network,
    provisioningTargets: session.provisioningTargets || [],
    expiresAt: session.expiresAt,
  };
}

function normalizeReceiveAmount(context, amount) {
  if (amount === undefined || amount === null || amount === "") {
    return null;
  }

  const normalized = context.adapter.amount.normalizeDisplayAmount(amount);
  context.adapter.amount.toBaseUnits(normalized);
  return normalized;
}

function normalizeReceiveParams(input = {}) {
  const executionParams = normalizeExecutionParamsObject(
    input.executionParams,
    "executionParams",
  );
  const qrParams = normalizeExecutionParamsObject(input.qrParams, "qrParams");

  return {
    executionParams,
    qrParams,
  };
}

function resolveReceiveDestinationTag(input = {}) {
  return (
    getLegacyDestinationTag(input.qrParams) ??
    getLegacyDestinationTag(input.executionParams) ??
    null
  );
}

function resolveReceiveScanValue({ address }) {
  return String(address || "").trim();
}

async function resolveReceiveAddress(chainContext, wallet) {
  const resolver = chainContext.adapter?.wallet?.resolveReceiveAddress;
  if (typeof resolver !== "function") {
    return String(wallet?.address || "").trim();
  }

  const resolved = await resolver({
    walletId: wallet?._id,
    wallet,
    chain: wallet?.chain,
    network: wallet?.network,
    context: chainContext,
  });

  return String(resolved || wallet?.address || "").trim();
}

function buildReceiveQrPayload(
  chainContext,
  wallet,
  receiveAddress,
  assetDescriptor,
  amount,
  executionParams,
  qrParams,
  scanValue,
) {
  if (chainContext.features?.qr !== true) {
    return qrService.normalizeWalletQrPayload(scanValue, {
      format: "address",
      metadata: {
        fallback: true,
        chain: wallet.chain,
        network: wallet.network,
        address: receiveAddress,
        canonicalAddress: wallet.address,
        receiveAsset: assetDescriptor.asset,
        assetType: assetDescriptor.assetType,
        standard: assetDescriptor.standard,
        contractAddress: assetDescriptor.contractAddress,
      },
    });
  }

  return qrService.normalizeWalletQrPayload(
    chainContext.adapter.qr.buildQrPayload({
      address: receiveAddress,
      amount,
      executionParams,
      qrParams,
      asset: assetDescriptor.asset,
      assetDescriptor,
      wallet,
      chainContext,
    }),
    {
      format: "uri",
      metadata: {
        chain: wallet.chain,
        network: wallet.network,
        address: receiveAddress,
        canonicalAddress: wallet.address,
        receiveAsset: assetDescriptor.asset,
        assetType: assetDescriptor.assetType,
        standard: assetDescriptor.standard,
        contractAddress: assetDescriptor.contractAddress,
      },
    },
  );
}

async function resolveManagedReceiveExecutionParams(chainContext, wallet) {
  const resolver =
    chainContext.adapter?.wallet?.resolveManagedReceiveExecutionParams;
  if (typeof resolver !== "function") {
    return {};
  }

  return normalizeExecutionParamsObject(
    await resolver({
      walletId: wallet._id,
      wallet,
      chain: wallet.chain,
      network: wallet.network,
      context: chainContext,
    }),
    "managedExecutionParams",
  );
}

async function validateAccountOwnership(userId, accountId) {
  if (!accountId) {
    return null; // No accountId provided, will use default
  }

  const account = await AccountService.getAccountById(userId, accountId);
  return account;
}

async function getProvisioningAccountWithMnemonic(userId, accountId) {
  const account = await Account.findOne({
    _id: accountId,
    userId,
    status: "active",
  }).select(ENCRYPTED_ACCOUNT_MNEMONIC_SELECT);

  if (!account) {
    throw AppError.notFound("Account not found");
  }

  if (!account.encryptedMnemonic) {
    throw AppError.internal("Account mnemonic is unavailable for wallet provisioning");
  }

  return account;
}

async function inferAccountWalletProvisioningMode(userId, accountId) {
  const existingWallet = await Wallet.findOne({
    userId,
    accountId,
  })
    .sort({ createdAt: 1 })
    .lean();

  if (!existingWallet) {
    return "created";
  }

  if (existingWallet.isImported === true) {
    return "imported";
  }

  return String(existingWallet.sourceType || "").trim().toLowerCase() === "imported"
    ? "imported"
    : "created";
}

async function listUserWallets(userId, query) {
  const filters = {
    userId,
    ...buildWalletVisibilityFilter({
      includeHidden: query.includeHidden === "true",
      includeArchived: query.includeArchived === "true",
    }),
  };
  if (query.accountId) {
    filters.accountId = query.accountId;
  }
  if (query.chain) {
    filters.chain = query.chain;
  }
  if (query.network) {
    filters.network = query.network;
  }

  const result = await paginate(
    Wallet,
    withRuntimeChainNetworkFilter(filters),
    {
      page: query.page,
      limit: query.limit,
      searchFields: ["address", "label", "asset", "network"],
      searchTerm: query.search,
    },
  );

  return {
    data: result.data.map((wallet) => toSafeWallet(wallet)),
    meta: result.meta,
  };
}

async function generateRecoveryPhrase(userId, input) {
  const { chain, network } = assertChainFeature(
    input.chain || defaultChain,
    input.network,
    "create",
  );
  const targetAccountId = await ensureValidAccountId(userId, input.accountId);

  const requestKey = getWalletCreationInitKey(
    userId,
    targetAccountId,
    chain,
    network,
  );
  const existingRequest = walletCreationInitInFlight.get(requestKey);

  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const reusableSession = await findReusablePendingCreationSession(
      userId,
      targetAccountId,
      chain,
      network,
    );

    if (reusableSession) {
      const recoveryPhrase = seedVault.decryptSeed(
        reusableSession.encryptedRecoveryPhrase,
      );
      return buildCreationSessionResponse(reusableSession, recoveryPhrase);
    }

    const recoveryPhrase = await mnemonicService.generateMnemonic();
    const encryptedRecoveryPhrase = seedVault.encryptSeed(recoveryPhrase);
    const requestedTargets = resolveRequestedProvisioningTargets(input);
    const defaultTargets = shouldDefaultToPrimaryProvisioning()
      ? buildPrimaryProvisioningTarget(chain, network)
      : provisioningService.listAutoProvisionTargets("create");
    const provisioningTargets = orderProvisioningTargets(
      { chain, network },
      requestedTargets.length ? requestedTargets : defaultTargets,
    );

    const session = await WalletCreationSession.create({
      userId,
      ...(targetAccountId ? { accountId: targetAccountId } : {}),
      chain,
      network,
      encryptedRecoveryPhrase,
      label: input.label,
      provisioningTargets,
      status: "pending",
      expiresAt: new Date(Date.now() + CREATION_SESSION_TTL_MS),
    });

    return buildCreationSessionResponse(session, recoveryPhrase);
  })();

  walletCreationInitInFlight.set(requestKey, request);

  try {
    return await request;
  } finally {
    walletCreationInitInFlight.delete(requestKey);
  }
}

async function confirmWalletCreation(userId, input) {
  const { chain, network } = assertChainFeature(
    input.chain || defaultChain,
    input.network,
    "create",
  );

  // Edge case: Ensure accountId is properly set
  const targetAccountId = await ensureValidAccountId(userId, input.accountId);

  const session = await WalletCreationSession.findOne({
    _id: input.sessionId,
    userId,
    ...(targetAccountId ? { accountId: targetAccountId } : {}),
    chain,
    network,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).select(ENCRYPTED_RECOVERY_PHRASE_SELECT);

  if (!session) {
    throw AppError.notFound("Wallet creation session not found or expired");
  }

  const originalPhrase = seedVault.decryptSeed(session.encryptedRecoveryPhrase);
  const normalizedOriginal = mnemonicService.normalizeMnemonic(originalPhrase);
  const normalizedInput = mnemonicService.validateMnemonic(input.mnemonic);

  if (normalizedOriginal !== normalizedInput) {
    throw AppError.validation(
      "Mnemonic does not match the one provided during wallet creation",
    );
  }

  const provisioned =
    await provisioningService.provisionSupportedWalletsForUser({
      userId,
      accountId: targetAccountId,
      mnemonic: normalizedInput,
      encryptedRecoveryPhrase: session.encryptedRecoveryPhrase,
      primaryTarget: {
        chain,
        network,
      },
      preferredLabel: input.label || session.label,
      mode: "created",
      targets: session.provisioningTargets,
    });

  session.status = "confirmed";
  await session.save();

  logger.info("Wallet creation provisioning completed", {
    event: "wallet_create_confirm_provisioned",
    userId: String(userId),
    accountId: String(targetAccountId),
    chain,
    network,
    walletCount: provisioned.wallets.length,
    primaryWalletId: String(provisioned.primaryWallet?._id || ""),
    sessionId: String(session._id),
  });

  const deferredSync = await provisioningService.deferProvisionedWalletSetSync({
    userId,
    wallets: provisioned.wallets,
    trigger: "wallet_create_confirm",
  });

  return {
    ...buildProvisionedWalletResponse(provisioned),
    ...deferredSync,
    syncFailures: [],
  };
}

async function importWallet(userId, input) {
  const { chain, network } = assertChainFeature(
    input.chain || defaultChain,
    input.network,
    "import",
  );
  const { accountId } = input;

  // Validate account ownership if accountId is provided
  if (accountId) {
    await validateAccountOwnership(userId, accountId);
  }

  // If no accountId provided, get default account for backward compatibility
  const targetAccountId =
    accountId || (await AccountService.ensureDefaultAccountForUser(userId))._id;

  const normalizedMnemonic = mnemonicService.validateMnemonic(input.mnemonic);
  const encryptedRecoveryPhrase = seedVault.encryptSeed(normalizedMnemonic);
  const requestedTargets = resolveRequestedProvisioningTargets(input);
  const provisioned =
    await provisioningService.provisionSupportedWalletsForUser({
      userId,
      accountId: targetAccountId,
      mnemonic: normalizedMnemonic,
      encryptedRecoveryPhrase,
      primaryTarget: {
        chain,
        network,
      },
      preferredLabel: input.label,
      mode: "imported",
      targets: requestedTargets.length ? requestedTargets : undefined,
    });

  logger.info("Wallet import provisioning completed", {
    event: "wallet_import_provisioned",
    userId: String(userId),
    accountId: String(targetAccountId),
    chain,
    network,
    walletCount: provisioned.wallets.length,
    primaryWalletId: String(provisioned.primaryWallet?._id || ""),
  });

  const deferredSync = await provisioningService.deferProvisionedWalletSetSync({
    userId,
    wallets: provisioned.wallets,
    trigger: "wallet_import",
  });

  return {
    ...buildProvisionedWalletResponse(provisioned),
    ...deferredSync,
  };
}

async function createHbarWalletOnDemand(userId, input = {}) {
  const requestedNetwork =
    typeof input.network === "string" && input.network.trim()
      ? input.network.trim().toLowerCase()
      : undefined;
  const { chain, network } = assertChainFeature("hbar", requestedNetwork, "create");
  const targetAccountId = await ensureValidAccountId(userId, input.accountId);
  const account = await getProvisioningAccountWithMnemonic(userId, targetAccountId);
  const decryptedMnemonic = seedVault.decryptSeed(account.encryptedMnemonic);
  const normalizedMnemonic = mnemonicService.validateMnemonic(decryptedMnemonic);
  const encryptedRecoveryPhrase = seedVault.encryptSeed(normalizedMnemonic);
  const mode = await inferAccountWalletProvisioningMode(userId, targetAccountId);
  const provisioned = await provisioningService.provisionSupportedWalletsForUser({
    userId,
    accountId: targetAccountId,
    mnemonic: normalizedMnemonic,
    encryptedRecoveryPhrase,
    primaryTarget: {
      chain,
      network,
    },
    preferredLabel: input.label,
    mode,
    targets: [
      {
        chain,
        network,
      },
    ],
  });

  void provisioningService.syncProvisionedWalletSet(userId, provisioned.wallets).catch(() => null);

  return buildProvisionedWalletResponse(provisioned);
}

async function getWalletDetails(userId, walletId) {
  const wallet = await Wallet.findOne({
    _id: walletId,
    userId,
    ...buildWalletVisibilityFilter({ includeHidden: true }),
  }).lean();
  if (!wallet) {
    throw AppError.notFound("Wallet not found");
  }
  if (isWalletArchived(wallet)) {
    throw AppError.validation("Wallet is archived");
  }

  assertSupportedChainNetwork(wallet.chain, wallet.network);
  return toSafeWallet(wallet);
}

async function getReceivePayload(userId, input) {
  const wallet = await Wallet.findOne({
    _id: input.walletId,
    userId,
    ...buildWalletVisibilityFilter({ includeHidden: true }),
  }).lean();

  if (!wallet) {
    throw AppError.notFound("Wallet not found");
  }
  if (isWalletArchived(wallet)) {
    throw AppError.validation("Wallet is archived");
  }

  const chainContext = assertChainFeature(
    wallet.chain,
    wallet.network,
    "receive",
  );
  const assetDescriptor = resolveSupportedAsset(
    wallet.chain,
    wallet.network,
    input.asset,
  );
  const amount = normalizeReceiveAmount(chainContext, input.amount);
  const { executionParams: requestedExecutionParams, qrParams } =
    normalizeReceiveParams(input);
  const managedExecutionParams = await resolveManagedReceiveExecutionParams(
    chainContext,
    wallet,
  );
  const executionParams = mergeExecutionParams(
    managedExecutionParams,
    requestedExecutionParams,
  );
  const executionParamLabels = getExecutionParamLabels(
    wallet.chain,
    wallet.network,
  );
  const resolvedDestinationTag = resolveReceiveDestinationTag({
    executionParams,
    qrParams,
  });
  const receiveAddress = await resolveReceiveAddress(chainContext, wallet);
  const scanValue = resolveReceiveScanValue({
    address: receiveAddress,
  });
  const qr = buildReceiveQrPayload(
    chainContext,
    wallet,
    receiveAddress,
    assetDescriptor,
    amount,
    executionParams,
    qrParams,
    scanValue,
  );
  const addressExplorerUrl = buildAddressExplorerUrl(
    wallet.chain,
    wallet.network,
    wallet.address,
  );
  const tokenPayload =
    assetDescriptor.assetType === "token"
      ? {
          code: assetDescriptor.code,
          asset: assetDescriptor.asset,
          symbol: assetDescriptor.symbol,
          label: assetDescriptor.label,
          standard: assetDescriptor.standard,
          decimals: assetDescriptor.decimals,
          contractAddress: assetDescriptor.contractAddress,
          contractExplorerUrl: assetDescriptor.contractExplorerUrl,
          metadata: assetDescriptor.metadata || {},
        }
      : null;

  return {
    walletId: String(wallet._id),
    chain: wallet.chain,
    chainLabel: getChainLabel(wallet.chain),
    asset: wallet.asset,
    address: receiveAddress,
    network: wallet.network,
    networkLabel: getNetworkLabel(wallet.chain, wallet.network),
    receiveAsset: assetDescriptor.asset,
    receiveCurrency: assetDescriptor.symbol,
    assetType: assetDescriptor.assetType,
    assetContext: assetDescriptor,
    token: tokenPayload,
    amount,
    executionParams,
    executionParamLabels,
    qrParams,
    destinationTag: resolvedDestinationTag,
    supportsDestinationTag: Object.prototype.hasOwnProperty.call(
      executionParamLabels,
      "destinationTag",
    ),
    qrValue: qr.text,
    qr,
    scanValue,
    copyAddress: receiveAddress,
    copyTag: getLegacyDestinationTag(executionParams),
    explorerUrl: addressExplorerUrl,
    explorer: buildExplorerMetadata(wallet.chain, wallet.network, {
      address: wallet.address,
    }),
  };
}

async function generateReceiveQr(userId, input) {
  const payload = await getReceivePayload(userId, input);
  assertChainFeature(payload.chain, payload.network, "qr");
  const qrCode = await qrService.generateWalletQr({ payload: payload.qr });

  return {
    ...payload,
    qrCode,
  };
}

async function createWallet(userId, payload) {
  return generateRecoveryPhrase(userId, payload);
}

async function getSupportedChains() {
  return listSupportedChainMetadata();
}

module.exports = {
  listUserWallets,
  createWallet,
  generateRecoveryPhrase,
  confirmWalletCreation,
  importWallet,
  createHbarWalletOnDemand,
  getWalletDetails,
  getReceivePayload,
  generateReceiveQr,
  getSupportedChains,
};
