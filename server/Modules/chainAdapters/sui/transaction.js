const { Transaction } = require("@mysten/sui/transactions");

const client = require("./client");
const amount = require("./amount");
const mapper = require("./mapper");
const wallet = require("./wallet");
const logger = require("../../../common/utils/logger");
const { AppError } = require("../../../helpers/errors");

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const SUI_COIN_TYPE = "0x2::sui::SUI";
const WAIT_TIMEOUT_MS = 30000;
const WAIT_POLL_INTERVAL_MS = 1000;

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeExecutionParams(input = {}) {
  const executionParams =
    input.executionParams && typeof input.executionParams === "object"
      ? { ...input.executionParams }
      : {};

  if (Object.keys(executionParams).length) {
    throw AppError.validation("SUI native transfers do not support executionParams yet");
  }

  return {};
}

function normalizeAddress(address, label) {
  try {
    return wallet.normalizeAddress(address);
  } catch (_error) {
    throw AppError.validation(`Invalid SUI ${label}`);
  }
}

function normalizeHistoryLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function extractErrorMessage(error, fallback = "SUI request failed") {
  const candidates = [
    error?.response?.data?.message,
    error?.response?.data?.error,
    error?.data?.message,
    error?.cause?.message,
    error?.message,
    error?.reason,
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

  if (normalizedReason.includes("invalid sui address")) {
    return AppError.validation("Invalid SUI destination address");
  }

  if (
    normalizedReason.includes("self") &&
    normalizedReason.includes("transfer")
  ) {
    return AppError.validation("Cannot send SUI to the same wallet address");
  }

  if (
    normalizedReason.includes("no valid gas coins found") ||
    normalizedReason.includes("insufficient") ||
    normalizedReason.includes("gas balance") ||
    normalizedReason.includes("insufficientcoinbalance") ||
    normalizedReason.includes("balance is insufficient")
  ) {
    return AppError.validation("Insufficient SUI balance to cover the amount and network fee");
  }

  if (
    normalizedReason.includes("network") ||
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("fetch") ||
    normalizedReason.includes("http") ||
    normalizedReason.includes("socket")
  ) {
    return new AppError("SUI provider is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError(fallbackMessage, {
    status: 502,
    errors: { reason },
  });
}

function assertNativeSuiAsset(input = {}) {
  const asset = normalizeString(input.asset || input.assetDescriptor?.asset || "SUI").toUpperCase();
  const assetType = normalizeString(input.assetDescriptor?.assetType || "native").toLowerCase();

  if (asset !== "SUI" || assetType !== "native") {
    throw AppError.validation("SUI adapter only supports native SUI transfers");
  }
}

function computeFeeBaseUnits(gasUsed = {}) {
  const computationCost = BigInt(String(gasUsed?.computationCost || "0"));
  const storageCost = BigInt(String(gasUsed?.storageCost || "0"));
  const storageRebate = BigInt(String(gasUsed?.storageRebate || "0"));

  return (computationCost + storageCost - storageRebate).toString();
}

function normalizeTimestamp(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }

  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function normalizeOptionalAddress(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  try {
    return wallet.normalizeAddress(normalized);
  } catch (_error) {
    return "";
  }
}

function resolveBalanceOwner(balanceChange = {}) {
  const owner = balanceChange?.owner;

  if (typeof owner === "string") {
    return normalizeOptionalAddress(owner);
  }

  if (owner && typeof owner === "object") {
    if (typeof owner.AddressOwner === "string") {
      return normalizeOptionalAddress(owner.AddressOwner);
    }

    if (typeof owner.ObjectOwner === "string") {
      return normalizeOptionalAddress(owner.ObjectOwner);
    }
  }

  return "";
}

function normalizeNativeBalanceChanges(raw = {}) {
  return (Array.isArray(raw.balanceChanges) ? raw.balanceChanges : [])
    .map((entry) => ({
      owner: resolveBalanceOwner(entry),
      amount: BigInt(String(entry?.amount || "0")),
      coinType: normalizeString(entry?.coinType).toLowerCase(),
    }))
    .filter((entry) => entry.owner && entry.coinType === SUI_COIN_TYPE.toLowerCase());
}

function buildTransferTransaction(fromAddress, toAddress, amountBaseUnits) {
  const transaction = new Transaction();
  transaction.setSender(fromAddress);
  const [coin] = transaction.splitCoins(transaction.gas, [transaction.pure.u64(amountBaseUnits)]);
  transaction.transferObjects([coin], toAddress);
  return transaction;
}

async function buildPreparedTransfer(network, input = {}) {
  assertNativeSuiAsset(input);

  const normalizedNetwork = client.normalizeNetwork(network || input.network);
  const executionParams = normalizeExecutionParams(input);
  const fromAddress = normalizeAddress(input.fromAddress, "source address");
  const toAddress = normalizeAddress(
    input.toAddress || input.destinationAddress,
    "destination address",
  );

  if (fromAddress === toAddress) {
    throw AppError.validation("Cannot send SUI to the same wallet address");
  }

  const normalizedAmount = amount.normalizeDisplayAmount(input.amount);
  const amountBaseUnits = amount.toBaseUnits(normalizedAmount);

  if (BigInt(amountBaseUnits) <= 0n) {
    throw AppError.validation("SUI amount must be greater than 0");
  }

  const suiClient = client.getClient(normalizedNetwork);
  const senderBalance = await suiClient.getBalance(fromAddress);
  const transaction = buildTransferTransaction(fromAddress, toAddress, amountBaseUnits);
  const transactionBytes = await transaction.build({ client: suiClient.sdkClient });
  const dryRun = await suiClient.dryRunTransactionBlock(transactionBytes);
  const dryRunStatus = normalizeString(dryRun?.effects?.status?.status).toLowerCase();
  const dryRunError = normalizeString(dryRun?.effects?.status?.error);

  if (dryRunStatus && dryRunStatus !== "success") {
    if (dryRunError) {
      throw new Error(dryRunError);
    }

    throw new Error("SUI dry-run transfer failed");
  }

  const networkFeeBaseUnits = computeFeeBaseUnits(dryRun?.effects?.gasUsed || {});
  const totalRequiredBaseUnits =
    BigInt(amountBaseUnits) + BigInt(networkFeeBaseUnits || "0");
  const availableBaseUnits = String(senderBalance?.totalBalance || "0");

  if (BigInt(availableBaseUnits) < totalRequiredBaseUnits) {
    throw AppError.validation("Insufficient SUI balance to cover the amount and network fee");
  }

  return {
    network: normalizedNetwork,
    executionParams,
    senderBalance,
    dryRun,
    transaction,
    transactionBytes,
    transferInput: {
      fromAddress,
      toAddress,
      amount: normalizedAmount,
      amountBaseUnits,
    },
    networkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
    preparedTransaction: {
      fromAddress,
      toAddress,
      amount: normalizedAmount,
      amountBaseUnits,
      gasEstimate: {
        networkFeeBaseUnits,
        networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
        computationCostBaseUnits: String(dryRun?.effects?.gasUsed?.computationCost || "0"),
        storageCostBaseUnits: String(dryRun?.effects?.gasUsed?.storageCost || "0"),
        storageRebateBaseUnits: String(dryRun?.effects?.gasUsed?.storageRebate || "0"),
      },
      senderBalanceBaseUnits: availableBaseUnits,
      recipientGetsBaseUnits: amountBaseUnits,
    },
  };
}

function buildHistoryQueryOptions() {
  return {
    showEffects: true,
    showInput: true,
    showBalanceChanges: true,
  };
}

async function validateDestination(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network);
  const executionParams = normalizeExecutionParams(input);
  const destinationAddress = normalizeAddress(input.destinationAddress, "destination address");
  const sourceAddress = normalizeAddress(input.fromAddress, "source address");

  if (destinationAddress === sourceAddress) {
    throw AppError.validation("Cannot send SUI to the same wallet address");
  }

  return {
    destinationAddress,
    executionParams,
    network: normalizedNetwork,
  };
}

