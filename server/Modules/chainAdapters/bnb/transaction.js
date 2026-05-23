const { Wallet, getAddress } = require("ethers");

const client = require("./client");
const amount = require("./amount");
const wallet = require("./wallet");
const logger = require("../../../common/utils/logger");
const { AppError } = require("../../../helpers/errors");

const DEFAULT_NATIVE_GAS_LIMIT = 21000n;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const MAINNET_NETWORK = "mainnet";
const SUPPORTED_EXECUTION_PARAM_KEYS = new Set([
  "gasLimit",
  "gasPrice",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "nonce",
]);

function normalizeAddress(address, label) {
  const normalized = String(address || "").trim();

  if (!wallet.validateAddress(normalized)) {
    throw AppError.validation(`Invalid BNB ${label}`);
  }

  return getAddress(normalized);
}

function normalizeHistoryLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function getExplorerApiConfig() {
  return {
    url: String(process.env.BNB_EXPLORER_API_URL || "").trim(),
    apiKey: String(process.env.BNB_EXPLORER_API_KEY || "").trim(),
  };
}

function normalizeExplorerEntryNumber(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeExplorerStatus(entry = {}) {
  if (String(entry.txreceipt_status || "") === "1") {
    return { succeeded: true, chainStatus: "confirmed" };
  }

  if (
    String(entry.txreceipt_status || "") === "0" ||
    String(entry.isError || "") === "1"
  ) {
    return { succeeded: false, chainStatus: "failed" };
  }

  return { succeeded: true, chainStatus: "confirmed" };
}

function isNoTransactionsResponse(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.result) &&
    payload.result.length === 0 &&
    typeof payload.message === "string" &&
    payload.message.toLowerCase().includes("no transactions")
  );
}

function buildExplorerHistoryUrl(address, limit) {
  const { url, apiKey } = getExplorerApiConfig();
  const requestUrl = new URL(url);

  requestUrl.searchParams.set("chainid", String(client.getConfiguredChainId()));
  requestUrl.searchParams.set("module", "account");
  requestUrl.searchParams.set("action", "txlist");
  requestUrl.searchParams.set("address", address);
  requestUrl.searchParams.set("startblock", "0");
  requestUrl.searchParams.set("endblock", "99999999");
  requestUrl.searchParams.set("page", "1");
  requestUrl.searchParams.set("offset", String(limit));
  requestUrl.searchParams.set("sort", "desc");

  if (apiKey) {
    requestUrl.searchParams.set("apikey", apiKey);
  }

  return requestUrl;
}

async function fetchExplorerHistory(address, limit) {
  const requestUrl = buildExplorerHistoryUrl(address, limit);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10000);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: abortController.signal,
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Explorer HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (Array.isArray(payload?.result)) {
      return payload.result;
    }

    if (isNoTransactionsResponse(payload)) {
      return [];
    }

    throw new Error(
      typeof payload?.result === "string"
        ? payload.result
        : "Unexpected explorer response shape",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function isNativeTransferEntry(entry = {}, walletAddress) {
  const value = String(entry.value ?? "").trim();
  const fromAddress = String(entry.from || "").trim().toLowerCase();
  const toAddress = String(entry.to || "").trim().toLowerCase();
  const targetAddress = String(walletAddress || "").trim().toLowerCase();

  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) {
    return false;
  }

  if (!fromAddress && !toAddress) {
    return false;
  }

  return fromAddress === targetAddress || toAddress === targetAddress;
}

function mapExplorerEntryToHistoryItem(entry = {}) {
  const blockNumber = normalizeExplorerEntryNumber(entry.blockNumber);
  const confirmations = normalizeExplorerEntryNumber(entry.confirmations);
  const { succeeded, chainStatus } = normalizeExplorerStatus(entry);

  return {
    txHash: String(entry.hash || "").trim(),
    transaction: {
      hash: String(entry.hash || "").trim(),
      from: String(entry.from || "").trim(),
      to: String(entry.to || "").trim(),
      value: String(entry.value || "0").trim(),
      blockNumber,
      confirmations,
      gasPrice: String(entry.gasPrice || "0").trim(),
    },
    receipt: {
      blockNumber,
      gasUsed: String(entry.gasUsed || "0").trim(),
      effectiveGasPrice: String(entry.gasPrice || "0").trim(),
      status: succeeded ? 1 : 0,
    },
    timestamp: normalizeExplorerEntryNumber(entry.timeStamp),
    network: MAINNET_NETWORK,
    chainStatus,
    validated: blockNumber !== undefined,
    succeeded,
    explorer: serializeValue(entry),
  };
}

function serializeValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]),
    );
  }

  return value;
}

function parseBigIntParam(value, field, { allowZero = false } = {}) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number"
        ? String(value)
        : String(value).trim();

  if (!/^\d+$/.test(normalized)) {
    throw AppError.validation(`${field} must be a non-negative integer string`);
  }

  const parsed = BigInt(normalized);
  if (!allowZero && parsed <= 0n) {
    throw AppError.validation(`${field} must be greater than zero`);
  }

  return parsed;
}

function parseNonce(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw AppError.validation("nonce must be a non-negative integer");
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
      `BNB native transfers do not support execution params: ${unsupportedKeys.join(", ")}`,
    );
  }

  const normalized = {};
  const gasLimit = parseBigIntParam(executionParams.gasLimit, "gasLimit");
  const gasPrice = parseBigIntParam(executionParams.gasPrice, "gasPrice");
  const maxFeePerGas = parseBigIntParam(executionParams.maxFeePerGas, "maxFeePerGas");
  const maxPriorityFeePerGas = parseBigIntParam(
    executionParams.maxPriorityFeePerGas,
    "maxPriorityFeePerGas",
  );
  const nonce = parseNonce(executionParams.nonce);

  if (gasPrice !== undefined && (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined)) {
    throw AppError.validation(
      "Use either gasPrice or maxFeePerGas/maxPriorityFeePerGas for BNB transfers, not both",
    );
  }

  if (
    maxFeePerGas !== undefined &&
    maxPriorityFeePerGas !== undefined &&
    maxPriorityFeePerGas > maxFeePerGas
  ) {
    throw AppError.validation("maxPriorityFeePerGas cannot be greater than maxFeePerGas");
  }

  if (gasLimit !== undefined) {
    normalized.gasLimit = gasLimit.toString();
  }
  if (gasPrice !== undefined) {
    normalized.gasPrice = gasPrice.toString();
  }
  if (maxFeePerGas !== undefined) {
    normalized.maxFeePerGas = maxFeePerGas.toString();
  }
  if (maxPriorityFeePerGas !== undefined) {
    normalized.maxPriorityFeePerGas = maxPriorityFeePerGas.toString();
  }
  if (nonce !== undefined) {
    normalized.nonce = nonce;
  }

  return normalized;
}

function buildBaseTransferRequest(input) {
  return {
    from: normalizeAddress(input.fromAddress, "source address"),
    to: normalizeAddress(input.toAddress, "destination address"),
    value: BigInt(amount.toBaseUnits(input.amount)),
  };
}

function isInsufficientFundsError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.toLowerCase().includes("insufficient funds");
}

async function resolveGasLimit(provider, transactionRequest, executionParams) {
  if (executionParams.gasLimit) {
    return BigInt(executionParams.gasLimit);
  }

  try {
    const estimatedGas = await provider.estimateGas(transactionRequest);
    return estimatedGas > DEFAULT_NATIVE_GAS_LIMIT ? estimatedGas : DEFAULT_NATIVE_GAS_LIMIT;
  } catch (error) {
    if (isInsufficientFundsError(error)) {
      return DEFAULT_NATIVE_GAS_LIMIT;
    }

    throw AppError.validation(`Failed to estimate BNB gas limit: ${error.message}`);
  }
}

