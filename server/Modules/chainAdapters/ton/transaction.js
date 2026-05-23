const { beginCell, external, internal, SendMode, storeMessage } = require("@ton/core");

const { AppError } = require("../../../helpers/errors");
const client = require("./client");
const amount = require("./amount");
const mapper = require("./mapper");
const wallet = require("./wallet");

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const WAIT_TIMEOUT_MS = 30000;
const WAIT_POLL_INTERVAL_MS = 1500;
const SUPPORTED_EXECUTION_PARAM_KEYS = new Set(["bounce"]);

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeHistoryLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function parseBoolean(value, fieldName) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  throw AppError.validation(`${fieldName} must be true or false`);
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
      `TON transfers do not support execution params: ${unsupportedKeys.join(", ")}`,
    );
  }

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(executionParams, "bounce")) {
    normalized.bounce = parseBoolean(executionParams.bounce, "bounce");
  }

  return normalized;
}

function normalizeAddress(address, label, network) {
  try {
    return wallet.normalizeAddress(address, network);
  } catch (_error) {
    throw AppError.validation(`Invalid TON ${label}`);
  }
}

function normalizeOptionalAddress(address, network) {
  const normalized = normalizeString(address);
  if (!normalized) {
    return "";
  }

  try {
    return wallet.normalizeAddress(normalized, network);
  } catch (_error) {
    return "";
  }
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  const timestamp = new Date(numeric * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function serializeValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (value && typeof value === "object") {
    if (typeof value.toRawString === "function") {
      return value.toRawString();
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]),
    );
  }

  return value;
}

function extractErrorMessage(error, fallback = "TON request failed") {
  const responseData = error?.response?.data;
  const candidates = [
    typeof responseData === "string" ? responseData : null,
    responseData?.result,
    responseData?.error,
    responseData?.message,
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
  const status = Number(error?.response?.status || 0);

  if (status === 429 || normalizedReason.includes("ratelimit")) {
    return AppError.rateLimited("TON provider rate limit exceeded");
  }

  if (normalizedReason.includes("invalid ton address")) {
    return AppError.validation("Invalid TON destination address");
  }

  if (
    normalizedReason.includes("invalid") &&
    normalizedReason.includes("address")
  ) {
    return AppError.validation("Invalid TON address");
  }

  if (
    normalizedReason.includes("insufficient") ||
    normalizedReason.includes("not enough") ||
    normalizedReason.includes("no funds")
  ) {
    return AppError.validation("Insufficient TON balance to cover the amount and network fee");
  }

  if (
    normalizedReason.includes("seqno") ||
    normalizedReason.includes("message already sent") ||
    normalizedReason.includes("lt not in db")
  ) {
    return AppError.conflict("TON wallet state changed before submission. Please try again");
  }

  if (
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("network") ||
    normalizedReason.includes("fetch") ||
    normalizedReason.includes("socket") ||
    normalizedReason.includes("http")
  ) {
    return new AppError("TON provider is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError(fallbackMessage, {
    status: 502,
    errors: { reason },
  });
}

function assertNativeTonAsset(input = {}) {
  const asset = normalizeString(input.asset || input.assetDescriptor?.asset || "TON").toUpperCase();
  const assetType = normalizeString(input.assetDescriptor?.assetType || "native").toLowerCase();

  if (asset !== "TON" || assetType !== "native") {
    throw AppError.validation("TON adapter only supports native TON transfers");
  }
}

function sumFeeParts(sourceFees = {}) {
  const inForwardFee = BigInt(String(sourceFees?.in_fwd_fee || "0"));
  const storageFee = BigInt(String(sourceFees?.storage_fee || "0"));
  const gasFee = BigInt(String(sourceFees?.gas_fee || "0"));
  const forwardFee = BigInt(String(sourceFees?.fwd_fee || "0"));

  return (inForwardFee + storageFee + gasFee + forwardFee).toString();
}

function resolveRecipientBounce(parsedDestination, executionParams = {}, recipientState = null) {
  if (typeof executionParams.bounce === "boolean") {
    return executionParams.bounce;
  }

  if (parsedDestination.isFriendly && typeof parsedDestination.isBounceable === "boolean") {
    return parsedDestination.isBounceable;
  }

  if (recipientState === "uninitialized") {
    return false;
  }

  return true;
}

function isSenderUsable(accountState, balanceBaseUnits) {
  if (accountState === "active") {
    return true;
  }

  if (accountState === "uninitialized") {
    return BigInt(balanceBaseUnits || "0") > 0n;
  }

  return false;
}

function serializeMessage(message, network) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const info = message.info || {};
  const sourceAddress =
    info.src && typeof info.src.toRawString === "function"
      ? normalizeOptionalAddress(info.src.toRawString(), network)
      : "";
  const destinationAddress =
    info.dest && typeof info.dest.toRawString === "function"
      ? normalizeOptionalAddress(info.dest.toRawString(), network)
      : "";

  return {
    type: normalizeString(info.type),
    sourceAddress: sourceAddress || null,
    destinationAddress: destinationAddress || null,
    valueBaseUnits:
      info.value && typeof info.value === "object" && "coins" in info.value
        ? String(info.value.coins)
        : null,
    bounce:
      info.bounce === undefined || info.bounce === null ? null : Boolean(info.bounce),
    bounced:
      info.bounced === undefined || info.bounced === null ? null : Boolean(info.bounced),
    createdLt:
      info.createdLt === undefined || info.createdLt === null
        ? null
        : String(info.createdLt),
    createdAt:
      info.createdAt === undefined || info.createdAt === null
        ? null
        : Number(info.createdAt),
    bodyHash:
      message.body && typeof message.body.hash === "function"
        ? message.body.hash().toString("base64")
        : null,
  };
}

