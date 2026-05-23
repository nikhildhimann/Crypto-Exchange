const {
  AccountId,
  Hbar,
  TransactionId,
  TransferTransaction,
} = require("@hashgraph/sdk");
const mongoose = require("mongoose");

const WalletAddress = require("../../wallet/address.model");
const client = require("./client");
const amount = require("./amount");
const wallet = require("./wallet");
const { AppError } = require("../../../helpers/errors");
const logger = require("../../../common/utils/logger");

const SUPPORTED_EXECUTION_PARAM_KEYS = new Set(["memo"]);
const MAX_MEMO_BYTES = 100;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const DEFAULT_TRANSFER_MAX_FEE_BASE_UNITS = "1000000";

function normalizeString(value) {
  return String(value || "").trim();
}

function assertNativeHbarAsset(input = {}) {
  const asset = String(input.asset || input.assetDescriptor?.asset || "HBAR")
    .trim()
    .toUpperCase();
  const assetType = String(input.assetDescriptor?.assetType || "native")
    .trim()
    .toLowerCase();

  if (asset !== "HBAR" || assetType !== "native") {
    throw AppError.validation("HBAR adapter only supports native HBAR transfers");
  }
}

function buildPendingActivationError() {
  return AppError.validation(
    "HBAR wallet is pending activation and cannot send until the first incoming deposit creates the on-chain account",
  );
}

function normalizeMemo(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  if (Buffer.byteLength(normalized, "utf8") > MAX_MEMO_BYTES) {
    throw AppError.validation(`HBAR memo must be at most ${MAX_MEMO_BYTES} bytes`);
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
      `HBAR transfers do not support execution params: ${unsupportedKeys.join(", ")}`,
    );
  }

  const normalized = {};
  const memo = normalizeMemo(executionParams.memo);
  if (memo) {
    normalized.memo = memo;
  }

  return normalized;
}

async function normalizeSenderAccountId(address, network) {
  const normalized = normalizeString(address);
  const normalizedNetwork = client.normalizeNetwork(network);

  if (wallet.validateAliasAccountId(normalized)) {
    const resolvedAccount = await client.getClient(normalizedNetwork).resolveAccount(normalized, {
      allowNotFound: true,
    }).catch(() => null);

    if (resolvedAccount?.accountId) {
      return resolvedAccount.accountId;
    }

    throw buildPendingActivationError();
  }

  if (!wallet.validateCanonicalAccountId(normalized)) {
    throw AppError.validation("Invalid HBAR sender account ID");
  }

  return client.normalizeCanonicalAccountId(normalized);
}

function normalizeDestinationIdentifier(address) {
  const normalized = normalizeString(address);

  try {
    return client.normalizeCanonicalAccountId(normalized);
  } catch (_error) {
    // Fall through to alias and EVM address validation.
  }

  if (wallet.validateAliasAccountId(normalized) || wallet.validateEvmAddress(normalized)) {
    return normalized;
  }

  throw AppError.validation("Invalid HBAR destination account ID");
}

function buildTinybarHbar(amountBaseUnits) {
  return Hbar.fromTinybars(String(amountBaseUnits));
}

function normalizeAmountBaseUnits(rawAmount) {
  const normalizedAmount = amount.normalizeDisplayAmount(rawAmount);
  const amountBaseUnits = String(amount.toBaseUnits(normalizedAmount));
  const amountBigInt = BigInt(amountBaseUnits);

  if (amountBigInt <= 0n) {
    throw AppError.validation("HBAR amount must be greater than 0");
  }

  return {
    amount: normalizedAmount,
    amountBaseUnits,
    amountBigInt,
  };
}

async function resolveSenderAccount(network, fromAddress) {
  return client.getClient(network).requireAccount(fromAddress, {
    label: "HBAR sender account",
    notFoundMessage: "HBAR sender account does not exist on the selected network",
    deletedMessage: "HBAR sender account is deleted",
  });
}