async function resolveFeeOverrides(provider, executionParams, gasLimit) {
  const feeData = await provider.getFeeData();
  const overrides = {
    gasLimit,
  };
  const resolvedFeeData = {
    gasPrice:
      executionParams.gasPrice !== undefined
        ? BigInt(executionParams.gasPrice)
        : feeData.gasPrice ?? null,
    maxFeePerGas:
      executionParams.maxFeePerGas !== undefined
        ? BigInt(executionParams.maxFeePerGas)
        : feeData.maxFeePerGas ?? null,
    maxPriorityFeePerGas:
      executionParams.maxPriorityFeePerGas !== undefined
        ? BigInt(executionParams.maxPriorityFeePerGas)
        : feeData.maxPriorityFeePerGas ?? null,
  };

  if (executionParams.nonce !== undefined) {
    overrides.nonce = executionParams.nonce;
  }

  if (executionParams.gasPrice !== undefined) {
    overrides.gasPrice = BigInt(executionParams.gasPrice);

    return {
      overrides,
      estimatedFeePerGas: overrides.gasPrice,
      feeData: serializeValue(resolvedFeeData),
    };
  }

  const canUseEip1559 =
    resolvedFeeData.maxFeePerGas !== null || resolvedFeeData.maxPriorityFeePerGas !== null;

  if (canUseEip1559) {
    const fallbackMaxFeePerGas = resolvedFeeData.gasPrice;
    const maxFeePerGas = resolvedFeeData.maxFeePerGas ?? fallbackMaxFeePerGas;
    const maxPriorityFeePerGas =
      resolvedFeeData.maxPriorityFeePerGas ??
      (maxFeePerGas !== null ? maxFeePerGas : null);

    if (maxFeePerGas === null) {
      throw AppError.internal("Unable to determine BNB maxFeePerGas");
    }

    if (
      maxPriorityFeePerGas !== null &&
      maxFeePerGas !== null &&
      maxPriorityFeePerGas > maxFeePerGas
    ) {
      throw AppError.validation("maxPriorityFeePerGas cannot be greater than maxFeePerGas");
    }

    overrides.maxFeePerGas = maxFeePerGas;
    if (maxPriorityFeePerGas !== null) {
      overrides.maxPriorityFeePerGas = maxPriorityFeePerGas;
    }

    return {
      overrides,
      estimatedFeePerGas: maxFeePerGas,
      feeData: serializeValue(resolvedFeeData),
    };
  }

  if (resolvedFeeData.gasPrice === null) {
    throw AppError.internal("Unable to determine BNB gas price");
  }

  overrides.gasPrice = resolvedFeeData.gasPrice;

  return {
    overrides,
    estimatedFeePerGas: resolvedFeeData.gasPrice,
    feeData: serializeValue(resolvedFeeData),
  };
}

function serializeTransactionRequest(transactionRequest, chainId) {
  return serializeValue({
    chainId,
    from: transactionRequest.from,
    to: transactionRequest.to,
    value: transactionRequest.value,
    gasLimit: transactionRequest.gasLimit,
    gasPrice: transactionRequest.gasPrice,
    maxFeePerGas: transactionRequest.maxFeePerGas,
    maxPriorityFeePerGas: transactionRequest.maxPriorityFeePerGas,
    nonce: transactionRequest.nonce,
  });
}

function serializeTransactionResponse(response) {
  if (!response) {
    return {};
  }

  return serializeValue({
    hash: response.hash,
    from: response.from,
    to: response.to,
    nonce: response.nonce,
    gasLimit: response.gasLimit,
    gasPrice: response.gasPrice,
    maxFeePerGas: response.maxFeePerGas,
    maxPriorityFeePerGas: response.maxPriorityFeePerGas,
    value: response.value,
    chainId: response.chainId,
    data: response.data,
    blockNumber: response.blockNumber,
    blockHash: response.blockHash,
    type: response.type,
  });
}

function serializeTransactionReceipt(receipt) {
  if (!receipt) {
    return {};
  }

  return serializeValue({
    hash: receipt.hash,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    cumulativeGasUsed: receipt.cumulativeGasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    from: receipt.from,
    gasUsed: receipt.gasUsed,
    status: receipt.status,
    to: receipt.to,
    type: receipt.type,
  });
}

async function buildPreparedTransfer(provider, input) {
  const executionParams = normalizeExecutionParams(input);
  const baseRequest = buildBaseTransferRequest(input);
  const gasLimit = await resolveGasLimit(provider, baseRequest, executionParams);
  const { overrides, estimatedFeePerGas, feeData } = await resolveFeeOverrides(
    provider,
    executionParams,
    gasLimit,
  );
  const transactionRequest = {
    ...baseRequest,
    ...overrides,
  };

  return {
    executionParams,
    transactionRequest,
    gasLimit,
    estimatedFeePerGas,
    networkFeeBaseUnits: (gasLimit * estimatedFeePerGas).toString(),
    feeData,
  };
}

function resolveReceiptFromError(error) {
  if (error && typeof error === "object" && error.receipt) {
    return error.receipt;
  }

  return null;
}

function resolveSigningWalletMaterial(input = {}) {
  const normalizedSecret = String(input.secret || input.mnemonic || "").trim();
  if (!normalizedSecret) {
    throw AppError.validation("BNB wallet secret is required");
  }

  if (normalizedSecret.includes(" ")) {
    return wallet.deriveWalletFromMnemonic(normalizedSecret).wallet;
  }

  return new Wallet(wallet.normalizePrivateKey(normalizedSecret));
}

