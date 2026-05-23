const Cardano = require("@emurgo/cardano-serialization-lib-nodejs");
const { blake2b } = require("@noble/hashes/blake2b");

const client = require("./client");
const amount = require("./amount");
const wallet = require("./wallet");
const utxo = require("../utxo");
const logger = require("../../../common/utils/logger");
const { normalizeTxHash } = require("../../../common/utils/txHash");
const { AppError } = require("../../../helpers/errors");

const DEFAULT_TTL_SLOT_BUFFER = 3600;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const ADA_ASSET_SYMBOL = "ADA";
const ADA_ADDRESS_TYPES = new Set([wallet.ADDRESS_TYPE, "enterprise"]);
const SUPPORTED_EXECUTION_PARAM_KEYS = new Set([]);


async function expandRuntimeContextForHistory(network, fromAddress, runtimeContext) {
  const walletRecord = runtimeContext?.walletRecord || null;
  const managedCount = Array.isArray(runtimeContext?.managedAddresses)
    ? runtimeContext.managedAddresses.length
    : 0;

  const shouldExpand =
    Boolean(walletRecord?._id) &&
    (
      walletRecord.isImported === true ||
      managedCount <= 3 ||
      String(walletRecord?.metadata?.provisioning?.status || "").trim() === "pending_recovery"
    );

  if (!shouldExpand) {
    return runtimeContext;
  }

  await discoverManagedAddressesByGapLimit({
    network,
    fromAddress,
    walletRecord,
    gapLimit: 20,
    maxReceiveScanCount: 128,
    maxChangeScanCount: 64,
  });

  return ensureRuntimeWalletContext({
    network,
    fromAddress,
    walletRecord,
    persistChangeAddress: false,
  });
} 
function normalizeAddress(address, label, network) {
  const normalized = String(address || "").trim();

  if (!wallet.validateAddress(normalized, network)) {
    throw AppError.validation(`Invalid ADA ${label}`);
  }

  return normalized;
}


function normalizeExecutionParams(input = {}) {
  const executionParams =
    input.executionParams && typeof input.executionParams === "object"
      ? { ...input.executionParams }
      : {};
  const unsupportedKeys = Object.keys(executionParams).filter(
    (key) => !SUPPORTED_EXECUTION_PARAM_KEYS.has(key),
  );

  if (unsupportedKeys.length) {
    throw AppError.validation(
      `ADA transfers do not support execution params: ${unsupportedKeys.join(", ")}`,
    );
  }

  return {};
}

function normalizeHistoryLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function normalizeQuantity(value, fieldName) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw AppError.internal(`Invalid ADA protocol field "${fieldName}"`);
  }

  return normalized;
}

function normalizeProtocolParameters(protocolParameters = {}) {
  const coinsPerUtxoSize = String(
    protocolParameters.coins_per_utxo_size ?? "",
  ).trim();
  const legacyCoinsPerWord = String(
    protocolParameters.coins_per_utxo_word ?? "",
  ).trim();

  let coinsPerUtxoByte = "";
  if (/^\d+$/.test(coinsPerUtxoSize)) {
    coinsPerUtxoByte = coinsPerUtxoSize;
  } else if (/^\d+$/.test(legacyCoinsPerWord)) {
    coinsPerUtxoByte = String(
      Math.max(Math.ceil(Number(legacyCoinsPerWord) / 8), 1),
    );
  } else {
    throw AppError.internal(
      'ADA protocol parameters are missing "coins_per_utxo_size"',
    );
  }

  return {
    minFeeA: normalizeQuantity(protocolParameters.min_fee_a, "min_fee_a"),
    minFeeB: normalizeQuantity(protocolParameters.min_fee_b, "min_fee_b"),
    maxTxSize: Number.parseInt(
      normalizeQuantity(protocolParameters.max_tx_size, "max_tx_size"),
      10,
    ),
    maxValueSize: Number.parseInt(
      normalizeQuantity(protocolParameters.max_val_size, "max_val_size"),
      10,
    ),
    keyDeposit: normalizeQuantity(
      protocolParameters.key_deposit,
      "key_deposit",
    ),
    poolDeposit: normalizeQuantity(
      protocolParameters.pool_deposit,
      "pool_deposit",
    ),
    coinsPerUtxoByte,
  };
}

function createBigNum(value) {
  return Cardano.BigNum.from_str(String(value));
}

function createBuilder(protocolParameters) {
  const normalized = normalizeProtocolParameters(protocolParameters);
  const config = Cardano.TransactionBuilderConfigBuilder.new()
    .fee_algo(
      Cardano.LinearFee.new(
        createBigNum(normalized.minFeeA),
        createBigNum(normalized.minFeeB),
      ),
    )
    .pool_deposit(createBigNum(normalized.poolDeposit))
    .key_deposit(createBigNum(normalized.keyDeposit))
    .max_value_size(normalized.maxValueSize)
    .max_tx_size(normalized.maxTxSize)
    .coins_per_utxo_byte(createBigNum(normalized.coinsPerUtxoByte))
    .build();

  return {
    builder: Cardano.TransactionBuilder.new(config),
    protocolParameters: normalized,
  };
}

function createAdaValue(baseUnits) {
  return Cardano.Value.new(createBigNum(baseUnits));
}



function hasNativeAssets(amounts = []) {
  if (!Array.isArray(amounts)) {
    return false;
  }

  return amounts.some(
    (entry) =>
      String(entry?.unit || "")
        .trim()
        .toLowerCase() !== "lovelace",
  );
}

function isSpendableUtxo(entry = {}) {
  const txHash = normalizeTxHash(entry.txHash);
  const outputIndex = Number(entry.outputIndex);
  const lovelace = BigInt(String(entry.lovelace || "0"));

  return (
    /^[a-f0-9]{64}$/i.test(txHash) &&
    Number.isInteger(outputIndex) &&
    outputIndex >= 0 &&
    lovelace > 0n &&
    !entry.hasNativeAssets &&
    ADA_ADDRESS_TYPES.has(String(entry.addressType || wallet.ADDRESS_TYPE))
  );
}