function serializeOutMessages(outMessages, network) {
  if (!outMessages || typeof outMessages[Symbol.iterator] !== "function") {
    return [];
  }

  return [...outMessages]
    .map((entry) => {
      const message = Array.isArray(entry) ? entry[1] : entry;
      return serializeMessage(message, network);
    })
    .filter(Boolean);
}

function serializeTransaction(rawTransaction, network, walletAddress) {
  if (!rawTransaction || typeof rawTransaction !== "object") {
    return null;
  }

  const txHash =
    rawTransaction.raw && typeof rawTransaction.raw.hash === "function"
      ? rawTransaction.raw.hash().toString("base64")
      : "";

  if (!txHash) {
    return null;
  }

  return {
    txHash,
    walletAddress: walletAddress || undefined,
    network,
    address: walletAddress || undefined,
    lt:
      rawTransaction.lt === undefined || rawTransaction.lt === null
        ? null
        : String(rawTransaction.lt),
    now:
      rawTransaction.now === undefined || rawTransaction.now === null
        ? null
        : Number(rawTransaction.now),
    oldStatus: normalizeString(rawTransaction.oldStatus),
    endStatus: normalizeString(rawTransaction.endStatus),
    totalFeesBaseUnits:
      rawTransaction.totalFees && typeof rawTransaction.totalFees === "object" && "coins" in rawTransaction.totalFees
        ? String(rawTransaction.totalFees.coins)
        : "0",
    inMessage: serializeMessage(rawTransaction.inMessage, network),
    outMessages: serializeOutMessages(rawTransaction.outMessages, network),
    description: {
      type: normalizeString(rawTransaction.description?.type),
      aborted: Boolean(rawTransaction.description?.aborted),
      destroyed: Boolean(rawTransaction.description?.destroyed),
      actionSuccess:
        rawTransaction.description?.actionPhase?.success === undefined
          ? null
          : Boolean(rawTransaction.description.actionPhase.success),
      actionValid:
        rawTransaction.description?.actionPhase?.valid === undefined
          ? null
          : Boolean(rawTransaction.description.actionPhase.valid),
      computeSuccess:
        rawTransaction.description?.computePhase?.success === undefined
          ? null
          : Boolean(rawTransaction.description.computePhase.success),
      computeExitCode:
        rawTransaction.description?.computePhase?.exitCode === undefined ||
        rawTransaction.description?.computePhase?.exitCode === null
          ? null
          : Number(rawTransaction.description.computePhase.exitCode),
      resultCode:
        rawTransaction.description?.actionPhase?.resultCode === undefined ||
        rawTransaction.description?.actionPhase?.resultCode === null
          ? null
          : Number(rawTransaction.description.actionPhase.resultCode),
    },
    rawMeta: {
      outMessagesCount:
        rawTransaction.outMessagesCount === undefined || rawTransaction.outMessagesCount === null
          ? 0
          : Number(rawTransaction.outMessagesCount),
      prevTransactionLt:
        rawTransaction.prevTransactionLt === undefined || rawTransaction.prevTransactionLt === null
          ? null
          : String(rawTransaction.prevTransactionLt),
      prevTransactionHash:
        rawTransaction.prevTransactionHash === undefined || rawTransaction.prevTransactionHash === null
          ? null
          : Buffer.isBuffer(rawTransaction.prevTransactionHash)
            ? rawTransaction.prevTransactionHash.toString("base64")
            : String(rawTransaction.prevTransactionHash),
    },
  };
}