async function resolveBlockTimestamp(provider, blockNumber) {
  if (typeof blockNumber !== "number") {
    return undefined;
  }

  const block = await provider.getBlock(blockNumber);
  if (!block || typeof block.timestamp !== "number") {
    return undefined;
  }

  const timestamp = new Date(block.timestamp * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

async function validateDestination(input) {
  const destinationAddress = normalizeAddress(input.destinationAddress, "destination address");

  return {
    destinationAddress,
    executionParams: normalizeExecutionParams(input),
  };
}

async function estimateTransfer(input) {
  const { provider, chainId } = await client.assertProviderReady(input.network);
  const prepared = await buildPreparedTransfer(provider, input);

  return {
    networkFeeBaseUnits: prepared.networkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(prepared.networkFeeBaseUnits),
    preparedTransaction: {
      ...serializeTransactionRequest(prepared.transactionRequest, chainId),
      feeData: prepared.feeData,
    },
    executionParams: prepared.executionParams,
  };
}

async function executeTransfer(input) {
  const { provider, chainId, rpcUrl } = await client.assertProviderReady(input.network);
  const prepared = await buildPreparedTransfer(provider, input);
  const derivedWallet = resolveSigningWalletMaterial(input);
  const signer = new Wallet(derivedWallet.privateKey, provider);
  const normalizedFromAddress = normalizeAddress(input.fromAddress, "source address");

  if (getAddress(signer.address) !== normalizedFromAddress) {
    throw AppError.conflict("Derived wallet address mismatch");
  }

  let transactionResponse;
  let receipt = null;

  try {
    transactionResponse = await signer.sendTransaction(prepared.transactionRequest);
    receipt = await transactionResponse.wait();
  } catch (error) {
    receipt = resolveReceiptFromError(error);
    if (!transactionResponse && !receipt) {
      throw new Error(`Failed to submit BNB transfer: ${error.message}`);
    }
  }

  const effectiveGasPrice =
    receipt?.effectiveGasPrice ??
    transactionResponse?.gasPrice ??
    prepared.transactionRequest.gasPrice ??
    prepared.transactionRequest.maxFeePerGas ??
    0n;
  const networkFeeBaseUnits =
    receipt?.gasUsed && effectiveGasPrice
      ? (receipt.gasUsed * effectiveGasPrice).toString()
      : prepared.networkFeeBaseUnits;
  const validated = Boolean(receipt && typeof receipt.blockNumber === "number");
  const succeeded =
    validated && typeof receipt.status === "number"
      ? receipt.status === 1
      : false;
  const chainTimestamp = validated
    ? await resolveBlockTimestamp(provider, receipt.blockNumber)
    : undefined;

  return {
    txHash: transactionResponse?.hash || receipt?.hash,
    ledgerIndex: validated ? receipt.blockNumber : undefined,
    networkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
    chainStatus: validated ? (succeeded ? "confirmed" : "failed") : "submitted",
    succeeded,
    validated,
    chainTimestamp,
    confirmedAt: validated ? chainTimestamp : undefined,
    rawRequest: {
      network: input.network,
      rpcUrl,
      transaction: serializeTransactionRequest(prepared.transactionRequest, chainId),
      executionParams: prepared.executionParams,
    },
    rawResponse: {
      transaction: serializeTransactionResponse(transactionResponse),
      receipt: serializeTransactionReceipt(receipt),
    },
    executionParams: prepared.executionParams,
  };
}

async function fetchHistory() {
  const input = arguments[0] || {};
  const network = String(input.network || MAINNET_NETWORK).toLowerCase();
  const address = String(input.address || "").trim();
  const limit = normalizeHistoryLimit(input.limit);
  const explorerConfig = getExplorerApiConfig();

  if (network !== MAINNET_NETWORK) {
    return [];
  }

  if (!explorerConfig.url) {
    logger.warn("Skipping BNB history fetch because BNB_EXPLORER_API_URL is not configured", {
      address,
      network,
    });
    return [];
  }

  if (!wallet.validateAddress(address)) {
    logger.warn("Skipping BNB history fetch because the wallet address is invalid", {
      address,
      network,
    });
    return [];
  }

  try {
    const entries = await fetchExplorerHistory(address, limit);

    return entries
      .filter((entry) => isNativeTransferEntry(entry, address))
      .map((entry) => mapExplorerEntryToHistoryItem(entry))
      .filter((entry) => entry.txHash);
  } catch (error) {
    logger.warn("Failed to fetch BNB history from explorer", {
      address,
      network,
      limit,
      reason: error instanceof Error ? error.message : String(error),
      explorerUrl: explorerConfig.url,
    });
    return [];
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