function normalizeUtxos(utxos = []) {
  return utxos
    .filter((entry) => {
      try {
        return isSpendableUtxo(entry);
      } catch (_error) {
        return false;
      }
    })
    .sort((a, b) => {
      const lovelaceA = BigInt(String(a.lovelace));
      const lovelaceB = BigInt(String(b.lovelace));
      if (lovelaceA !== lovelaceB) {
        return lovelaceA < lovelaceB ? -1 : 1;
      }

      const branchA = Number(a.branch ?? 0);
      const branchB = Number(b.branch ?? 0);
      if (branchA !== branchB) {
        return branchA - branchB;
      }

      const indexA = Number(a.addressIndex ?? 0);
      const indexB = Number(b.addressIndex ?? 0);
      if (indexA !== indexB) {
        return indexA - indexB;
      }

      if (a.txHash !== b.txHash) {
        return a.txHash.localeCompare(b.txHash);
      }

      return a.outputIndex - b.outputIndex;
    });
}

function serializeValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeValue(nested),
      ]),
    );
  }

  return value;
}

function normalizeChainTimestamp(value) {
  if (!value && value !== 0) {
    return undefined;
  }

  const timestamp = new Date(Number(value) * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function computeConfirmations(blockHeight, tipHeight) {
  const normalizedBlockHeight = Number(blockHeight || 0);
  const normalizedTipHeight = Number(tipHeight || 0);

  if (!Number.isFinite(normalizedBlockHeight) || normalizedBlockHeight <= 0) {
    return 0;
  }

  if (!Number.isFinite(normalizedTipHeight) || normalizedTipHeight <= 0) {
    return 1;
  }

  return Math.max(normalizedTipHeight - normalizedBlockHeight + 1, 1);
}

function buildOutput(address, amountBaseUnits) {
  return Cardano.TransactionOutput.new(
    Cardano.Address.from_bech32(address),
    createAdaValue(amountBaseUnits),
  );
}

function computeMinimumOutputBaseUnits(output, protocolParameters) {
  return Cardano.min_ada_for_output(
    output,
    Cardano.DataCost.new_coins_per_byte(
      createBigNum(protocolParameters.coinsPerUtxoByte),
    ),
  ).to_str();
}

function parseSlot(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveTtlSlot(latestBlock) {
  const slot = parseSlot(latestBlock?.slot);
  if (!slot) {
    return null;
  }

  return slot + DEFAULT_TTL_SLOT_BUFFER;
}

function extractErrorMessage(error, fallback = "Cardano request failed") {
  const candidates = [
    error?.response?.data?.message,
    error?.response?.data?.error,
    error?.data?.message,
    error?.message,
    error?.reason,
    error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

function buildRpcError(error, fallbackMessage) {
  if (error instanceof AppError) {
    return error;
  }

  const reason = extractErrorMessage(error, fallbackMessage);
  const normalizedReason = reason.toLowerCase();

  if (
    normalizedReason.includes("insufficient") ||
    normalizedReason.includes("shortage")
  ) {
    return AppError.validation(
      "Insufficient ADA balance to cover the amount and network fee",
    );
  }

  if (
    normalizedReason.includes("invalid") &&
    normalizedReason.includes("address")
  ) {
    return AppError.validation("Invalid ADA destination address");
  }

  if (
    normalizedReason.includes("utxo") &&
    normalizedReason.includes("not found")
  ) {
    return AppError.conflict(
      "The selected ADA inputs are no longer available. Please try again",
    );
  }

  if (
    normalizedReason.includes("network") ||
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("fetch") ||
    normalizedReason.includes("http") ||
    normalizedReason.includes("blockfrost")
  ) {
    return new AppError("Cardano provider is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError(fallbackMessage, {
    status: 502,
    errors: { reason },
  });
}

function isInsufficientBuilderError(error) {
  const reason = extractErrorMessage(error, "");
  const normalized = reason.toLowerCase();

  return (
    normalized.includes("insufficient input in transaction") ||
    normalized.includes("shortage")
  );
}

function assertNativeAdaAsset(input = {}) {
  const asset = String(
    input.asset || input.assetDescriptor?.asset || ADA_ASSET_SYMBOL,
  )
    .trim()
    .toUpperCase();
  const assetType = String(input.assetDescriptor?.assetType || "native")
    .trim()
    .toLowerCase();

  if (asset !== ADA_ASSET_SYMBOL || assetType !== "native") {
    throw AppError.validation("ADA adapter only supports native ADA transfers");
  }
}

async function resolveOwnerWallet(network, fromAddress) {
  return utxo.resolveWalletRecord({
    chain: "ada",
    network,
    walletAddress: fromAddress,
    select: "_id userId accountId chain network address metadata",
  });
}

function buildPrimaryManagedAddress(fromAddress) {
  return {
    address: String(fromAddress || "").trim(),
    branch: wallet.EXTERNAL_BRANCH,
    addressIndex: wallet.RECEIVE_ADDRESS_INDEX,
    derivationPath: wallet.getPaymentDerivationPath(
      wallet.EXTERNAL_BRANCH,
      wallet.RECEIVE_ADDRESS_INDEX,
    ),
    addressType: wallet.ADDRESS_TYPE,
    purpose: "receive",
    isActive: true,
    isChange: false,
    status: "active",
  };
}

async function probeManagedAddressChainState(network, address) {
  const adaClient = client.getClient(network);
  const [addressInfo, utxos] = await Promise.all([
    adaClient.fetchAddressInfo(address).catch(() => null),
    adaClient.fetchAddressUtxos(address).catch(() => []),
  ]);

  return {
    exists: Boolean(addressInfo),
    balance: addressInfo ? amount.resolveLovelaceBalance(addressInfo.amount) : "0",
    utxoCount: Array.isArray(utxos) ? utxos.length : 0,
  };
}

function deriveManagedAddressFromWalletRecord(
  walletRecord,
  network,
  {
    branch = wallet.EXTERNAL_BRANCH,
    addressIndex = wallet.RECEIVE_ADDRESS_INDEX,
    purpose = branch === wallet.CHANGE_BRANCH ? "change" : "receive",
    isChange = branch === wallet.CHANGE_BRANCH,
    addressType = branch === wallet.STAKE_BRANCH
      ? wallet.REWARD_ADDRESS_TYPE
      : wallet.ADDRESS_TYPE,
  } = {},
) {
  const derivation = walletRecord?.metadata?.derivation;
  const accountPublicKeyBech32 = String(
    derivation?.accountPublicKeyBech32 || "",
  ).trim();
  const stakePublicKeyBech32 = String(
    derivation?.stakePublicKeyBech32 || "",
  ).trim();
  const accountIndex = Number.isFinite(Number(derivation?.account))
    ? Number(derivation.account)
    : null;

  if (!accountPublicKeyBech32) {
    return null;
  }

  return wallet.deriveManagedAddressFromAccountPublicKey(
    accountPublicKeyBech32,
    network,
    {
      stakePublicKeyBech32,
      accountIndex,
      branch,
      addressIndex,
      purpose,
      isChange,
      addressType,
    },
  );
}

function deriveChangeAddressFromWalletRecord(walletRecord, network) {
  return deriveManagedAddressFromWalletRecord(walletRecord, network, {
    branch: wallet.CHANGE_BRANCH,
    addressIndex: wallet.CHANGE_ADDRESS_INDEX,
    purpose: "change",
    isChange: true,
  });
}

async function ensureAdaWalletIndexed(network, fromAddress, walletRecord = null) {
  return utxo.ensureWalletIndexed({
    chain: "ada",
    network,
    walletAddress: fromAddress,
    walletRecord,
    validateAddress: wallet.validateAddress,
    deriveManagedAddresses: ({ walletRecord: resolvedWallet, walletAddress }) => {
      const managedAddresses = [buildPrimaryManagedAddress(walletAddress)];
      const derivedChangeAddress = deriveChangeAddressFromWalletRecord(
        resolvedWallet,
        network,
      );

      if (derivedChangeAddress?.address) {
        managedAddresses.push({
          ...(derivedChangeAddress.managedAddress || {}),
          address: derivedChangeAddress.address,
          derivationPath: derivedChangeAddress.derivationPath,
          branch: derivedChangeAddress.branch,
          addressIndex: derivedChangeAddress.addressIndex,
          addressType: derivedChangeAddress.addressType,
          purpose: derivedChangeAddress.purpose,
          isChange: derivedChangeAddress.isChange,
          isActive: true,
          status: "active",
        });
      }

      return managedAddresses;
    },
  });
}

function buildManagedPaymentDiscoveryOptions(
  network,
  fromAddress,
  walletRecord = null,
) {
  return {
    chain: "ada",
    network,
    walletAddress: fromAddress,
    walletRecord,
    validateAddress: wallet.validateAddress,
    acceptedAddressTypes: ADA_ADDRESS_TYPES,
    includePurposes: ["receive", "change"],
    defaultManagedAddresses: [buildPrimaryManagedAddress(fromAddress)],
    ensureIndexed: ({ walletRecord: resolvedWallet }) =>
      ensureAdaWalletIndexed(network, fromAddress, resolvedWallet),
  };
}

async function ensureRuntimeWalletContext(input = {}) {
  const network = client.normalizeNetwork(input.network);
  const fromAddress = String(
    input.fromAddress || input.address || input.wallet?.address || "",
  ).trim();

  if (!wallet.validateAddress(fromAddress, network)) {
    return {
      walletRecord: null,
      managedAddresses: [],
      addressSet: new Set(),
      changeAddress: null,
    };
  }

  const walletRecord =
    input.walletRecord ||
    input.wallet ||
    (await resolveOwnerWallet(network, fromAddress));

  await ensureAdaWalletIndexed(network, fromAddress, walletRecord);

  const changeAddress = await resolveDedicatedChangeAddress(
    network,
    fromAddress,
    String(input.mnemonic || "").trim(),
    {
      persist: input.persistChangeAddress === true,
    },
  );

  const discovery = await utxo.discoverManagedAddresses(
    buildManagedPaymentDiscoveryOptions(
      network,
      fromAddress,
      walletRecord,
    ),
  );

  return {
    walletRecord: discovery.walletRecord,
    managedAddresses: discovery.managedAddresses,
    addressSet: discovery.addressSet,
    changeAddress,
  };
}

async function discoverManagedAddressesByGapLimit(input = {}) {
  const network = client.normalizeNetwork(input.network);
  const walletAddress = String(
    input.fromAddress || input.address || input.wallet?.address || "",
  ).trim();

  if (!wallet.validateAddress(walletAddress, network)) {
    return {
      walletRecord: null,
      gapLimit: Math.max(Number(input.gapLimit) || 20, 1),
      rows: [],
      branchSummaries: [],
      discoveredManagedAddresses: [],
    };
  }

  const walletRecord =
    input.walletRecord ||
    input.wallet ||
    (await resolveOwnerWallet(network, walletAddress));

  return utxo.discoverAddressesByGapLimit({
    chain: "ada",
    network,
    walletAddress,
    walletRecord,
    gapLimit: input.gapLimit,
    branchPlans: [
      {
        branch: wallet.EXTERNAL_BRANCH,
        purpose: "receive",
        isChange: false,
        startIndex: 0,
        minScanCount: 1,
        maxScanCount: Number(input.maxReceiveScanCount || 128),
        addressType: wallet.ADDRESS_TYPE,
      },
      {
        branch: wallet.CHANGE_BRANCH,
        purpose: "change",
        isChange: true,
        startIndex: 0,
        minScanCount: 1,
        maxScanCount: Number(input.maxChangeScanCount || 64),
        addressType: wallet.ADDRESS_TYPE,
      },
    ],
    validateAddress: wallet.validateAddress,
    deriveManagedAddress: ({ walletRecord, branch, addressIndex, plan }) =>
      deriveManagedAddressFromWalletRecord(walletRecord, network, {
        branch,
        addressIndex,
        purpose: plan.purpose,
        isChange: plan.isChange === true,
        addressType: plan.addressType,
      }),
    probeAddressState: ({ address }) =>
      probeManagedAddressChainState(network, address),
  });
}

async function resolveDedicatedChangeAddress(
  network,
  fromAddress,
  mnemonic = "",
  { persist = false } = {},
) {
  return utxo.getNextChangeAddress({
    chain: "ada",
    network,
    walletAddress: fromAddress,
    mnemonic,
    persist,
    validateAddress: wallet.validateAddress,
    changeBranch: wallet.CHANGE_BRANCH,
    changeAddressIndex: wallet.CHANGE_ADDRESS_INDEX,
    purpose: "change",
    isChange: true,
    deriveChangeAddressFromWallet: ({ walletRecord }) =>
      deriveChangeAddressFromWalletRecord(walletRecord, network),
    deriveChangeAddressFromMnemonic: ({ mnemonic: changeMnemonic }) =>
      wallet.deriveManagedAddressFromMnemonic(changeMnemonic, network, {
        branch: wallet.CHANGE_BRANCH,
        addressIndex: wallet.CHANGE_ADDRESS_INDEX,
        purpose: "change",
        isChange: true,
      }),
    logLabel: "ADA",
  });
}

async function resolveManagedPaymentAddresses(
  walletRecord,
  network,
  fromAddress,
) {
  const discovery = await utxo.getManagedAddresses(
    buildManagedPaymentDiscoveryOptions(
      network,
      fromAddress,
      walletRecord,
    ),
  );

  return discovery.managedAddresses;
}

async function resolveManagedPaymentContext(network, fromAddress) {
  return utxo.discoverManagedAddresses(
    buildManagedPaymentDiscoveryOptions(network, fromAddress),
  );
}


async function fetchManagedHistoryEntries(
  network,
  fromAddress,
  limit = DEFAULT_HISTORY_LIMIT,
) {
  const normalizedLimit = normalizeHistoryLimit(limit);

  let runtimeContext = await ensureRuntimeWalletContext({
    network,
    fromAddress,
    persistChangeAddress: false,
  });

  runtimeContext = await expandRuntimeContextForHistory(
    network,
    fromAddress,
    runtimeContext,
  );

  const discovery = {
    walletRecord: runtimeContext.walletRecord,
    managedAddresses: runtimeContext.managedAddresses,
    addressSet: runtimeContext.addressSet,
  };

  const adaClient = client.getClient(network);
  const tipBlock = await adaClient.fetchLatestBlock().catch(() => null);
  const tipHeight = Number(tipBlock?.height || 0) || 0;

  return utxo.syncWalletHistory({
    chain: "ada",
    network,
    walletAddress: fromAddress,
    limit: normalizedLimit,
    defaultLimit: DEFAULT_HISTORY_LIMIT,
    maxLimit: MAX_HISTORY_LIMIT,
    discoverManagedAddresses: async () => discovery,
    fetchAddressReferences: async ({ addressEntry }) =>
      adaClient
        .fetchAddressTransactions(addressEntry.address, normalizedLimit, 1, "desc")
        .catch(() => []),
    buildReferenceIdentity: ({ reference }) =>
      normalizeTxHash(reference?.tx_hash || reference?.txHash),
    fetchDetailedHistoryEntry: async ({ referenceIdentity, referenceEntry, discovery }) => {
      const [tx, utxos] = await Promise.all([
        adaClient.fetchTransaction(referenceIdentity).catch(() => null),
        adaClient.fetchTransactionUtxos(referenceIdentity).catch(() => null),
      ]);

      if (
        !tx ||
        !utxos ||
        !Array.isArray(utxos.inputs) ||
        !Array.isArray(utxos.outputs)
      ) {
        return null;
      }

      return {
        txHash: referenceIdentity,
        network,
        walletAddress: fromAddress,
        walletAddresses: discovery.managedAddresses.map((entry) => entry.address),
        managedAddresses: discovery.managedAddresses.map((entry) => ({
          address: entry.address,
          branch: entry.branch,
          addressIndex: entry.addressIndex,
          derivationPath: entry.derivationPath,
          addressType: entry.addressType,
          purpose: entry.purpose,
          isChange: entry.isChange === true,
        })),
        changeAddresses: discovery.managedAddresses
          .filter((entry) => entry.isChange === true)
          .map((entry) => entry.address),
        referenceAddress: referenceEntry?.addressEntry?.address || null,
        addressSet: Array.from(discovery.addressSet || []),
        tipHeight,
        reference: serializeValue(referenceEntry?.reference || {}),
        tx: serializeValue(tx),
        utxos: serializeValue(utxos),
        blockHeight: Number(tx.block_height || 0) || undefined,
        confirmations: computeConfirmations(tx.block_height, tipHeight),
        chainTimestamp: normalizeChainTimestamp(tx.block_time),
      };
    },
    sortEntries: (a, b) => {
      const timeA = a.chainTimestamp ? a.chainTimestamp.getTime() : 0;
      const timeB = b.chainTimestamp ? b.chainTimestamp.getTime() : 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }

      const heightA = Number(a.blockHeight || 0);
      const heightB = Number(b.blockHeight || 0);
      if (heightA !== heightB) {
        return heightB - heightA;
      }

      return a.txHash.localeCompare(b.txHash);
    },
  });
}

async function fetchManagedUtxos(network, fromAddress, runtimeContext = null) {
  const resolvedRuntimeContext =
    runtimeContext ||
    (await ensureRuntimeWalletContext({
      network,
      fromAddress,
      persistChangeAddress: false,
    }));
  const discovery = {
    walletRecord: resolvedRuntimeContext.walletRecord,
    managedAddresses: resolvedRuntimeContext.managedAddresses,
  };
  const adaClient = client.getClient(network);
  const settled = await Promise.all(
    discovery.managedAddresses.map(async (entry) => ({
      entry,
      utxos: await adaClient.fetchAddressUtxos(entry.address).catch(() => []),
    })),
  );

  const flattened = [];
  let nativeAssetBearingCount = 0;

  for (const { entry, utxos } of settled) {
    for (const utxo of Array.isArray(utxos) ? utxos : []) {
      const containsNativeAssets = hasNativeAssets(utxo.amount);
      if (containsNativeAssets) {
        nativeAssetBearingCount += 1;
      }

      flattened.push({
        address: entry.address,
        branch: entry.branch,
        addressIndex: entry.addressIndex,
        derivationPath: entry.derivationPath,
        addressType: entry.addressType || wallet.ADDRESS_TYPE,
        purpose: entry.purpose || "receive",
        isChange: entry.isChange === true,
        txHash: normalizeTxHash(utxo.tx_hash),
        outputIndex: Number(utxo.output_index),
        lovelace: amount.resolveLovelaceBalance(utxo.amount),
        hasNativeAssets: containsNativeAssets,
        raw: utxo,
      });
    }
  }

  return {
    walletRecord: discovery.walletRecord,
    utxos: normalizeUtxos(flattened),
    nativeAssetBearingCount,
  };
}

function buildPreviewOutput(address, amountBaseUnits) {
  return {
    address,
    amountBaseUnits: String(amountBaseUnits),
    amount: amount.fromBaseUnits(String(amountBaseUnits)),
  };
}

function prepareRecipientOutput(
  toAddress,
  amountBaseUnits,
  protocolParameters,
) {
  const output = buildOutput(toAddress, amountBaseUnits);
  const minimumBaseUnits = computeMinimumOutputBaseUnits(
    output,
    protocolParameters,
  );
  const normalizedAmount = BigInt(String(amountBaseUnits));
  const normalizedMinimum = BigInt(String(minimumBaseUnits));

  if (normalizedAmount < normalizedMinimum) {
    throw AppError.validation(
      `ADA amount must be at least ${amount.fromBaseUnits(minimumBaseUnits)} ADA for this output`,
    );
  }

  return {
    output,
    minimumBaseUnits,
  };
}

function applyUtxosToBuilder(builder, selectedUtxos) {
  for (const utxo of selectedUtxos) {
    const paymentCredential = Cardano.Address.from_bech32(
      utxo.address,
    ).payment_cred();
    const keyHash = paymentCredential?.to_keyhash?.();
    if (!keyHash) {
      throw AppError.validation(
        `Unable to use ADA UTXO from address ${utxo.address}`,
      );
    }

    builder.add_key_input(
      keyHash,
      Cardano.TransactionInput.new(
        Cardano.TransactionHash.from_hex(utxo.txHash),
        utxo.outputIndex,
      ),
      createAdaValue(utxo.lovelace),
    );
  }
}

function summarizeOutputs(outputs, toAddress) {
  const entries = [];

  for (let index = 0; index < outputs.len(); index += 1) {
    const entry = outputs.get(index);
    const addressText = entry.address().to_bech32();
    const coin = entry.amount().coin().to_str();
    entries.push({
      address: addressText,
      amountBaseUnits: coin,
      amount: amount.fromBaseUnits(coin),
      isRecipient: addressText === toAddress,
    });
  }

  return entries;
}

function buildUnsafeAdaSelectionError(message, reason, details = {}) {
  const error = AppError.validation(message, {
    reason,
    ...details,
  });
  error.adaUnsafeSelection = true;
  error.adaUnsafeSelectionReason = reason;
  return error;
}

function isUnsafeAdaSelectionError(error) {
  return Boolean(error?.adaUnsafeSelection);
}

function findChangeOutput(outputs = [], toAddress, changeAddress) {
  return (
    outputs.find(
      (entry) =>
        entry?.address === changeAddress &&
        entry.address !== toAddress &&
        entry.isRecipient !== true,
    ) || null
  );
}

function validateChangeSafety({
  network,
  fromAddress,
  toAddress,
  changeAddress,
  selectedUtxos,
  recipientAmountBaseUnits,
  protocolParameters,
  networkFeeBaseUnits,
  outputs,
  changeAdded,
}) {
  const totalInputBaseUnits = selectedUtxos.reduce(
    (sum, entry) => sum + BigInt(String(entry.lovelace || "0")),
    0n,
  );
  const normalizedRecipientAmountBaseUnits = BigInt(
    String(recipientAmountBaseUnits || "0"),
  );
  const normalizedFeeBaseUnits = BigInt(String(networkFeeBaseUnits || "0"));
  const computedChangeBaseUnits =
    totalInputBaseUnits - normalizedRecipientAmountBaseUnits - normalizedFeeBaseUnits;
  const changeOutput = findChangeOutput(outputs, toAddress, changeAddress);
  const changeOutputBaseUnits = BigInt(
    String(changeOutput?.amountBaseUnits || "0"),
  );
  const changeMinimumBaseUnits =
    computedChangeBaseUnits > 0n
      ? BigInt(
          computeMinimumOutputBaseUnits(
            buildOutput(changeAddress, computedChangeBaseUnits.toString()),
            protocolParameters,
          ),
        )
      : 0n;
  const logContext = {
    event: "ada_transaction_selection_rejected",
    chain: "ada",
    network,
    fromAddress,
    toAddress,
    changeAddress,
    selectedInputCount: selectedUtxos.length,
    totalSelectedInputBaseUnits: totalInputBaseUnits.toString(),
    recipientAmountBaseUnits: normalizedRecipientAmountBaseUnits.toString(),
    estimatedFeeBaseUnits: normalizedFeeBaseUnits.toString(),
    computedLeftoverBaseUnits: computedChangeBaseUnits.toString(),
    builderChangeAdded: Boolean(changeAdded),
    actualChangeOutputBaseUnits: changeOutputBaseUnits.toString(),
    minimumChangeOutputBaseUnits: changeMinimumBaseUnits.toString(),
  };

  if (computedChangeBaseUnits < 0n) {
    logger.warn("Rejected unsafe ADA transaction selection", {
      ...logContext,
      rejectionReason: "negative_leftover_after_fee",
    });
    throw buildUnsafeAdaSelectionError(
      "Failed to build a safe ADA transaction with the selected inputs",
      "negative_leftover_after_fee",
      {
        computedLeftoverBaseUnits: computedChangeBaseUnits.toString(),
      },
    );
  }

  if (computedChangeBaseUnits === 0n) {
    if (changeOutputBaseUnits > 0n) {
      logger.warn("Rejected unsafe ADA transaction selection", {
        ...logContext,
        rejectionReason: "unexpected_change_with_zero_leftover",
      });
      throw buildUnsafeAdaSelectionError(
        "Failed to build a safe ADA transaction with the selected inputs",
        "unexpected_change_with_zero_leftover",
        {
          actualChangeOutputBaseUnits: changeOutputBaseUnits.toString(),
        },
      );
    }

    return {
      totalInputBaseUnits: totalInputBaseUnits.toString(),
      computedChangeBaseUnits: "0",
      changeMinimumBaseUnits: "0",
      changeOutput,
    };
  }

  if (!changeOutput) {
    const reason =
      computedChangeBaseUnits < changeMinimumBaseUnits
        ? "change_below_minimum_output"
        : "missing_required_change_output";
    const message =
      reason === "change_below_minimum_output"
        ? "The remaining ADA change is too small to create a valid change output. Adjust the send amount and try again."
        : "This ADA transfer would omit a required change output and consume the remaining balance as network fee. Adjust the send amount and try again.";

    logger.warn("Rejected unsafe ADA transaction selection", {
      ...logContext,
      rejectionReason: reason,
    });
    throw buildUnsafeAdaSelectionError(message, reason, {
      computedLeftoverBaseUnits: computedChangeBaseUnits.toString(),
      minimumChangeOutputBaseUnits: changeMinimumBaseUnits.toString(),
    });
  }

  if (changeOutputBaseUnits !== computedChangeBaseUnits) {
    logger.warn("Rejected unsafe ADA transaction selection", {
      ...logContext,
      rejectionReason: "change_output_mismatch",
    });
    throw buildUnsafeAdaSelectionError(
      "Failed to build a safe ADA change output. Adjust the send amount and try again.",
      "change_output_mismatch",
      {
        computedLeftoverBaseUnits: computedChangeBaseUnits.toString(),
        actualChangeOutputBaseUnits: changeOutputBaseUnits.toString(),
      },
    );
  }

  if (changeOutputBaseUnits < changeMinimumBaseUnits) {
    logger.warn("Rejected unsafe ADA transaction selection", {
      ...logContext,
      rejectionReason: "change_output_below_minimum_output",
    });
    throw buildUnsafeAdaSelectionError(
      "The remaining ADA change is too small to create a valid change output. Adjust the send amount and try again.",
      "change_output_below_minimum_output",
      {
        actualChangeOutputBaseUnits: changeOutputBaseUnits.toString(),
        minimumChangeOutputBaseUnits: changeMinimumBaseUnits.toString(),
      },
    );
  }

  return {
    totalInputBaseUnits: totalInputBaseUnits.toString(),
    computedChangeBaseUnits: computedChangeBaseUnits.toString(),
    changeMinimumBaseUnits: changeMinimumBaseUnits.toString(),
    changeOutput,
  };
}

function buildUnsignedTransaction({
  network,
  fromAddress,
  protocolParameters,
  latestBlock,
  selectedUtxos,
  toAddress,
  amountBaseUnits,
  changeAddress,
}) {
  const { builder, protocolParameters: normalizedProtocolParameters } =
    createBuilder(protocolParameters);
  const { output: recipientOutput, minimumBaseUnits } = prepareRecipientOutput(
    toAddress,
    amountBaseUnits,
    normalizedProtocolParameters,
  );
  const ttlSlot = resolveTtlSlot(latestBlock);

  applyUtxosToBuilder(builder, selectedUtxos);
  builder.add_output(recipientOutput);

  if (ttlSlot) {
    builder.set_ttl_bignum(createBigNum(ttlSlot));
  }

  const changeAdded = builder.add_change_if_needed(
    Cardano.Address.from_bech32(changeAddress),
  );
  const txBody = builder.build();
  txBody.set_network_id(
    network === "mainnet"
      ? Cardano.NetworkId.mainnet()
      : Cardano.NetworkId.testnet(),
  );

  const outputs = summarizeOutputs(txBody.outputs(), toAddress);
  const changeValidation = validateChangeSafety({
    network,
    fromAddress,
    toAddress,
    changeAddress,
    selectedUtxos,
    recipientAmountBaseUnits: amountBaseUnits,
    protocolParameters: normalizedProtocolParameters,
    networkFeeBaseUnits: txBody.fee().to_str(),
    outputs,
    changeAdded,
  });

  return {
    txBody,
    ttlSlot,
    changeAdded,
    recipientMinimumBaseUnits: minimumBaseUnits,
    networkFeeBaseUnits: txBody.fee().to_str(),
    outputs,
    changeOutput: changeValidation.changeOutput,
    totalInputBaseUnits: changeValidation.totalInputBaseUnits,
    computedChangeBaseUnits: changeValidation.computedChangeBaseUnits,
    changeMinimumBaseUnits: changeValidation.changeMinimumBaseUnits,
  };
}

function buildPreparedSelection({
  selectedUtxos,
  unsignedTransaction,
  recipientAmountBaseUnits,
  protocolParameters,
  latestBlock,
  changeAddress,
}) {
  const totalInputBaseUnits = selectedUtxos.reduce(
    (sum, entry) => sum + BigInt(String(entry.lovelace)),
    0n,
  );

  return {
    selectedUtxos,
    inputCount: selectedUtxos.length,
    totalInputBaseUnits:
      unsignedTransaction.totalInputBaseUnits || totalInputBaseUnits.toString(),
    recipientAmountBaseUnits: String(recipientAmountBaseUnits),
    networkFeeBaseUnits: unsignedTransaction.networkFeeBaseUnits,
    changeBaseUnits:
      unsignedTransaction.computedChangeBaseUnits ||
      unsignedTransaction.changeOutput?.amountBaseUnits ||
      "0",
    changeAddress,
    recipientMinimumBaseUnits: unsignedTransaction.recipientMinimumBaseUnits,
    protocolParameters: {
      minFeeA: protocolParameters.min_fee_a,
      minFeeB: protocolParameters.min_fee_b,
      maxTxSize: protocolParameters.max_tx_size,
      maxValueSize: protocolParameters.max_val_size,
      keyDeposit: protocolParameters.key_deposit,
      poolDeposit: protocolParameters.pool_deposit,
      coinsPerUtxoByte:
        normalizeProtocolParameters(protocolParameters).coinsPerUtxoByte,
      coinsPerUtxoSize: protocolParameters.coins_per_utxo_size,
      coinsPerUtxoWord: protocolParameters.coins_per_utxo_word,
    },
    latestBlock: latestBlock
      ? {
          hash: latestBlock.hash || null,
          height: latestBlock.height || null,
          slot: latestBlock.slot || null,
          epoch: latestBlock.epoch || null,
        }
      : null,
    ttlSlot: unsignedTransaction.ttlSlot,
  };
}

function selectUtxos({
  network,
  fromAddress,
  utxos,
  toAddress,
  recipientAmountBaseUnits,
  protocolParameters,
  latestBlock,
  changeAddress,
}) {
  if (!utxos.length) {
    throw AppError.validation(
      "No confirmed ADA-only UTXOs are available for this wallet",
    );
  }

  const selected = [];
  let lastUnsafeSelectionError = null;

  for (const utxo of utxos) {
    selected.push(utxo);

    try {
      const unsignedTransaction = buildUnsignedTransaction({
        network,
        fromAddress,
        protocolParameters,
        latestBlock,
        selectedUtxos: selected,
        toAddress,
        amountBaseUnits: recipientAmountBaseUnits,
        changeAddress,
      });

      return buildPreparedSelection({
        selectedUtxos: selected,
        unsignedTransaction,
        recipientAmountBaseUnits,
        protocolParameters,
        latestBlock,
        changeAddress,
      });
    } catch (error) {
      if (isInsufficientBuilderError(error) || isUnsafeAdaSelectionError(error)) {
        if (isUnsafeAdaSelectionError(error)) {
          lastUnsafeSelectionError = error;
        }
        continue;
      }

      throw error;
    }
  }

  if (lastUnsafeSelectionError) {
    throw lastUnsafeSelectionError;
  }

  logger.warn("ADA UTXO selection failed", {
    chain: "ada",
    network,
    fromAddress,
    toAddress,
    recipientAmountBaseUnits: String(recipientAmountBaseUnits),
    availableUtxoCount: utxos.length,
    totalAvailableBaseUnits: utxos
      .reduce((sum, entry) => sum + BigInt(String(entry.lovelace)), 0n)
      .toString(),
  });

  throw AppError.validation(
    "Insufficient ADA balance to cover the amount and network fee",
  );
}

async function buildPreparedTransfer(network, input, options = {}) {
  assertNativeAdaAsset(input);
  const normalizedNetwork = client.normalizeNetwork(network || input.network);
  const executionParams = normalizeExecutionParams(input);
  const fromAddress = normalizeAddress(
    input.fromAddress,
    "source address",
    normalizedNetwork,
  );
  const toAddress = normalizeAddress(
    input.toAddress || input.destinationAddress,
    "destination address",
    normalizedNetwork,
  );

  if (fromAddress === toAddress) {
    throw AppError.validation("Cannot send ADA to the same wallet address");
  }

  const normalizedAmount = amount.normalizeDisplayAmount(input.amount);
  const recipientAmountBaseUnits = BigInt(amount.toBaseUnits(normalizedAmount));

  if (recipientAmountBaseUnits <= 0n) {
    throw AppError.validation("ADA amount must be greater than 0");
  }

  const runtimeContext = await ensureRuntimeWalletContext({
    network: normalizedNetwork,
    fromAddress,
    mnemonic: input.mnemonic || "",
    persistChangeAddress: options.persistChangeAddress === true,
  });

  const { walletRecord, utxos, nativeAssetBearingCount } =
    await fetchManagedUtxos(normalizedNetwork, fromAddress, runtimeContext);
  const adaClient = client.getClient(normalizedNetwork);
  const [protocolParameters, latestBlock] = await Promise.all([
    adaClient.fetchLatestProtocolParameters(),
    adaClient.fetchLatestBlock().catch(() => null),
  ]);
  const changeAddress =
    String(options.changeAddress || "").trim() ||
    String(runtimeContext.changeAddress || "").trim() ||
    (await resolveDedicatedChangeAddress(
      normalizedNetwork,
      fromAddress,
      input.mnemonic || "",
      {
        persist: false,
      },
    )) ||
    fromAddress;

  if (!wallet.validateAddress(changeAddress, normalizedNetwork)) {
    throw AppError.validation("Unable to resolve a valid ADA change address");
  }

  const selection = selectUtxos({
    network: normalizedNetwork,
    fromAddress,
    utxos,
    toAddress,
    recipientAmountBaseUnits: recipientAmountBaseUnits.toString(),
    protocolParameters,
    latestBlock,
    changeAddress,
  });

  return {
    walletRecord,
    executionParams,
    transferInput: {
      fromAddress,
      toAddress,
      amount: normalizedAmount,
      amountBaseUnits: recipientAmountBaseUnits.toString(),
    },
    selection,
    networkFeeBaseUnits: selection.networkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(selection.networkFeeBaseUnits),
    preparedTransaction: {
      fromAddress,
      toAddress,
      amount: normalizedAmount,
      amountBaseUnits: recipientAmountBaseUnits.toString(),
      selectedInputCount: selection.inputCount,
      selectedInputAmountBaseUnits: selection.totalInputBaseUnits,
      recipientOutput: {
        ...buildPreviewOutput(toAddress, recipientAmountBaseUnits.toString()),
        minimumBaseUnits: selection.recipientMinimumBaseUnits,
        minimumAmount: amount.fromBaseUnits(
          selection.recipientMinimumBaseUnits,
        ),
      },
      changeOutput:
        selection.changeBaseUnits !== "0"
          ? buildPreviewOutput(changeAddress, selection.changeBaseUnits)
          : null,
      selectedUtxos: selection.selectedUtxos.map((entry) => ({
        address: entry.address,
        txHash: entry.txHash,
        outputIndex: entry.outputIndex,
        lovelace: entry.lovelace,
        amount: amount.fromBaseUnits(entry.lovelace),
        branch: entry.branch,
        addressIndex: entry.addressIndex,
        derivationPath: entry.derivationPath,
        isChange: entry.isChange,
      })),
      protocolParameters: selection.protocolParameters,
      latestBlock: selection.latestBlock,
      ttlSlot: selection.ttlSlot,
      skippedNativeAssetUtxoCount: nativeAssetBearingCount,
    },
  };
}

function buildSigningKeyMap(mnemonic, network, selectedUtxos) {
  const keysByAddress = new Map();

  for (const utxo of selectedUtxos) {
    const address = String(utxo.address || "").trim();
    if (!address || keysByAddress.has(address)) {
      continue;
    }

    const derived = wallet.deriveManagedAddressFromMnemonic(mnemonic, network, {
      branch: utxo.branch,
      addressIndex: utxo.addressIndex,
      purpose: utxo.purpose || (utxo.isChange ? "change" : "receive"),
      isChange: utxo.isChange === true,
      addressType: utxo.addressType || wallet.ADDRESS_TYPE,
    });

    if (derived.address !== address) {
      throw AppError.conflict(
        "Derived ADA signing key does not match the selected input address",
      );
    }

    keysByAddress.set(address, derived.privateKey);
  }

  return keysByAddress;
}

function buildSignedTransaction(network, prepared, mnemonic) {
  const unsignedTransaction = buildUnsignedTransaction({
    network,
    fromAddress: prepared.transferInput.fromAddress,
    protocolParameters: {
      min_fee_a: prepared.selection.protocolParameters.minFeeA,
      min_fee_b: prepared.selection.protocolParameters.minFeeB,
      max_tx_size: prepared.selection.protocolParameters.maxTxSize,
      max_val_size: prepared.selection.protocolParameters.maxValueSize,
      key_deposit: prepared.selection.protocolParameters.keyDeposit,
      pool_deposit: prepared.selection.protocolParameters.poolDeposit,
      coins_per_utxo_size:
        prepared.selection.protocolParameters.coinsPerUtxoSize ||
        prepared.selection.protocolParameters.coinsPerUtxoByte,
      coins_per_utxo_word:
        prepared.selection.protocolParameters.coinsPerUtxoWord,
    },
    latestBlock: prepared.selection.latestBlock || {},
    selectedUtxos: prepared.selection.selectedUtxos,
    toAddress: prepared.transferInput.toAddress,
    amountBaseUnits: prepared.transferInput.amountBaseUnits,
    changeAddress: prepared.selection.changeAddress,
  });
  const signingKeys = buildSigningKeyMap(
    mnemonic,
    network,
    prepared.selection.selectedUtxos,
  );
  const txHashBytes = Buffer.from(
    blake2b(unsignedTransaction.txBody.to_bytes(), { dkLen: 32 }),
  );
  const txHash = Cardano.TransactionHash.from_bytes(txHashBytes);
  const witnesses = Cardano.Vkeywitnesses.new();

  for (const privateKey of signingKeys.values()) {
    witnesses.add(Cardano.make_vkey_witness(txHash, privateKey));
  }

  const witnessSet = Cardano.TransactionWitnessSet.new();
  witnessSet.set_vkeys(witnesses);

  return {
    txHash: txHash.to_hex(),
    transaction: Cardano.Transaction.new(
      unsignedTransaction.txBody,
      witnessSet,
    ),
    unsignedTransaction,
  };
}

async function validateDestination(input) {
  const normalizedNetwork = client.normalizeNetwork(input.network);
  const executionParams = normalizeExecutionParams(input);
  const destinationAddress = normalizeAddress(
    input.destinationAddress,
    "destination address",
    normalizedNetwork,
  );
  const sourceAddress = normalizeAddress(
    input.fromAddress,
    "source address",
    normalizedNetwork,
  );

  if (destinationAddress === sourceAddress) {
    throw AppError.validation("Cannot send ADA to the same wallet address");
  }

  return {
    destinationAddress,
    executionParams,
  };
}

async function estimateTransfer(input) {
  try {
    const normalizedNetwork = client.normalizeNetwork(input.network);
    const normalizedFromAddress = normalizeAddress(
      input.fromAddress,
      "source address",
      normalizedNetwork,
    );
    const prepared = await buildPreparedTransfer(normalizedNetwork, input, {
      changeAddress: await resolveDedicatedChangeAddress(
        normalizedNetwork,
        normalizedFromAddress,
        "",
        { persist: false },
      ),
      persistChangeAddress: false,
    });

    return {
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      networkFee: prepared.networkFee,
      preparedTransaction: prepared.preparedTransaction,
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to estimate ADA transfer");
  }
}

async function assertPreviewTransferAllowed({ preview }) {
  const amountBaseUnits = BigInt(
    String(preview?.amountBaseUnits ?? preview?.recipientGetsBaseUnits ?? "0"),
  );
  const networkFeeBaseUnits = BigInt(
    String(preview?.networkFeeBaseUnits ?? "0"),
  );

  if (amountBaseUnits <= 0n) {
    throw AppError.validation("ADA amount must be greater than 0");
  }

  if (networkFeeBaseUnits <= 0n) {
    throw new AppError("Unable to determine ADA network fee", {
      status: 502,
      errors: {
        reason: "Cardano fee estimate returned a zero network fee",
      },
    });
  }
}

async function executeTransfer(input) {
  try {
    const normalizedNetwork = client.normalizeNetwork(input.network);
    const normalizedFromAddress = normalizeAddress(
      input.fromAddress,
      "source address",
      normalizedNetwork,
    );
    const runtimeContext = await ensureRuntimeWalletContext({
      network: normalizedNetwork,
      fromAddress: normalizedFromAddress,
      mnemonic: input.mnemonic,
      persistChangeAddress: true,
    });
    const dedicatedChangeAddress =
      String(runtimeContext.changeAddress || "").trim() ||
      (await resolveDedicatedChangeAddress(
        normalizedNetwork,
        normalizedFromAddress,
        input.mnemonic,
        { persist: true },
      ));
    const prepared = await buildPreparedTransfer(normalizedNetwork, input, {
      changeAddress: dedicatedChangeAddress || normalizedFromAddress,
      persistChangeAddress: true,
    });
    const derived = wallet.deriveWalletFromMnemonic(
      input.mnemonic,
      normalizedNetwork,
    );

    if (derived.address !== normalizedFromAddress) {
      throw AppError.conflict("Derived ADA wallet address mismatch");
    }

    const signed = buildSignedTransaction(
      normalizedNetwork,
      prepared,
      input.mnemonic,
    );
    const transactionBytes = Buffer.from(signed.transaction.to_bytes());
    const adaClient = client.getClient(normalizedNetwork);
    const submittedTxHash = normalizeTxHash(
      await adaClient.submitTransaction(transactionBytes),
    );
    const txHash = submittedTxHash || normalizeTxHash(signed.txHash);

    return {
      txHash,
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      networkFee: prepared.networkFee,
      chainStatus: "submitted",
      succeeded: false,
      validated: false,
      confirmations: 0,
      rawRequest: {
        network: normalizedNetwork,
        baseUrl: adaClient.baseUrl,
        transaction: prepared.preparedTransaction,
        executionParams: prepared.executionParams,
      },
      rawResponse: {
        txHash,
        localTxHash: signed.txHash,
        signedTransactionCborHex: Buffer.from(transactionBytes).toString("hex"),
        unsignedTransaction: {
          feeBaseUnits: signed.unsignedTransaction.networkFeeBaseUnits,
          ttlSlot: signed.unsignedTransaction.ttlSlot,
          outputs: serializeValue(signed.unsignedTransaction.outputs),
        },
      },
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to submit ADA transfer");
  }
}

async function fetchHistory(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network);
  const address = String(input.address || "").trim();
  const limit = normalizeHistoryLimit(input.limit);

  if (!wallet.validateAddress(address, normalizedNetwork)) {
    logger.warn(
      "Skipping ADA history fetch because the wallet address is invalid",
      {
        address,
        network: normalizedNetwork,
      },
    );
    return [];
  }

  try {
    return fetchManagedHistoryEntries(normalizedNetwork, address, limit);
  } catch (error) {
    logger.warn("Failed to fetch ADA history from provider", {
      address,
      network: normalizedNetwork,
      limit,
      reason: error instanceof Error ? error.message : String(error),
      baseUrl: client.getBaseUrl(normalizedNetwork),
    });
    return [];
  }
}

module.exports = {
  normalizeExecutionParams,
  validateDestination,
  assertPreviewTransferAllowed,
  estimateTransfer,
  executeTransfer,
  fetchHistory,
  ensureRuntimeWalletContext,
  discoverManagedAddressesByGapLimit,
  resolveOwnerWallet,
  resolveManagedPaymentAddresses,
  resolveManagedPaymentContext,
  fetchManagedHistoryEntries,
  validateAddress: wallet.validateAddress,
};