function buildExternalMessageHash(contract, transferBody, { includeInit = false } = {}) {
  const message = external({
    to: contract.address,
    init: includeInit ? contract.init || undefined : undefined,
    body: transferBody,
  });

  return beginCell().store(storeMessage(message)).endCell().hash().toString("base64");
}

async function resolveAddressInfoSafe(network, address) {
  try {
    return await client.getClient(network).getAddressInfo(address);
  } catch (_error) {
    return null;
  }
}

async function buildPreparedTransfer(network, input = {}) {
  assertNativeTonAsset(input);

  const normalizedNetwork = client.normalizeNetwork(network || input.network);
  const executionParams = normalizeExecutionParams(input);
  const sourceAddress = normalizeAddress(input.fromAddress, "source address", normalizedNetwork);
  const destinationInput = input.toAddress || input.destinationAddress;
  const parsedDestination = wallet.parseTonAddress(destinationInput, normalizedNetwork);
  const destinationAddress = parsedDestination.raw;

  if (sourceAddress === destinationAddress) {
    throw AppError.validation("Cannot send TON to the same wallet address");
  }

  const normalizedAmount = amount.normalizeDisplayAmount(input.amount);
  const amountBaseUnits = amount.toBaseUnits(normalizedAmount);

  if (BigInt(amountBaseUnits) <= 0n) {
    throw AppError.validation("TON amount must be greater than 0");
  }

  const tonClient = client.getClient(normalizedNetwork);
  const signingWallet = await wallet.deriveSigningWalletFromMnemonic(input.mnemonic, normalizedNetwork);

  if (signingWallet.address !== sourceAddress) {
    throw AppError.conflict("Derived wallet address mismatch");
  }

  const [senderState, recipientState] = await Promise.all([
    tonClient.getAddressInfo(sourceAddress),
    resolveAddressInfoSafe(normalizedNetwork, destinationAddress),
  ]);

  const senderBalanceBaseUnits = String(senderState?.balance || "0");
  const senderAccountState = client.normalizeAccountState(senderState?.state);

  if (!isSenderUsable(senderAccountState, senderBalanceBaseUnits)) {
    throw AppError.validation("TON sender wallet is not initialized with spendable balance");
  }

  const bounce = resolveRecipientBounce(
    parsedDestination,
    executionParams,
    recipientState ? client.normalizeAccountState(recipientState.state) : null,
  );
  const openedWallet = tonClient.openContract(signingWallet.walletContract);
  const seqno = await openedWallet.getSeqno();
  const messages = [
    internal({
      to: client.toTonAddress(destinationAddress),
      value: BigInt(amountBaseUnits),
      bounce,
    }),
  ];
  const transferBody = signingWallet.walletContract.createTransfer({
    seqno,
    secretKey: signingWallet.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages,
  });
  const needsInit = senderAccountState !== "active";
  const messageHash = buildExternalMessageHash(signingWallet.walletContract, transferBody, {
    includeInit: needsInit,
  });
  const feeEstimate = await tonClient.estimateExternalMessageFee(signingWallet.address, {
    body: transferBody,
    initCode: needsInit ? signingWallet.walletContract.init.code : undefined,
    initData: needsInit ? signingWallet.walletContract.init.data : undefined,
    ignoreSignature: false,
  });
  const networkFeeBaseUnits = sumFeeParts(feeEstimate?.source_fees || {});
  const totalRequiredBaseUnits =
    BigInt(amountBaseUnits) + BigInt(networkFeeBaseUnits || "0");

  if (BigInt(senderBalanceBaseUnits) < totalRequiredBaseUnits) {
    throw AppError.validation("Insufficient TON balance to cover the amount and network fee");
  }

  return {
    network: normalizedNetwork,
    tonClient,
    signingWallet,
    openedWallet,
    executionParams: {
      ...(typeof executionParams.bounce === "boolean" ? { bounce: executionParams.bounce } : {}),
    },
    transferBody,
    messageHash,
    feeEstimate,
    senderState,
    senderAccountState,
    senderBalanceBaseUnits,
    recipientState,
    recipientAccountState: recipientState
      ? client.normalizeAccountState(recipientState.state)
      : null,
    transferInput: {
      fromAddress: sourceAddress,
      toAddress: destinationAddress,
      amount: normalizedAmount,
      amountBaseUnits,
      bounce,
    },
    networkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
    preparedTransaction: {
      fromAddress: sourceAddress,
      toAddress: destinationAddress,
      amount: normalizedAmount,
      amountBaseUnits,
      bounce,
      seqno,
      senderAccountState,
      senderBalanceBaseUnits,
      recipientAccountState: recipientState
        ? client.normalizeAccountState(recipientState.state)
        : null,
      estimatedFees: {
        inForwardFeeBaseUnits: String(feeEstimate?.source_fees?.in_fwd_fee || "0"),
        storageFeeBaseUnits: String(feeEstimate?.source_fees?.storage_fee || "0"),
        gasFeeBaseUnits: String(feeEstimate?.source_fees?.gas_fee || "0"),
        forwardFeeBaseUnits: String(feeEstimate?.source_fees?.fwd_fee || "0"),
        totalFeeBaseUnits: networkFeeBaseUnits,
      },
      messageHash,
    },
  };
}

