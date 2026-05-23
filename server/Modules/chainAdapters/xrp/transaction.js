const { Wallet } = require("xrpl");
const client = require("./client");
const amount = require("./amount");
const wallet = require("./wallet");
const { AppError } = require("../../../helpers/errors");
const logger = require("../../../common/utils/logger");
const {
  buildXrpAccountNotActivatedError,
  extractProviderReason,
  isXrpAccountNotActivatedError,
} = require("./errors");

const MAX_DESTINATION_TAG = 4294967295;
const RIPPLE_EPOCH_OFFSET_MS = 946684800000;

function isTransientConnectRace(error) {
  const message = error instanceof Error ? error.message : String(error || "");

  return (
    message.includes("WebSocket is not open") ||
    message.includes("readyState 0") ||
    message.includes("Client not connected")
  );
}

async function withReadyClient(network, operation) {
  let xrplClient = await client.getClient(network);

  try {
    return await operation(xrplClient);
  } catch (error) {
    if (!isTransientConnectRace(error)) {
      throw error;
    }

    xrplClient = await client.reconnectClient(network);
    return operation(xrplClient);
  }
}

function normalizeDestinationTag(tag) {
  if (tag === undefined || tag === null || tag === "") {
    return undefined;
  }

  if (typeof tag === "number") {
    if (!Number.isInteger(tag)) {
      throw AppError.validation("Destination tag must be an integer");
    }

    if (tag < 0 || tag > MAX_DESTINATION_TAG) {
      throw AppError.validation(
        `Destination tag must be between 0 and ${MAX_DESTINATION_TAG}`,
      );
    }

    return tag;
  }

  if (typeof tag === "string") {
    const normalizedTag = tag.trim();
    if (!/^\d+$/.test(normalizedTag)) {
      throw AppError.validation("Destination tag must be a whole number");
    }

    const numericTag = Number.parseInt(normalizedTag, 10);
    if (numericTag < 0 || numericTag > MAX_DESTINATION_TAG) {
      throw AppError.validation(
        `Destination tag must be between 0 and ${MAX_DESTINATION_TAG}`,
      );
    }

    return numericTag;
  }

  throw AppError.validation("Destination tag must be a number or numeric string");
}

function buildPayment(input = {}, executionParams = {}) {
  return {
    TransactionType: "Payment",
    Account: input.fromAddress,
    Destination: input.toAddress,
    Amount: amount.toBaseUnits(input.amount),
    ...(executionParams.destinationTag !== undefined
      ? { DestinationTag: executionParams.destinationTag }
      : {}),
  };
}

function normalizeIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function normalizeRippleTimestamp(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const timestamp = new Date(RIPPLE_EPOCH_OFFSET_MS + value * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function resolveChainTimestamp(result = {}) {
  return (
    normalizeIsoTimestamp(result.close_time_iso) ||
    normalizeRippleTimestamp(
      typeof result.tx_json?.date === "number"
        ? result.tx_json.date
        : typeof result.date === "number"
          ? result.date
          : undefined,
    )
  );
}

function normalizeExecutionParams(input = {}) {
  const executionParams =
    input.executionParams && typeof input.executionParams === "object"
      ? { ...input.executionParams }
      : {};

  if (Object.prototype.hasOwnProperty.call(executionParams, "destinationTag")) {
    const normalizedTag = normalizeDestinationTag(executionParams.destinationTag);
    if (normalizedTag === undefined) {
      delete executionParams.destinationTag;
    } else {
      executionParams.destinationTag = normalizedTag;
    }
  }

  return executionParams;
}

function normalizeTransferError(error, input = {}, operation = "transaction") {
  if (error instanceof AppError) {
    return error;
  }

  if (isXrpAccountNotActivatedError(error)) {
    logger.warn("XRP on-chain account is not activated", {
      chain: "xrp",
      network: String(input.network || "").trim().toLowerCase() || null,
      address: String(input.fromAddress || "").trim() || null,
      operation,
      providerReason: extractProviderReason(error) || null,
      onChainExists: false,
      activationStatus: "pending_activation",
    });

    return buildXrpAccountNotActivatedError({
      address: input.fromAddress,
      network: input.network,
      operation,
      providerError: error,
    });
  }

  return error;
}

async function validateDestination(input) {
  const destinationAddress = String(input.destinationAddress || "").trim();
  if (!wallet.validateAddress(destinationAddress)) {
    throw AppError.validation("Invalid XRP destination address");
  }

  return {
    destinationAddress,
    executionParams: normalizeExecutionParams(input),
  };
}

async function estimateTransfer(input) {
  const executionParams = normalizeExecutionParams(input);
  const payment = buildPayment(input, executionParams);
  let autofilled;

  try {
    autofilled = await withReadyClient(input.network, (xrplClient) =>
      xrplClient.autofill(payment),
    );
  } catch (error) {
    throw normalizeTransferError(error, input, "preview_transfer_estimate");
  }

  return {
    networkFeeBaseUnits: autofilled.Fee || "0",
    networkFee: amount.fromBaseUnits(autofilled.Fee || "0"),
    preparedTransaction: autofilled,
    executionParams,
  };
}

async function executeTransfer(input) {
  const normalizedSecret = String(input.secret || input.mnemonic || "").trim();
  if (!normalizedSecret) {
    throw AppError.validation("XRP wallet secret is required");
  }

  const signingWallet = normalizedSecret.includes(" ")
    ? Wallet.fromMnemonic(normalizedSecret, { mnemonicEncoding: "bip39" })
    : Wallet.fromSeed(normalizedSecret);
  const executionParams = normalizeExecutionParams(input);

  if (signingWallet.classicAddress !== input.fromAddress) {
    throw AppError.conflict("Derived wallet address mismatch");
  }

  const payment = buildPayment(input, executionParams);
  let response;

  try {
    response = await withReadyClient(input.network, (xrplClient) =>
      xrplClient.submitAndWait(payment, {
        wallet: signingWallet,
        autofill: true,
      }),
    );
  } catch (error) {
    throw normalizeTransferError(error, input, "execute_transfer");
  }

  const result = response.result;
  const txResult =
    typeof result.meta === "object" && result.meta && "TransactionResult" in result.meta
      ? String(result.meta.TransactionResult)
      : undefined;
  const chainTimestamp = resolveChainTimestamp(result);

  const isSuccess = txResult === "tesSUCCESS";
  const isFailure = txResult && txResult !== "tesSUCCESS";

  return {
    txHash: result.hash,
    ledgerIndex: result.validated ? result.ledger_index : undefined,
    networkFeeBaseUnits: typeof result.tx_json?.Fee === "string" ? result.tx_json.Fee : "0",
    networkFee: amount.fromBaseUnits(
      typeof result.tx_json?.Fee === "string" ? result.tx_json.Fee : "0",
    ),
    chainStatus: isFailure ? "failed" : (txResult || (result.validated ? "tesSUCCESS" : "submitted")),
    succeeded: isSuccess,
    validated: Boolean(result.validated),
    chainTimestamp,
    confirmedAt: result.validated ? chainTimestamp : undefined,
    rawRequest: payment,
    rawResponse: result,
    executionParams,
    transactionResult: txResult,
  };
}

async function fetchHistory(input) {
  const response = await withReadyClient(input.network, (xrplClient) =>
    xrplClient.request({
      command: "account_tx",
      account: input.address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      forward: false,
      limit: input.limit || 50,
    }),
  );

  return response.result.transactions || [];
}

module.exports = {
  buildPayment,
  normalizeExecutionParams,
  validateDestination,
  estimateTransfer,
  executeTransfer,
  fetchHistory,
  validateAddress: wallet.validateAddress,
};
