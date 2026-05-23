const { Wallet, getAddress } = require("ethers");

const client = require("./client");
const amount = require("./amount");
const wallet = require("./wallet");
const logger = require("../../../common/utils/logger");
const { AppError } = require("../../../helpers/errors");

const DEFAULT_NATIVE_GAS_LIMIT = 21000n;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const DEFAULT_CONFIRMATION_WAIT_TIMEOUT_MS = 15000;
const MAINNET_NETWORK = "mainnet";
const NATIVE_HISTORY_ACTION = "txlist";
const TOKEN_HISTORY_ACTION = "tokentx";
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
    throw AppError.validation(`Invalid Arbitrum ${label}`);
  }

  return getAddress(normalized);
}

function extractErrorMessage(error, fallback = "Arbitrum request failed") {
  const candidates = [
    error?.shortMessage,
    error?.info?.error?.message,
    error?.info?.payload?.error?.message,
    error?.error?.message,
    error?.reason,
    error?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

function extractTransactionHash(error) {
  const candidates = [
    error?.transactionHash,
    error?.hash,
    error?.receipt?.hash,
    error?.transaction?.hash,
    error?.info?.hash,
    error?.info?.transactionHash,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function buildRpcError(error, fallbackMessage) {
  if (error instanceof AppError) {
    return error;
  }

  const reason = extractErrorMessage(error, fallbackMessage);
  const normalizedReason = reason.toLowerCase();

  if (normalizedReason.includes("insufficient funds")) {
    return AppError.validation("Insufficient Arbitrum ETH balance to cover the amount and network fee");
  }

  if (normalizedReason.includes("nonce too low")) {
    return AppError.conflict("Arbitrum transaction nonce is no longer valid. Please try again");
  }

  if (
    normalizedReason.includes("replacement transaction underpriced") ||
    normalizedReason.includes("replacement underpriced")
  ) {
    return AppError.conflict("A conflicting Arbitrum transaction is already pending for this wallet");
  }

  if (normalizedReason.includes("already known")) {
    return AppError.conflict("This Arbitrum transaction is already known by the network");
  }

  if (
    normalizedReason.includes("network error") ||
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("socket") ||
    normalizedReason.includes("econn") ||
    normalizedReason.includes("failed to fetch") ||
    normalizedReason.includes("rpc")
  ) {
    return new AppError("Arbitrum RPC is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError(fallbackMessage, {
    status: 502,
    errors: { reason },
  });
}

function normalizeHistoryLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function normalizeConfiguredEnvValue(value) {
  const normalized = String(value || "").trim();
  return normalized.replace(/^['"]+|['"]+$/g, "").trim();
}

function normalizeExplorerApiUrl(value) {
  const configuredUrl = normalizeConfiguredEnvValue(value);

  if (!configuredUrl) {
    return "";
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(configuredUrl);
  } catch (_error) {
    return configuredUrl;
  }

  const normalizedHost = String(parsedUrl.hostname || "").toLowerCase();
  const normalizedPath = String(parsedUrl.pathname || "").replace(/\/+$/, "");

  if (normalizedHost === "api.arbiscan.io") {
    parsedUrl.hostname = "api.etherscan.io";
    parsedUrl.pathname = "/v2/api";
    parsedUrl.search = "";
    return parsedUrl.toString();
  }

  if (normalizedHost === "api.etherscan.io" && normalizedPath === "/api") {
    parsedUrl.pathname = "/v2/api";
    parsedUrl.search = "";
    return parsedUrl.toString();
  }

  return parsedUrl.toString();
}

function getExplorerApiConfig() {
  return {
    url: normalizeExplorerApiUrl(process.env.ARBITRUM_EXPLORER_API_URL),
    apiKey: normalizeConfiguredEnvValue(process.env.ARBITRUM_EXPLORER_API_KEY),
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

function buildExplorerHistoryUrl(address, limit, action = NATIVE_HISTORY_ACTION) {
  const { url, apiKey } = getExplorerApiConfig();
  const requestUrl = new URL(url);

  requestUrl.searchParams.set("chainid", String(client.getConfiguredChainId()));
  requestUrl.searchParams.set("module", "account");
  requestUrl.searchParams.set("action", action);
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

async function fetchExplorerHistory(address, limit, action = NATIVE_HISTORY_ACTION) {
  const requestUrl = buildExplorerHistoryUrl(address, limit, action);
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

function isTokenTransferEntry(entry = {}, walletAddress) {
  const value = String(entry.value ?? "").trim();
  const fromAddress = String(entry.from || "").trim().toLowerCase();
  const toAddress = String(entry.to || "").trim().toLowerCase();
  const targetAddress = String(walletAddress || "").trim().toLowerCase();
  const contractAddress = String(entry.contractAddress || "").trim();

  if (!contractAddress) {
    return false;
  }

  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) {
    return false;
  }

  if (!fromAddress && !toAddress) {
    return false;
  }

  return fromAddress === targetAddress || toAddress === targetAddress;
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

function mapExplorerEntryToHistoryItem(entry = {}, options = {}) {
  const blockNumber = normalizeExplorerEntryNumber(entry.blockNumber);
  const confirmations = normalizeExplorerEntryNumber(entry.confirmations);
  const { succeeded, chainStatus } = normalizeExplorerStatus(entry);
  const historyAction = String(options.historyAction || NATIVE_HISTORY_ACTION).trim().toLowerCase();

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
    historyAction,
    explorer: serializeValue(entry),
  };
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
      `Arbitrum native transfers do not support execution params: ${unsupportedKeys.join(", ")}`,
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
      "Use either gasPrice or maxFeePerGas/maxPriorityFeePerGas for Arbitrum transfers, not both",
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
  const normalizedAmount = amount.normalizeDisplayAmount(input.amount);
  const valueBaseUnits = BigInt(amount.toBaseUnits(normalizedAmount));

  if (valueBaseUnits <= 0n) {
    throw AppError.validation("Arbitrum ETH amount must be greater than 0");
  }

  return {
    from: normalizeAddress(input.fromAddress, "source address"),
    to: normalizeAddress(input.toAddress || input.destinationAddress, "destination address"),
    value: valueBaseUnits,
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

    throw buildRpcError(error, "Failed to estimate Arbitrum gas limit");
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
      throw AppError.internal("Unable to determine Arbitrum maxFeePerGas");
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
    throw new AppError("Unable to determine Arbitrum network fee", {
      status: 502,
      errors: {
        reason: "Arbitrum RPC did not return gas price or EIP-1559 fee data",
      },
    });
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

function serializeError(error) {
  if (!error) {
    return null;
  }

  return serializeValue({
    code: error.code,
    reason: extractErrorMessage(error, ""),
    transactionHash: extractTransactionHash(error) || undefined,
  });
}

async function waitForReceiptWithTimeout(transactionResponse, timeoutMs = DEFAULT_CONFIRMATION_WAIT_TIMEOUT_MS) {
  if (!transactionResponse || typeof transactionResponse.wait !== "function") {
    return null;
  }

  return Promise.race([
    transactionResponse.wait(),
    new Promise((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
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
  const destinationAddress = normalizeAddress(
    input.destinationAddress,
    "destination address",
  );

  return {
    destinationAddress,
    executionParams: normalizeExecutionParams(input),
  };
}

async function estimateTransfer(input) {
  try {
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
  } catch (error) {
    throw buildRpcError(error, "Failed to estimate Arbitrum transfer");
  }
}

async function assertPreviewTransferAllowed({
  preview,
  fromBaseUnits,
}) {
  const amountBaseUnits = BigInt(String(
    preview?.amountBaseUnits ?? preview?.recipientGetsBaseUnits ?? "0",
  ));
  const networkFeeBaseUnits = BigInt(String(preview?.networkFeeBaseUnits ?? "0"));

  if (amountBaseUnits <= 0n) {
    throw AppError.validation("Arbitrum ETH amount must be greater than 0");
  }

  if (networkFeeBaseUnits <= 0n) {
    throw new AppError("Unable to determine Arbitrum network fee", {
      status: 502,
      errors: {
        reason: "Arbitrum gas estimate returned a zero network fee",
      },
    });
  }

  if (amountBaseUnits < networkFeeBaseUnits) {
    throw AppError.validation(
      `Arbitrum ETH amount is too small relative to the current network fee (${fromBaseUnits(networkFeeBaseUnits)} ETH)`,
    );
  }
}

async function executeTransfer(input) {
  try {
    const { provider, chainId, rpcUrl } = await client.assertProviderReady(input.network);
    const prepared = await buildPreparedTransfer(provider, input);
    const derivedWallet = wallet.deriveWalletFromMnemonic(input.mnemonic).wallet;
    const signer = new Wallet(derivedWallet.privateKey, provider);
    const normalizedFromAddress = normalizeAddress(input.fromAddress, "source address");

    if (getAddress(signer.address) !== normalizedFromAddress) {
      throw AppError.conflict("Derived wallet address mismatch");
    }

    let transactionResponse;
    let receipt = null;
    let waitError = null;

    try {
      transactionResponse = await signer.sendTransaction(prepared.transactionRequest);
      receipt = await waitForReceiptWithTimeout(transactionResponse);
    } catch (error) {
      waitError = error;
      receipt = resolveReceiptFromError(error);

      if (!transactionResponse) {
        const extractedTxHash = extractTransactionHash(error);
        if (!receipt && extractedTxHash) {
          return {
            txHash: extractedTxHash,
            ledgerIndex: undefined,
            networkFeeBaseUnits: prepared.networkFeeBaseUnits,
            networkFee: amount.fromBaseUnits(prepared.networkFeeBaseUnits),
            chainStatus: "submitted",
            succeeded: false,
            validated: false,
            rawRequest: {
              network: input.network,
              rpcUrl,
              transaction: serializeTransactionRequest(prepared.transactionRequest, chainId),
              executionParams: prepared.executionParams,
            },
            rawResponse: {
              error: serializeError(error),
            },
            executionParams: prepared.executionParams,
          };
        }

        throw error;
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
      block_time: chainTimestamp,
      confirmed_at: validated ? chainTimestamp : undefined,
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
        ...(waitError ? { waitError: serializeError(waitError) } : {}),
      },
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to submit Arbitrum transfer");
  }
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
    logger.warn("Skipping Arbitrum history fetch because ARBITRUM_EXPLORER_API_URL is not configured", {
      address,
      network,
    });
    return [];
  }

  if (!wallet.validateAddress(address)) {
    logger.warn("Skipping Arbitrum history fetch because the wallet address is invalid", {
      address,
      network,
    });
    return [];
  }

  try {
    const [nativeEntries, tokenEntries] = await Promise.all([
      fetchExplorerHistory(address, limit, NATIVE_HISTORY_ACTION),
      fetchExplorerHistory(address, limit, TOKEN_HISTORY_ACTION),
    ]);

    return [...nativeEntries
      .filter((entry) => isNativeTransferEntry(entry, address))
      .map((entry) => mapExplorerEntryToHistoryItem(entry, {
        historyAction: NATIVE_HISTORY_ACTION,
      })), ...tokenEntries
      .filter((entry) => isTokenTransferEntry(entry, address))
      .map((entry) => mapExplorerEntryToHistoryItem(entry, {
        historyAction: TOKEN_HISTORY_ACTION,
      }))]
      .sort((left, right) => Number(right?.timestamp || 0) - Number(left?.timestamp || 0))
      .filter((entry) => entry.txHash);
  } catch (error) {
    logger.warn("Failed to fetch Arbitrum history from explorer", {
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
  assertPreviewTransferAllowed,
  estimateTransfer,
  executeTransfer,
  fetchHistory,
  validateAddress: wallet.validateAddress,
};