function matchesSubmittedTransaction(entry, prepared, previousLt) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  if (previousLt && entry.lt && BigInt(entry.lt) <= BigInt(previousLt)) {
    return false;
  }

  if (entry.inMessage?.type !== "external-in") {
    return false;
  }

  if (entry.inMessage?.destinationAddress !== prepared.transferInput.fromAddress) {
    return false;
  }

  return entry.outMessages.some((message) =>
    message?.destinationAddress === prepared.transferInput.toAddress &&
    String(message?.valueBaseUnits || "0") === prepared.transferInput.amountBaseUnits,
  );
}

async function waitForSubmittedTransaction(prepared, previousLt) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const entries = await prepared.tonClient
      .getTransactions(prepared.transferInput.fromAddress, { limit: 10 })
      .then((transactions) =>
        transactions
          .map((entry) =>
            serializeTransaction(
              entry,
              prepared.network,
              prepared.transferInput.fromAddress,
            ),
          )
          .filter(Boolean),
      );

    const match = entries.find((entry) =>
      matchesSubmittedTransaction(entry, prepared, previousLt),
    );

    if (match) {
      return match;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, WAIT_POLL_INTERVAL_MS);
    });
  }

  return null;
}

async function validateDestination(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const executionParams = normalizeExecutionParams(input);
  const parsedDestination = wallet.parseTonAddress(
    input.destinationAddress || input.toAddress,
    normalizedNetwork,
  );
  const destinationAddress = parsedDestination.raw;

  if (input.fromAddress) {
    const sourceAddress = normalizeAddress(input.fromAddress, "source address", normalizedNetwork);
    if (sourceAddress === destinationAddress) {
      throw AppError.validation("Cannot send TON to the same wallet address");
    }
  }

  const normalizedExecutionParams = { ...executionParams };
  if (
    !Object.prototype.hasOwnProperty.call(normalizedExecutionParams, "bounce") &&
    parsedDestination.isFriendly &&
    typeof parsedDestination.isBounceable === "boolean"
  ) {
    normalizedExecutionParams.bounce = parsedDestination.isBounceable;
  }

  return {
    destinationAddress,
    executionParams: normalizedExecutionParams,
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
    throw buildRpcError(error, "Failed to estimate TON transfer");
  }
}