async function estimateTransfer(input = {}) {
  try {
    const prepared = await buildPreparedTransfer(input.network, input);

    return {
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      networkFee: prepared.networkFee,
      preparedTransaction: prepared.preparedTransaction,
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to estimate SUI transfer");
  }
}

async function executeTransfer(input = {}) {
  try {
    const prepared = await buildPreparedTransfer(input.network, input);
    const signer = wallet.deriveKeypairFromMnemonic(input.mnemonic, prepared.network);

    if (signer.address !== prepared.transferInput.fromAddress) {
      throw AppError.conflict("Derived wallet address mismatch");
    }

    const suiClient = client.getClient(prepared.network);
    const submittedResponse = await suiClient.signAndExecuteTransaction({
      transaction: prepared.transaction,
      signer: signer.keypair,
      options: buildHistoryQueryOptions(),
    });
    const txHash = normalizeString(submittedResponse?.digest);

    if (!txHash) {
      throw new Error("SUI provider did not return a transaction digest");
    }

    let finalizedResponse = null;
    try {
      finalizedResponse = await suiClient.waitForTransaction({
        digest: txHash,
        options: buildHistoryQueryOptions(),
        timeout: WAIT_TIMEOUT_MS,
        pollInterval: WAIT_POLL_INTERVAL_MS,
      });
    } catch (waitError) {
      logger.warn("SUI transaction submitted but confirmation wait did not complete", {
        network: prepared.network,
        txHash,
        reason: extractErrorMessage(waitError, "SUI waitForTransaction failed"),
      });
    }

    const response = finalizedResponse || submittedResponse;
    const feeBaseUnits = computeFeeBaseUnits(response?.effects?.gasUsed || {});
    const executionStatus = normalizeString(response?.effects?.status?.status).toLowerCase();
    const succeeded = executionStatus === "success";
    const chainTimestamp = normalizeTimestamp(response?.timestampMs);
    const validated = Boolean(finalizedResponse || response?.checkpoint || chainTimestamp);

    return {
      txHash,
      ledgerIndex: Number.isFinite(Number(response?.checkpoint))
        ? Number(response.checkpoint)
        : undefined,
      networkFeeBaseUnits: feeBaseUnits,
      networkFee: amount.fromBaseUnits(feeBaseUnits),
      chainStatus: succeeded
        ? validated
          ? "confirmed"
          : "submitted"
        : validated
          ? "failed"
          : "submitted",
      succeeded,
      validated,
      confirmations: validated ? 1 : 0,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
      rawRequest: {
        network: prepared.network,
        rpcUrl: suiClient.rpcUrl,
        transaction: prepared.preparedTransaction,
        executionParams: prepared.executionParams,
      },
      rawResponse: {
        submitted: submittedResponse,
        finalized: finalizedResponse,
      },
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to submit SUI transfer");
  }
}

function sortHistoryEntries(left, right) {
  const leftTimestamp = Number(left?.timestampMs || 0);
  const rightTimestamp = Number(right?.timestampMs || 0);

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  const leftCheckpoint = Number(left?.checkpoint || 0);
  const rightCheckpoint = Number(right?.checkpoint || 0);
  if (leftCheckpoint !== rightCheckpoint) {
    return rightCheckpoint - leftCheckpoint;
  }

  return normalizeString(right?.digest).localeCompare(normalizeString(left?.digest));
}

function isRelevantHistoryEntry(entry, walletAddress) {
  const senderAddress = normalizeOptionalAddress(entry?.transaction?.data?.sender || entry?.sender);
  const nativeBalanceChanges = normalizeNativeBalanceChanges(entry);

  if (!nativeBalanceChanges.length) {
    return false;
  }

  if (nativeBalanceChanges.some((change) => change.owner === walletAddress)) {
    return true;
  }

  return senderAddress === walletAddress &&
    nativeBalanceChanges.some((change) => change.owner !== walletAddress && change.amount > 0n);
}

async function fetchHistory(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network);
  const address = normalizeAddress(input.address, "wallet address");
  const limit = normalizeHistoryLimit(input.limit);
  const suiClient = client.getClient(normalizedNetwork);

  try {
    const [outgoingPage, incomingPage] = await Promise.all([
      suiClient.queryTransactionBlocks({
        filter: { FromAddress: address },
        limit,
        order: "descending",
        options: buildHistoryQueryOptions(),
      }),
      suiClient.queryTransactionBlocks({
        filter: { ToAddress: address },
        limit,
        order: "descending",
        options: buildHistoryQueryOptions(),
      }),
    ]);

    const deduped = new Map();
    for (const entry of [...(outgoingPage?.data || []), ...(incomingPage?.data || [])]) {
      const txHash = normalizeString(entry?.digest);
      if (!txHash) {
        continue;
      }

      if (!deduped.has(txHash)) {
        deduped.set(txHash, {
          ...entry,
          network: normalizedNetwork,
          walletAddress: address,
        });
      }
    }

    return [...deduped.values()]
      .filter((entry) => isRelevantHistoryEntry(entry, address))
      .filter((entry) => Boolean(mapper.mapTransaction(entry, address)))
      .sort(sortHistoryEntries)
      .slice(0, limit);
  } catch (error) {
    logger.warn("Failed to fetch SUI history from provider", {
      address,
      network: normalizedNetwork,
      limit,
      reason: extractErrorMessage(error, "Failed to fetch SUI transaction history"),
      rpcUrl: suiClient.rpcUrl,
    });
    throw buildRpcError(error, "Failed to fetch SUI transaction history");
  }
}

module.exports = {
  normalizeExecutionParams,
  validateDestination,
  estimateTransfer,
  executeTransfer,
  fetchHistory,
  validateAddress: wallet.validateAddress,
};