async function resolveDestination(network, destinationAddress) {
  const normalized = normalizeDestinationIdentifier(destinationAddress);

  if (wallet.validateCanonicalAccountId(normalized)) {
    const account = await client.getClient(network).resolveAccount(normalized, {
      allowNotFound: true,
    }).catch(() => null);

    if (account?.deleted) {
      throw AppError.conflict("HBAR destination account is deleted");
    }

    return {
      destinationAddress: normalized,
      transferAccountId: normalized,
      canonicalAccountId: account?.accountId || normalized,
      identifierType: "accountId",
      resolvedByMirror: Boolean(account?.raw?.mirror),
      aliasAccountId: account?.alias || null,
      evmAddress: account?.evmAddress || null,
    };
  }

  if (wallet.validateAliasAccountId(normalized)) {
    return {
      destinationAddress: normalized,
      transferAccountId: normalized,
      canonicalAccountId: null,
      identifierType: "alias",
      resolvedByMirror: false,
      evmAddress: null,
    };
  }

  const account = await client.getClient(network).requireAccount(normalized, {
    label: "HBAR destination EVM address",
    notFoundMessage: "HBAR destination EVM address could not be resolved",
    deletedMessage: "HBAR destination EVM address resolves to a deleted account",
  });

  return {
    destinationAddress: normalized,
    transferAccountId: account.accountId,
    canonicalAccountId: account.accountId,
    identifierType: "evmAddress",
    resolvedByMirror: true,
    aliasAccountId: account.alias || null,
    evmAddress: normalized,
  };
}

function toHex(bytes) {
  if (!bytes) {
    return null;
  }

  return Buffer.from(bytes).toString("hex");
}

function toDateOrUndefined(value) {
  if (!value || typeof value.toDate !== "function") {
    return undefined;
  }

  const asDate = value.toDate();
  return Number.isNaN(asDate?.getTime?.()) ? undefined : asDate;
}

function normalizeStatus(value) {
  const normalized =
    value && typeof value.toString === "function" ? value.toString() : normalizeString(value);
  return normalized || "UNKNOWN";
}

function serializeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]),
    );
  }

  return value;
}