async function executeTransfer(input = {}) {
  try {
    const prepared = await buildPreparedTransfer(input.network, input);
    const previousLt = prepared.senderState?.lastTransaction?.lt || null;

    await prepared.openedWallet.sendTransfer({
      seqno: prepared.preparedTransaction.seqno,
      secretKey: prepared.signingWallet.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [
        internal({
          to: client.toTonAddress(prepared.transferInput.toAddress),
          value: BigInt(prepared.transferInput.amountBaseUnits),
          bounce: prepared.transferInput.bounce,
        }),
      ],
    });

    const confirmedTransaction = await waitForSubmittedTransaction(prepared, previousLt);
    const chainTimestamp = confirmedTransaction
      ? normalizeTimestamp(confirmedTransaction.now)
      : undefined;
    const txHash = confirmedTransaction?.txHash || null;
    const succeeded = confirmedTransaction
      ? !confirmedTransaction.description?.aborted &&
        confirmedTransaction.description?.computeSuccess !== false &&
        confirmedTransaction.description?.actionSuccess !== false
      : false;
    const validated = Boolean(confirmedTransaction);
    const visibility = validated ? "confirmed" : "pending_lookup";

    return {
      txHash,
      ledgerIndex: undefined,
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      networkFee: prepared.networkFee,
      chainStatus: validated
        ? succeeded
          ? "confirmed"
          : "failed"
        : "submitted",
      succeeded,
      validated,
      confirmations: validated ? 1 : 0,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
      rawRequest: {
        network: prepared.network,
        rpcUrl: prepared.tonClient.rpcUrl,
        transaction: prepared.preparedTransaction,
        executionParams: prepared.executionParams,
        messageHash: prepared.messageHash,
      },
      rawResponse: {
        messageHash: prepared.messageHash,
        senderAccountState: prepared.senderAccountState,
        recipientAccountState: prepared.recipientAccountState,
        visibility,
        reconciliation: {
          pollWindowMs: WAIT_TIMEOUT_MS,
          previousTransactionLt: previousLt,
          fromAddress: prepared.transferInput.fromAddress,
          toAddress: prepared.transferInput.toAddress,
          amountBaseUnits: prepared.transferInput.amountBaseUnits,
          seqno: prepared.preparedTransaction.seqno,
        },
        confirmedTransaction: serializeValue(confirmedTransaction || {}),
      },
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to submit TON transfer");
  }
}

async function fetchHistory(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const address = normalizeAddress(input.address, "wallet address", normalizedNetwork);
  const limit = normalizeHistoryLimit(input.limit);
  const tonClient = client.getClient(normalizedNetwork);
  const entries = [];
  const seen = new Set();
  let cursorLt = null;
  let cursorHash = null;

  try {
    while (entries.length < limit) {
      const batch = await tonClient.getTransactions(address, {
        limit: Math.min(limit - entries.length, DEFAULT_HISTORY_LIMIT),
        ...(cursorLt && cursorHash
          ? {
              lt: cursorLt,
              hash: cursorHash,
              inclusive: false,
            }
          : {}),
      });

      if (!Array.isArray(batch) || !batch.length) {
        break;
      }

      for (const entry of batch) {
        let serialized = null;
        let mapped = null;

        try {
          serialized = serializeTransaction(entry, normalizedNetwork, address);
          mapped = serialized ? mapper.mapTransaction(serialized, address) : null;
        } catch (_error) {
          continue;
        }

        if (!serialized || !mapped || seen.has(serialized.txHash)) {
          continue;
        }

        seen.add(serialized.txHash);
        entries.push(serialized);

        if (entries.length >= limit) {
          break;
        }
      }

      if (batch.length < DEFAULT_HISTORY_LIMIT) {
        break;
      }

      const lastEntry = batch[batch.length - 1];
      if (!lastEntry?.lt || !lastEntry?.raw || typeof lastEntry.raw.hash !== "function") {
        break;
      }

      try {
        cursorLt = String(lastEntry.lt);
        cursorHash = lastEntry.raw.hash().toString("base64");
      } catch (_error) {
        break;
      }
    }

    return entries;
  } catch (error) {
    throw buildRpcError(error, "Failed to fetch TON transaction history");
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