function normalizeHistoryLimit(limit) {
  const parsed = Number.parseInt(String(limit ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

async function resolveCanonicalWalletAddressSet(network, address) {
  const normalizedAddress = await normalizeSenderAccountId(address, network);
  if (mongoose.connection.readyState !== 1) {
    return {
      walletAddresses: [normalizedAddress],
    };
  }

  const managedAddressRecords = await WalletAddress.find({
    chain: "hbar",
    network,
    isActive: true,
    address: { $exists: true, $ne: "" },
  })
    .select("walletId address")
    .lean();
  const matchedRecord = managedAddressRecords.find(
    (entry) => normalizeString(entry.address).toLowerCase() === normalizedAddress.toLowerCase(),
  );

  if (!matchedRecord?.walletId) {
    return {
      walletAddresses: [normalizedAddress],
    };
  }

  const walletScopedRecords = managedAddressRecords.filter(
    (entry) => String(entry.walletId) === String(matchedRecord.walletId),
  );
  const walletAddresses = [
    normalizedAddress,
    ...walletScopedRecords.map((entry) => normalizeString(entry.address)),
  ]
    .filter(Boolean)
    .filter((entry, index, values) => values.indexOf(entry) === index);

  return {
    walletAddresses,
  };
}

function buildHistoryEntry(raw, network, walletAddresses) {
  return {
    ...raw,
    network,
    walletAddress: walletAddresses[0] || "",
    walletAddresses,
  };
}

function extractMirrorNextLink(page = {}) {
  return normalizeString(page?.links?.next);
}

function isRelevantHistoryTransaction(entry = {}) {
  return normalizeString(entry?.name).toUpperCase() === "CRYPTOTRANSFER";
}

function buildRpcError(error, fallbackMessage) {
  if (error instanceof AppError) {
    return error;
  }

  const reason =
    error instanceof Error && error.message ? error.message : String(error || fallbackMessage);
  const normalized = reason.toLowerCase();

  if (
    normalized.includes("memo") &&
    normalized.includes("100")
  ) {
    return AppError.validation(`HBAR memo must be at most ${MAX_MEMO_BYTES} bytes`);
  }

  if (
    normalized.includes("insufficient_tx_fee") ||
    (normalized.includes("fee") && normalized.includes("insufficient"))
  ) {
    return AppError.validation(
      "HBAR network fee exceeded the current transfer fee cap; please retry the transfer",
    );
  }

  if (
    normalized.includes("insufficient") ||
    normalized.includes("insufficient_payer_balance") ||
    normalized.includes("insufficient_account_balance")
  ) {
    return AppError.validation("Insufficient HBAR balance to cover the amount and network fee");
  }

  if (
    normalized.includes("invalid") &&
    normalized.includes("account")
  ) {
    return AppError.validation("Invalid HBAR destination account ID");
  }

  if (
    normalized.includes("network") ||
    normalized.includes("mirror") ||
    normalized.includes("timeout") ||
    normalized.includes("grpc") ||
    normalized.includes("fetch")
  ) {
    return new AppError("Hedera provider is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError(fallbackMessage, {
    status: 502,
    errors: { reason },
  });
}

function resolveSigningWalletMaterial(secretOrMnemonic, network) {
  const normalizedSecret = normalizeString(secretOrMnemonic);
  if (!normalizedSecret) {
    throw AppError.validation("HBAR wallet secret is required");
  }

  if (normalizedSecret.includes(" ")) {
    return wallet.deriveWalletFromMnemonic(normalizedSecret, network);
  }

  const privateKey = wallet.normalizePrivateKeySecret(normalizedSecret);
  const publicKey = privateKey.publicKey;
  const aliasAccountId = publicKey.toAccountId(0, 0).toString();

  return {
    network,
    privateKey,
    publicKeyRaw: publicKey.toStringRaw(),
    aliasAccountId,
    address: aliasAccountId,
  };
}

async function buildPreparedTransfer(network, input) {
  assertNativeHbarAsset(input);
  const normalizedNetwork = client.normalizeNetwork(network || input.network);
  const executionParams = normalizeExecutionParams(input);
  const fromAddress = await normalizeSenderAccountId(input.fromAddress, normalizedNetwork);
  const destination = await resolveDestination(
    normalizedNetwork,
    input.toAddress || input.destinationAddress,
  );

  if (
    destination.destinationAddress === fromAddress ||
    destination.canonicalAccountId === fromAddress
  ) {
    throw AppError.validation("Cannot send HBAR to the same account");
  }

  const senderAccount = await resolveSenderAccount(normalizedNetwork, fromAddress);
  const normalizedAmount = normalizeAmountBaseUnits(input.amount);
  const sdkClient = client.getClient(normalizedNetwork).getSdkClient(false);
  const transaction = new TransferTransaction()
    .setTransactionId(TransactionId.generate(AccountId.fromString(fromAddress)))
    .setMaxTransactionFee(buildTinybarHbar(DEFAULT_TRANSFER_MAX_FEE_BASE_UNITS))
    .addHbarTransfer(fromAddress, buildTinybarHbar(normalizedAmount.amountBaseUnits).negated())
    .addHbarTransfer(
      destination.transferAccountId,
      buildTinybarHbar(normalizedAmount.amountBaseUnits),
    );

  if (executionParams.memo) {
    transaction.setTransactionMemo(executionParams.memo);
  }

  transaction.freezeWith(sdkClient);

  const estimatedNetworkFeeBaseUnits = transaction.maxTransactionFee
    ? transaction.maxTransactionFee.toTinybars().toString()
    : "0";
  const estimatedDebitBaseUnits =
    BigInt(normalizedAmount.amountBaseUnits) + BigInt(estimatedNetworkFeeBaseUnits);
  const availableBaseUnits = BigInt(String(senderAccount.tinybarBalance || "0"));

  if (availableBaseUnits < estimatedDebitBaseUnits) {
    throw AppError.validation("Insufficient HBAR balance to cover the amount and network fee");
  }

  return {
    network: normalizedNetwork,
    senderAccount,
    destination,
    transferInput: {
      fromAddress,
      toAddress: destination.destinationAddress,
      resolvedToAccountId: destination.transferAccountId,
      amount: normalizedAmount.amount,
      amountBaseUnits: normalizedAmount.amountBaseUnits,
    },
    executionParams,
    transaction,
    networkFeeBaseUnits: estimatedNetworkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(estimatedNetworkFeeBaseUnits),
    preparedTransaction: {
      fromAddress,
      toAddress: destination.destinationAddress,
      resolvedToAccountId: destination.transferAccountId,
      canonicalRecipientAccountId: destination.canonicalAccountId,
      recipientIdentifierType: destination.identifierType,
      recipientResolvedByMirror: destination.resolvedByMirror,
      amount: normalizedAmount.amount,
      amountBaseUnits: normalizedAmount.amountBaseUnits,
      memo: executionParams.memo || null,
      availableBalanceBaseUnits: String(senderAccount.tinybarBalance || "0"),
      estimatedMaxFeeBaseUnits: estimatedNetworkFeeBaseUnits,
      feeEstimateMode: "hbar_transfer_max_fee_cap",
    },
  };
}

async function validateDestination(input) {
  const normalizedNetwork = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const executionParams = normalizeExecutionParams(input);
  const fromAddress = await normalizeSenderAccountId(input.fromAddress, normalizedNetwork);
  const destination = await resolveDestination(normalizedNetwork, input.destinationAddress);

  if (
    destination.destinationAddress === fromAddress ||
    destination.canonicalAccountId === fromAddress
  ) {
    throw AppError.validation("Cannot send HBAR to the same account");
  }

  return {
    destinationAddress: destination.destinationAddress,
    executionParams,
  };
}

async function estimateTransfer(input) {
  try {
    const prepared = await buildPreparedTransfer(input.network, input);

    return {
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      networkFee: prepared.networkFee,
      preparedTransaction: prepared.preparedTransaction,
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to estimate HBAR transfer");
  }
}

async function fetchTransaction(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(
    input.network || client.DEFAULT_NETWORK,
  );
  const transactionId = normalizeString(input.transactionId || input.txHash);

  if (!transactionId) {
    throw AppError.validation("HBAR transaction ID is required");
  }

  try {
    const raw = await client.getClient(normalizedNetwork).fetchTransaction(
      transactionId,
      {
        allowNotFound: input.allowNotFound === true,
      },
    );

    if (!raw) {
      return null;
    }

    return {
      ...raw,
      network: normalizedNetwork,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to fetch HBAR transaction");
  }
}

async function executeTransfer(input) {
  try {
    const prepared = await buildPreparedTransfer(input.network, input);
    const derivedWallet = resolveSigningWalletMaterial(
      input.secret || input.mnemonic,
      prepared.network,
    );
    const senderPublicKey = normalizeString(prepared.senderAccount?.publicKey).toLowerCase();
    const derivedPublicKey = normalizeString(derivedWallet.publicKeyRaw).toLowerCase();

    if (!senderPublicKey || !derivedPublicKey || senderPublicKey !== derivedPublicKey) {
      throw AppError.conflict("Derived HBAR wallet does not match the sender account");
    }

    await prepared.transaction.sign(derivedWallet.privateKey);

    const sdkClient = client.getClient(prepared.network).getSdkClient(false);
    const response = await prepared.transaction.execute(sdkClient);
    const transactionId = response.transactionId?.toString?.() || null;
    const transactionHash = toHex(response.transactionHash);

    let receipt = null;
    let record = null;

    try {
      receipt = await response.getReceiptQuery(sdkClient).execute(sdkClient);
      record = await response.getRecordQuery(sdkClient).execute(sdkClient).catch(() => null);
    } catch (_error) {
      return {
        txHash: transactionId,
        transactionId,
        ledgerIndex: undefined,
        networkFeeBaseUnits: prepared.networkFeeBaseUnits,
        networkFee: prepared.networkFee,
        chainStatus: "SUBMITTED",
        succeeded: false,
        validated: false,
        chainTimestamp: undefined,
        confirmedAt: undefined,
        rawRequest: {
          network: prepared.network,
          senderAccountId: prepared.transferInput.fromAddress,
          recipientIdentifier: prepared.transferInput.toAddress,
          resolvedRecipientAccountId: prepared.transferInput.resolvedToAccountId,
          amount: prepared.transferInput.amount,
          amountBaseUnits: prepared.transferInput.amountBaseUnits,
          executionParams: prepared.executionParams,
        },
        rawResponse: {
          transactionId,
          transactionHash,
          receiptStatus: null,
          record: null,
        },
        executionParams: prepared.executionParams,
      };
    }

    const chainStatus = normalizeStatus(receipt?.status);
    const succeeded = chainStatus === "SUCCESS";
    const actualFeeBaseUnits =
      record?.transactionFee?.toTinybars?.().toString?.() || prepared.networkFeeBaseUnits;
    const chainTimestamp = toDateOrUndefined(record?.consensusTimestamp);

    return {
      txHash: transactionId,
      transactionId,
      ledgerIndex: undefined,
      networkFeeBaseUnits: actualFeeBaseUnits,
      networkFee: amount.fromBaseUnits(actualFeeBaseUnits),
      chainStatus,
      succeeded,
      validated: true,
      chainTimestamp,
      confirmedAt: succeeded ? chainTimestamp : undefined,
      rawRequest: {
        network: prepared.network,
        senderAccountId: prepared.transferInput.fromAddress,
        recipientIdentifier: prepared.transferInput.toAddress,
        resolvedRecipientAccountId: prepared.transferInput.resolvedToAccountId,
        amount: prepared.transferInput.amount,
        amountBaseUnits: prepared.transferInput.amountBaseUnits,
        executionParams: prepared.executionParams,
      },
      rawResponse: {
        transactionId,
        transactionHash,
        receiptStatus: chainStatus,
        consensusTimestamp: chainTimestamp ? chainTimestamp.toISOString() : null,
        record: record ? serializeValue(record.toJSON()) : null,
      },
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to submit HBAR transfer");
  }
}

async function fetchHistory(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const rawAddress = normalizeString(input.address);

  let address = rawAddress;
  if (wallet.validateAliasAccountId(rawAddress)) {
    const resolvedAccount = await client.getClient(normalizedNetwork).resolveAccount(rawAddress, {
      allowNotFound: true,
    }).catch(() => null);

    if (!resolvedAccount?.accountId) {
      return [];
    }

    address = resolvedAccount.accountId;
  }

  address = await normalizeSenderAccountId(address, normalizedNetwork);
  const limit = normalizeHistoryLimit(input.limit);
  const hbarClient = client.getClient(normalizedNetwork);
  const { walletAddresses } = await resolveCanonicalWalletAddressSet(normalizedNetwork, address);

  try {
    const entries = [];
    const seen = new Set();
    let page = await hbarClient.fetchAccountTransactions(address, {
      limit: Math.min(limit, 100),
      order: "desc",
      transactionType: "CRYPTOTRANSFER",
    });

    while (page && entries.length < limit) {
      for (const entry of Array.isArray(page.transactions) ? page.transactions : []) {
        if (!isRelevantHistoryTransaction(entry)) {
          continue;
        }

        const txId = normalizeString(entry.transaction_id);
        if (!txId || seen.has(txId)) {
          continue;
        }

        seen.add(txId);
        entries.push(buildHistoryEntry(entry, normalizedNetwork, walletAddresses));

        if (entries.length >= limit) {
          break;
        }
      }

      const nextLink = extractMirrorNextLink(page);
      if (!nextLink || entries.length >= limit) {
        break;
      }

      page = await hbarClient.fetchNextTransactions(nextLink);
    }

    return entries;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    logger.warn("Failed to fetch HBAR history from provider", {
      address,
      network: normalizedNetwork,
      limit,
      reason: error instanceof Error ? error.message : String(error),
      baseUrl: client.getMirrorBaseUrl(normalizedNetwork),
    });

    throw new AppError("Failed to fetch HBAR transaction history", {
      status: 502,
      errors: {
        address,
        network: normalizedNetwork,
        limit,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

module.exports = {
  normalizeExecutionParams,
  validateDestination,
  estimateTransfer,
  fetchTransaction,
  executeTransfer,
  fetchHistory,
  validateAddress: wallet.validateAddress,
};
