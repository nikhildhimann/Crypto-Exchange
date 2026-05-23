const client = require("./client");
const amount = require("./amount");
const wallet = require("./wallet");
const logger = require("../../../common/utils/logger");
const { AppError } = require("../../../helpers/errors");
const {
  buildNativeAssetDescriptor,
  fromAssetBaseUnits,
  normalizeAssetAmount,
  resolveSupportedAsset,
  toAssetBaseUnits,
} = require("../../../common/utils/assets");

const MAINNET_NETWORK = "mainnet";
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const DEFAULT_CONFIRMATION_WAIT_TIMEOUT_MS = 15000;
const CONFIRMATION_POLL_INTERVAL_MS = 1000;
const STANDARD_SIGNATURE_BYTES = 65n;
const MIN_NATIVE_TRANSFER_BANDWIDTH_POINTS = 333n;
const DEFAULT_ACCOUNT_ACTIVATION_FEE_BASE_UNITS = 1_000_000n;
const DEFAULT_TRC20_ENERGY_USAGE = 65_000n;
const DEFAULT_TRC20_FEE_LIMIT_BASE_UNITS = 20_000_000n;
const MAX_TRC20_FEE_LIMIT_BASE_UNITS = 150_000_000n;
const SUPPORTED_EXECUTION_PARAM_KEYS = new Set();
const TRC20_TRANSFER_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

function normalizeAddress(address, label) {
  const normalized = String(address || "").trim();

  if (!wallet.validateAddress(normalized)) {
    throw AppError.validation(`Invalid TRON ${label}`);
  }

  return normalized;
}

function normalizeHistoryLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function getHistoryApiUrl() {
  const url = String(
    process.env.TRON_HISTORY_API_URL || "https://api.trongrid.io/v1",
  ).trim();

  return url.replace(/\/+$/, "");
}

function decodeHexMessage(value) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(normalized)
  ) {
    return normalized;
  }

  try {
    const decoded = Buffer.from(normalized, "hex").toString("utf8").trim();
    return decoded || normalized;
  } catch (_error) {
    return normalized;
  }
}

function extractErrorMessage(error, fallback = "TRON request failed") {
  const candidates = [
    error?.response?.data?.Error,
    error?.response?.data?.error,
    error?.data?.Error,
    error?.data?.error,
    error?.message,
    error?.reason,
  ];

  for (const candidate of candidates) {
    const normalized = decodeHexMessage(candidate);

    if (typeof normalized === "string" && normalized.trim()) {
      return normalized.trim();
    }
  }

  return fallback;
}

function extractTransactionHash(value) {
  const candidates = [
    value?.txHash,
    value?.txid,
    value?.txID,
    value?.transaction?.txID,
    value?.rawResponse?.transaction?.txID,
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

  if (
    normalizedReason.includes("balance is not sufficient") ||
    normalizedReason.includes("account balance is not sufficient") ||
    normalizedReason.includes("transfer amount exceeds balance") ||
    normalizedReason.includes("insufficient token balance")
  ) {
    if (
      normalizedReason.includes("token") ||
      normalizedReason.includes("transfer amount exceeds balance")
    ) {
      return AppError.validation("Insufficient token balance");
    }

    return AppError.validation(
      "Insufficient TRX balance to cover the amount and network fee",
    );
  }

  if (
    normalizedReason.includes("out of energy") ||
    normalizedReason.includes("not enough energy") ||
    normalizedReason.includes("fee limit") ||
    normalizedReason.includes("energy limit") ||
    normalizedReason.includes("bandwidth limit") ||
    normalizedReason.includes("insufficient fee")
  ) {
    return AppError.validation(
      "Insufficient TRX balance or network resources to cover the network fee",
    );
  }

  if (normalizedReason.includes("cannot transfer trx to the same account")) {
    return AppError.validation("Cannot send TRX to the same wallet address");
  }

  if (
    normalizedReason.includes("invalid recipient address") ||
    normalizedReason.includes("invalid toaddress")
  ) {
    return AppError.validation("Invalid TRON destination address");
  }

  if (
    normalizedReason.includes("contract validate error") ||
    normalizedReason.includes("smart contract is not exist") ||
    normalizedReason.includes("contract not exist") ||
    normalizedReason.includes("contract validate internal error")
  ) {
    return AppError.validation("Invalid or unsupported TRC20 token contract");
  }

  if (normalizedReason.includes("revert opcode executed")) {
    return AppError.validation(
      "TRC20 transfer simulation was rejected by the token contract",
    );
  }

  if (
    normalizedReason.includes("dup transaction") ||
    normalizedReason.includes("already exists")
  ) {
    return AppError.conflict(
      "This TRON transaction is already known by the network",
    );
  }

  if (
    normalizedReason.includes("429") ||
    normalizedReason.includes("allowed_rps") ||
    normalizedReason.includes("rate exceeded") ||
    normalizedReason.includes("too many requests") ||
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("network") ||
    normalizedReason.includes("econn") ||
    normalizedReason.includes("fetch") ||
    normalizedReason.includes("rpc")
  ) {
    return new AppError("TRON RPC is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError(fallbackMessage, {
    status: 502,
    errors: { reason },
  });
}

function logResourceFallback(message, metadata = {}) {
  logger.warn(message, metadata);
}

function isDuplicateTransactionReason(reason) {
  const normalizedReason = String(reason || "")
    .trim()
    .toLowerCase();

  return (
    normalizedReason.includes("dup transaction") ||
    normalizedReason.includes("already exists")
  );
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
      `TRON transfers do not support execution params: ${unsupportedKeys.join(", ")}`,
    );
  }

  return {};
}

function buildTransferInput(input = {}) {
  const normalizedAmount = amount.normalizeDisplayAmount(input.amount);
  const amountBaseUnits = BigInt(amount.toBaseUnits(normalizedAmount));

  if (amountBaseUnits <= 0n) {
    throw AppError.validation("TRX amount must be greater than 0");
  }

  const fromAddress = normalizeAddress(input.fromAddress, "source address");
  const toAddress = normalizeAddress(
    input.toAddress || input.destinationAddress,
    "destination address",
  );

  if (fromAddress === toAddress) {
    throw AppError.validation("Cannot send TRX to the same wallet address");
  }

  return {
    amount: normalizedAmount,
    amountBaseUnits: amountBaseUnits.toString(),
    fromAddress,
    toAddress,
  };
}

function buildTokenTransferInput(input = {}) {
  const assetDescriptor = resolveAssetDescriptor(input);
  assertTrc20TokenDescriptor(assetDescriptor);

  if (
    assetDescriptor.features?.send === false ||
    assetDescriptor.toggles?.sendEnabled === false
  ) {
    throw AppError.validation(
      `${assetDescriptor.asset} transfers are currently disabled`,
    );
  }

  const normalizedAmount = normalizeAssetAmount(assetDescriptor, input.amount);
  const amountBaseUnits = BigInt(
    toAssetBaseUnits(assetDescriptor, normalizedAmount),
  );

  if (amountBaseUnits <= 0n) {
    throw AppError.validation(
      `${assetDescriptor.asset} amount must be greater than 0`,
    );
  }

  const fromAddress = normalizeAddress(input.fromAddress, "source address");
  const toAddress = normalizeAddress(
    input.toAddress || input.destinationAddress,
    "destination address",
  );

  if (fromAddress === toAddress) {
    throw AppError.validation(
      `Cannot send ${assetDescriptor.asset} to the same wallet address`,
    );
  }

  return {
    assetDescriptor,
    amount: normalizedAmount,
    amountBaseUnits: amountBaseUnits.toString(),
    fromAddress,
    toAddress,
  };
}

function getUnsignedTransactionSize(unsignedTransaction) {
  const rawHex = String(unsignedTransaction?.raw_data_hex || "").trim();
  if (!rawHex || rawHex.length % 2 !== 0) {
    return MIN_NATIVE_TRANSFER_BANDWIDTH_POINTS;
  }

  const rawBytes = BigInt(rawHex.length / 2);
  const serializedEstimate = rawBytes + STANDARD_SIGNATURE_BYTES;

  return serializedEstimate > MIN_NATIVE_TRANSFER_BANDWIDTH_POINTS
    ? serializedEstimate
    : MIN_NATIVE_TRANSFER_BANDWIDTH_POINTS;
}

function toPositiveBigInt(value, fallback = 0n) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number"
        ? String(Math.trunc(value))
        : String(value).trim();

  if (!/^-?\d+$/.test(normalized)) {
    return fallback;
  }

  const parsed = BigInt(normalized);
  return parsed >= 0n ? parsed : fallback;
}

function resolveAssetDescriptor(input = {}) {
  return resolveSupportedAsset(
    "tron",
    input.network || MAINNET_NETWORK,
    input.asset || input.assetDescriptor?.asset,
  );
}

function isTokenAsset(assetDescriptor) {
  return assetDescriptor?.assetType === "token";
}

function getTrc20TransferFunctionParameters(toAddress, amountBaseUnits) {
  return [
    { type: "address", value: toAddress },
    { type: "uint256", value: String(amountBaseUnits) },
  ];
}

async function getContractInstance(tronClient, token) {
  return tronClient.contract(TRC20_TRANSFER_ABI, token.contractAddress);
}

async function getTokenBalanceBaseUnits(network, tronClient, token, address) {
  const contract = await client.withRpcRetry(
    network,
    `loading ${token.symbol} contract`,
    () => getContractInstance(tronClient, token),
  );
  const result = await client.withRpcRetry(
    network,
    `fetching ${token.symbol} token balance`,
    () => contract.balanceOf(address).call({ from: address }),
  );
  const normalized =
    result && typeof result.toString === "function"
      ? result.toString()
      : String(result ?? "0");

  if (!/^\d+$/.test(normalized)) {
    throw new Error("TRC20 contract returned an invalid integer balance");
  }

  return normalized;
}

async function getNativeBalanceBaseUnits(network, tronClient, address) {
  const balance = await client.withRpcRetry(
    network,
    "fetching TRON account balance",
    () => tronClient.trx.getBalance(address),
  );
  const normalized =
    balance && typeof balance.toString === "function"
      ? balance.toString()
      : String(balance ?? "0");

  if (!/^\d+$/.test(normalized)) {
    throw new Error("TRON RPC returned an invalid integer balance");
  }

  return normalized;
}

async function getAccountResources(network, tronClient, address) {
  try {
    return await client.withRpcRetry(
      network,
      "fetching TRON account resources",
      () => tronClient.trx.getAccountResources(address),
    );
  } catch (error) {
    logResourceFallback("Falling back to zero TRON resources", {
      network,
      address,
      reason: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function getAvailableBandwidthFromResources(resources = {}) {
  const freeNetLimit = toPositiveBigInt(resources.freeNetLimit);
  const freeNetUsed = toPositiveBigInt(resources.freeNetUsed);
  const netLimit = toPositiveBigInt(resources.NetLimit);
  const netUsed = toPositiveBigInt(resources.NetUsed);

  const freeAvailable =
    freeNetLimit > freeNetUsed ? freeNetLimit - freeNetUsed : 0n;
  const stakedAvailable = netLimit > netUsed ? netLimit - netUsed : 0n;

  return freeAvailable + stakedAvailable;
}

function getAvailableEnergyFromResources(resources = {}) {
  const energyLimit = toPositiveBigInt(resources.EnergyLimit);
  const energyUsed = toPositiveBigInt(resources.EnergyUsed);

  return energyLimit > energyUsed ? energyLimit - energyUsed : 0n;
}

function assertTrc20TokenDescriptor(assetDescriptor) {
  if (!assetDescriptor || assetDescriptor.assetType !== "token") {
    throw AppError.validation("Unsupported TRC20 token asset");
  }

  if (assetDescriptor.standard !== "trc20") {
    throw AppError.validation(
      `Token standard "${assetDescriptor.standard}" is not supported for TRON transfers`,
    );
  }

  if (!wallet.validateAddress(assetDescriptor.contractAddress)) {
    throw AppError.validation("Configured TRC20 contract address is invalid");
  }
}

function assertTrc20TriggerSucceeded(result, fallbackMessage) {
  if (result?.result?.result === true) {
    return;
  }

  throw new Error(extractErrorMessage(result, fallbackMessage));
}

function resolveTrc20FeeLimitBaseUnits(networkFeeBaseUnits) {
  const estimated = toPositiveBigInt(networkFeeBaseUnits);
  const buffered = estimated + estimated / 5n + 2_000_000n;

  if (buffered < DEFAULT_TRC20_FEE_LIMIT_BASE_UNITS) {
    return DEFAULT_TRC20_FEE_LIMIT_BASE_UNITS.toString();
  }

  if (buffered > MAX_TRC20_FEE_LIMIT_BASE_UNITS) {
    return MAX_TRC20_FEE_LIMIT_BASE_UNITS.toString();
  }

  return buffered.toString();
}

async function getAccountState(network, tronClient, address) {
  try {
    const account = await client.withRpcRetry(
      network,
      "fetching TRON account state",
      () => tronClient.trx.getAccount(address),
    );
    const exists = Boolean(account && Object.keys(account).length);

    return {
      exists,
      account: exists ? account : {},
    };
  } catch (error) {
    logResourceFallback(
      "Falling back to conservative TRON account-activation fee assumption",
      {
        network,
        address,
        reason: error instanceof Error ? error.message : String(error),
      },
    );
    return {
      exists: false,
      account: {},
    };
  }
}

async function getAvailableBandwidth(network, tronClient, address) {
  try {
    return toPositiveBigInt(
      await client.withRpcRetry(network, "fetching TRON bandwidth", () =>
        tronClient.trx.getBandwidth(address),
      ),
    );
  } catch (error) {
    logResourceFallback("Falling back to zero available TRON bandwidth", {
      network,
      address,
      reason: error instanceof Error ? error.message : String(error),
    });
    return 0n;
  }
}

async function buildPreparedTransfer(network, input) {
  const executionParams = normalizeExecutionParams(input);
  const transferInput = buildTransferInput(input);
  const { client: tronClient, fullHost } =
    await client.assertProviderReady(network);
  const unsignedTransaction = await client.withRpcRetry(
    network,
    "building TRON transfer transaction",
    () =>
      tronClient.transactionBuilder.sendTrx(
        transferInput.toAddress,
        transferInput.amountBaseUnits,
        transferInput.fromAddress,
      ),
  );
  const bandwidthPoints = getUnsignedTransactionSize(unsignedTransaction);
  const bandwidthPrice = BigInt(await client.getBandwidthPrice(network));
  const availableBandwidth = await getAvailableBandwidth(
    network,
    tronClient,
    transferInput.fromAddress,
  );
  const recipientState = await getAccountState(
    network,
    tronClient,
    transferInput.toAddress,
  );
  let chainParameters = {};

  try {
    chainParameters = await client.getChainParameterMap(network);
  } catch (error) {
    logResourceFallback(
      "Falling back to default TRON chain-parameter fee values",
      {
        network,
        reason: error instanceof Error ? error.message : String(error),
      },
    );
    chainParameters = {};
  }

  const accountActivationFeeBaseUnits = recipientState.exists
    ? 0n
    : BigInt(
        Math.max(
          Number(chainParameters.getCreateNewAccountFeeInSystemContract || 0),
          Number(
            chainParameters.getCreateAccountFee ||
              DEFAULT_ACCOUNT_ACTIVATION_FEE_BASE_UNITS,
          ),
        ),
      );
  const bandwidthShortfall =
    bandwidthPoints > availableBandwidth
      ? bandwidthPoints - availableBandwidth
      : 0n;
  const networkFeeBaseUnits = (
    accountActivationFeeBaseUnits +
    bandwidthShortfall * bandwidthPrice
  ).toString();

  return {
    executionParams,
    transferInput,
    unsignedTransaction,
    networkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
    metadata: {
      fullHost,
      bandwidthPoints: bandwidthPoints.toString(),
      availableBandwidth: availableBandwidth.toString(),
      bandwidthPrice: bandwidthPrice.toString(),
      bandwidthShortfall: bandwidthShortfall.toString(),
      accountActivationFeeBaseUnits: accountActivationFeeBaseUnits.toString(),
      recipientAccountExists: recipientState.exists,
    },
  };
}

function getTriggerSmartContractTransaction(result) {
  return result?.transaction || result;
}

async function buildPreparedTrc20Transfer(network, input) {
  const executionParams = normalizeExecutionParams(input);
  const transferInput = buildTokenTransferInput(input);
  const { client: tronClient, fullHost } =
    await client.assertProviderReady(network);
  const functionParameters = getTrc20TransferFunctionParameters(
    transferInput.toAddress,
    transferInput.amountBaseUnits,
  );
  const feeAssetDescriptor = buildNativeAssetDescriptor("tron", network);

  const tokenBalanceBaseUnits = await getTokenBalanceBaseUnits(
    network,
    tronClient,
    transferInput.assetDescriptor,
    transferInput.fromAddress,
  );
  if (BigInt(tokenBalanceBaseUnits) < BigInt(transferInput.amountBaseUnits)) {
    throw AppError.validation(
      `Insufficient ${transferInput.assetDescriptor.asset} balance`,
    );
  }

  const constantTrigger = await client.withRpcRetry(
    network,
    `estimating ${transferInput.assetDescriptor.asset} transfer`,
    () =>
      tronClient.transactionBuilder.triggerConstantContract(
        transferInput.assetDescriptor.contractAddress,
        "transfer(address,uint256)",
        {},
        functionParameters,
        transferInput.fromAddress,
      ),
  );
  assertTrc20TriggerSucceeded(
    constantTrigger,
    `Failed to estimate ${transferInput.assetDescriptor.asset} transfer`,
  );

  const energyUsed = toPositiveBigInt(
    constantTrigger?.energy_used ??
      constantTrigger?.energy_penalty ??
      DEFAULT_TRC20_ENERGY_USAGE,
    DEFAULT_TRC20_ENERGY_USAGE,
  );
  const energyPrice = BigInt(await client.getEnergyPrice(network));
  const bandwidthPrice = BigInt(await client.getBandwidthPrice(network));
  const resources = await getAccountResources(
    network,
    tronClient,
    transferInput.fromAddress,
  );
  const availableEnergy = getAvailableEnergyFromResources(resources);
  const availableBandwidth = getAvailableBandwidthFromResources(resources);

  const preliminaryNetworkFeeBaseUnits = (
    (energyUsed > availableEnergy ? energyUsed - availableEnergy : 0n) *
    energyPrice
  ).toString();
  const feeLimitBaseUnits = resolveTrc20FeeLimitBaseUnits(
    preliminaryNetworkFeeBaseUnits,
  );
  const smartContractTrigger = await client.withRpcRetry(
    network,
    `building ${transferInput.assetDescriptor.asset} transfer transaction`,
    () =>
      tronClient.transactionBuilder.triggerSmartContract(
        transferInput.assetDescriptor.contractAddress,
        "transfer(address,uint256)",
        { feeLimit: Number(feeLimitBaseUnits) },
        functionParameters,
        transferInput.fromAddress,
      ),
  );
  assertTrc20TriggerSucceeded(
    smartContractTrigger,
    `Failed to build ${transferInput.assetDescriptor.asset} transfer transaction`,
  );
  const unsignedTransaction =
    getTriggerSmartContractTransaction(smartContractTrigger);
  const bandwidthPoints = getUnsignedTransactionSize(unsignedTransaction);
  const bandwidthShortfall =
    bandwidthPoints > availableBandwidth
      ? bandwidthPoints - availableBandwidth
      : 0n;
  const energyShortfall =
    energyUsed > availableEnergy ? energyUsed - availableEnergy : 0n;
  const networkFeeBaseUnits = (
    energyShortfall * energyPrice +
    bandwidthShortfall * bandwidthPrice
  ).toString();
  const nativeBalanceBaseUnits = await getNativeBalanceBaseUnits(
    network,
    tronClient,
    transferInput.fromAddress,
  );

  if (BigInt(nativeBalanceBaseUnits) < BigInt(networkFeeBaseUnits)) {
    const requiredFee = fromAssetBaseUnits(
      feeAssetDescriptor,
      networkFeeBaseUnits,
    );
    const actualBalance = fromAssetBaseUnits(
      feeAssetDescriptor,
      nativeBalanceBaseUnits,
    );
    const err = AppError.validation(
      `Insufficient TRX balance to cover the network fee. Required: ${requiredFee} TRX, available: ${actualBalance} TRX. Please top up your Tron wallet with TRX to send ${transferInput.assetDescriptor.asset}.`,
    );
    err.requiredFeeBaseUnits = networkFeeBaseUnits;
    err.requiredFee = requiredFee;
    err.requiredFeeAsset = "TRX";
    err.actualBalanceBaseUnits = nativeBalanceBaseUnits;
    err.actualBalance = actualBalance;
    throw err;
  }

  return {
    executionParams,
    transferInput,
    unsignedTransaction,
    constantTrigger,
    networkFeeBaseUnits,
    networkFee: fromAssetBaseUnits(feeAssetDescriptor, networkFeeBaseUnits),
    networkFeeAssetDescriptor: feeAssetDescriptor,
    metadata: {
      fullHost,
      feeLimitBaseUnits,
      feeLimit: fromAssetBaseUnits(feeAssetDescriptor, feeLimitBaseUnits),
      energyUsed: energyUsed.toString(),
      availableEnergy: availableEnergy.toString(),
      energyPrice: energyPrice.toString(),
      energyShortfall: energyShortfall.toString(),
      bandwidthPoints: bandwidthPoints.toString(),
      availableBandwidth: availableBandwidth.toString(),
      bandwidthPrice: bandwidthPrice.toString(),
      bandwidthShortfall: bandwidthShortfall.toString(),
      tokenBalanceBaseUnits,
      tokenBalance: fromAssetBaseUnits(
        transferInput.assetDescriptor,
        tokenBalanceBaseUnits,
      ),
      nativeBalanceBaseUnits,
      nativeBalance: fromAssetBaseUnits(
        feeAssetDescriptor,
        nativeBalanceBaseUnits,
      ),
    },
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

  const numericValue =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value).trim(), 10);

  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  const timestamp = new Date(
    numericValue > 10_000_000_000 ? numericValue : numericValue * 1000,
  );
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

async function waitForTransactionInfo(
  network,
  tronClient,
  txHash,
  timeoutMs = DEFAULT_CONFIRMATION_WAIT_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [transactionInfo, transaction] = await Promise.allSettled([
      client.withRpcRetry(network, "fetching TRON transaction info", () =>
        tronClient.trx.getTransactionInfo(txHash),
      ),
      client.withRpcRetry(network, "fetching TRON transaction", () =>
        tronClient.trx.getTransaction(txHash),
      ),
    ]);
    const resolvedTransactionInfo =
      transactionInfo.status === "fulfilled" ? transactionInfo.value : null;
    const resolvedTransaction =
      transaction.status === "fulfilled" ? transaction.value : null;
    const hasConfirmation =
      resolvedTransactionInfo &&
      typeof resolvedTransactionInfo.blockNumber === "number";

    if (hasConfirmation) {
      return {
        transactionInfo: resolvedTransactionInfo,
        transaction: resolvedTransaction,
      };
    }

    await new Promise((resolve) => {
      setTimeout(resolve, CONFIRMATION_POLL_INTERVAL_MS);
    });
  }

  return {
    transactionInfo: null,
    transaction: null,
  };
}

function isTransactionSuccessful(transactionInfo, transaction) {
  const contractRet = String(transaction?.ret?.[0]?.contractRet || "")
    .trim()
    .toUpperCase();
  if (contractRet) {
    return contractRet === "SUCCESS";
  }

  const resultValue = String(
    transactionInfo?.receipt?.result ||
      transactionInfo?.result ||
      transactionInfo?.resMessage ||
      "",
  )
    .trim()
    .toUpperCase();

  if (!resultValue) {
    return true;
  }

  return resultValue === "SUCCESS" || resultValue === "SUCESS";
}

async function validateDestination(input) {
  const executionParams = normalizeExecutionParams(input);
  const assetDescriptor = resolveAssetDescriptor(input);
  const destinationAddress = normalizeAddress(
    input.destinationAddress,
    "destination address",
  );
  const sourceAddress = normalizeAddress(input.fromAddress, "source address");

  if (destinationAddress === sourceAddress) {
    throw AppError.validation(
      `Cannot send ${assetDescriptor.asset} to the same wallet address`,
    );
  }

  return {
    asset: assetDescriptor.asset,
    currency: assetDescriptor.symbol,
    assetType: assetDescriptor.assetType,
    standard: assetDescriptor.standard,
    contractAddress: assetDescriptor.contractAddress,
    destinationAddress,
    executionParams,
  };
}

async function estimateTransfer(input) {
  try {
    const assetDescriptor = resolveAssetDescriptor(input);
    const prepared = isTokenAsset(assetDescriptor)
      ? await buildPreparedTrc20Transfer(input.network, {
          ...input,
          assetDescriptor,
        })
      : await buildPreparedTransfer(input.network, input);
    const networkFeeAssetDescriptor =
      prepared.networkFeeAssetDescriptor ||
      buildNativeAssetDescriptor("tron", input.network);

    return {
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      networkFee: prepared.networkFee,
      networkFeeAsset: networkFeeAssetDescriptor.asset,
      networkFeeAssetDescriptor,
      preparedTransaction: {
        fromAddress: prepared.transferInput.fromAddress,
        toAddress: prepared.transferInput.toAddress,
        amount: prepared.transferInput.amount,
        amountBaseUnits: prepared.transferInput.amountBaseUnits,
        asset: assetDescriptor.asset,
        assetType: assetDescriptor.assetType,
        standard: assetDescriptor.standard,
        contractAddress: assetDescriptor.contractAddress,
        txID:
          prepared.unsignedTransaction?.txID ||
          prepared.unsignedTransaction?.transaction?.txID,
        ...prepared.metadata,
      },
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to estimate TRON transfer");
  }
}

async function assertPreviewTransferAllowed({ preview, fromBaseUnits }) {
  const asset = String(preview?.asset || "TRX")
    .trim()
    .toUpperCase();
  const assetType = String(preview?.assetType || "native")
    .trim()
    .toLowerCase();
  const amountBaseUnits = BigInt(
    String(preview?.amountBaseUnits ?? preview?.recipientGetsBaseUnits ?? "0"),
  );
  const networkFeeBaseUnits = BigInt(
    String(preview?.networkFeeBaseUnits ?? "0"),
  );

  if (amountBaseUnits <= 0n) {
    throw AppError.validation(`${asset} amount must be greater than 0`);
  }

  if (networkFeeBaseUnits < 0n) {
    throw new AppError("Unable to determine TRON network fee", {
      status: 502,
      errors: {
        reason: "TRON fee estimate returned a negative network fee",
      },
    });
  }

  if (
    assetType !== "token" &&
    networkFeeBaseUnits > 0n &&
    amountBaseUnits < networkFeeBaseUnits
  ) {
    throw AppError.validation(
      `${asset} amount is too small relative to the current network fee (${fromBaseUnits(networkFeeBaseUnits)} TRX)`,
    );
  }

  if (
    assetType === "token" &&
    amountBaseUnits === 1n &&
    networkFeeBaseUnits > 0n
  ) {
    throw AppError.validation(
      `${asset} amount is too small for a practical on-chain TRC20 transfer at current network conditions`,
    );
  }
}

function buildSubmissionResult({
  network,
  prepared,
  txHash,
  confirmation,
  signedTransaction,
  broadcast,
  input,
  fullHost,
  assetDescriptor,
}) {
  const transactionInfo = confirmation.transactionInfo;
  const transaction = confirmation.transaction;
  const validated = Boolean(
    transactionInfo && typeof transactionInfo.blockNumber === "number",
  );
  const succeeded = validated
    ? isTransactionSuccessful(transactionInfo, transaction)
    : false;
  const networkFeeAssetDescriptor =
    prepared.networkFeeAssetDescriptor ||
    buildNativeAssetDescriptor("tron", network);
  const networkFeeBaseUnits = validated
    ? String(transactionInfo.fee || prepared.networkFeeBaseUnits)
    : prepared.networkFeeBaseUnits;
  const chainTimestamp = validated
    ? normalizeChainTimestamp(transactionInfo.blockTimeStamp)
    : undefined;

  return {
    txHash,
    ledgerIndex: validated ? transactionInfo.blockNumber : undefined,
    networkFeeBaseUnits,
    networkFee: fromAssetBaseUnits(
      networkFeeAssetDescriptor,
      networkFeeBaseUnits,
    ),
    networkFeeAsset: networkFeeAssetDescriptor.asset,
    networkFeeAssetDescriptor,
    chainStatus: validated ? (succeeded ? "confirmed" : "failed") : "submitted",
    succeeded,
    validated,
    chainTimestamp,
    block_time: chainTimestamp,
    confirmed_at: validated ? chainTimestamp : undefined,
    confirmedAt: validated ? chainTimestamp : undefined,
    rawRequest: {
      network: input.network,
      fullHost,
      transaction: serializeValue(signedTransaction),
      executionParams: prepared.executionParams,
      asset: assetDescriptor.asset,
      assetType: assetDescriptor.assetType,
      standard: assetDescriptor.standard,
      contractAddress: assetDescriptor.contractAddress,
    },
    rawResponse: {
      broadcast: serializeValue(broadcast),
      transaction: serializeValue(transaction || signedTransaction),
      transactionInfo: serializeValue(transactionInfo || {}),
    },
    executionParams: prepared.executionParams,
  };
}

async function executeTransfer(input) {
  try {
    const assetDescriptor = resolveAssetDescriptor(input);
    const prepared = isTokenAsset(assetDescriptor)
      ? await buildPreparedTrc20Transfer(input.network, {
          ...input,
          assetDescriptor,
        })
      : await buildPreparedTransfer(input.network, input);
    const { client: tronClient, fullHost } = await client.assertProviderReady(
      input.network,
    );
    const derivedWallet = await wallet.deriveWalletFromMnemonic(input.mnemonic);
    const normalizedFromAddress = normalizeAddress(
      input.fromAddress,
      "source address",
    );
    const normalizedPrivateKey = String(
      derivedWallet?.wallet?.privateKey || "",
    ).replace(/^0x/i, "");

    if (!normalizedPrivateKey) {
      throw AppError.conflict("Derived wallet secret mismatch");
    }

    if (
      String(derivedWallet?.wallet?.address || "").trim() !==
      normalizedFromAddress
    ) {
      throw AppError.conflict("Derived wallet address mismatch");
    }

    const signedTransaction = await tronClient.trx.sign(
      prepared.unsignedTransaction,
      normalizedPrivateKey,
    );
    const broadcast = await client.withRpcRetry(
      input.network,
      "broadcasting TRON transfer",
      () => tronClient.trx.sendRawTransaction(signedTransaction),
    );
    const txHash =
      extractTransactionHash(broadcast) || prepared.unsignedTransaction.txID;
    const broadcastReason = extractErrorMessage(
      broadcast,
      "TRON network rejected the transaction",
    );

    if (broadcast?.result !== true) {
      if (txHash && isDuplicateTransactionReason(broadcastReason)) {
        const confirmation = await waitForTransactionInfo(
          input.network,
          tronClient,
          txHash,
        );

        return buildSubmissionResult({
          network: input.network,
          prepared,
          txHash,
          confirmation,
          signedTransaction,
          broadcast,
          input,
          fullHost,
          assetDescriptor,
        });
      }

      throw Object.assign(new Error(broadcastReason), {
        txid: txHash,
        code: broadcast?.code,
        data: {
          reason: broadcastReason,
        },
      });
    }

    const confirmation = await waitForTransactionInfo(
      input.network,
      tronClient,
      txHash,
    );
    return buildSubmissionResult({
      network: input.network,
      prepared,
      txHash,
      confirmation,
      signedTransaction,
      broadcast,
      input,
      fullHost,
      assetDescriptor,
    });
  } catch (error) {
    throw buildRpcError(error, "Failed to submit TRON transfer");
  }
}

function isNativeTransferEntry(entry = {}) {
  const contractType = String(
    entry?.contractType ??
      entry?.contract_type ??
      entry?.contractRetType ??
      entry?.raw_data?.contract?.[0]?.type ??
      "",
  )
    .trim()
    .toLowerCase();
  const tokenAbbr = String(entry?.tokenInfo?.tokenAbbr || entry?.token_abbr || "")
    .trim()
    .toUpperCase();
  const hasNativeAmount =
    String(entry?.contractData?.amount ?? entry?.amount ?? "").trim() !== "";

  return (
    Number(entry?.contractType) === 1 ||
    contractType === "1" ||
    contractType === "transfercontract" ||
    (tokenAbbr === "TRX" && hasNativeAmount)
  );
}

function isSupportedTrc20Entry(entry = {}) {
  const contractAddress = extractTrc20ContractAddress(entry);

  if (!contractAddress) {
    return false;
  }

  try {
    const normalizedContract = normalizeTronContractAddress(contractAddress);
    const assetDescriptor = resolveSupportedAsset(
      "tron",
      MAINNET_NETWORK,
      normalizedContract,
    );

    return (
      assetDescriptor.assetType === "token" &&
      assetDescriptor.standard === "trc20"
    );
  } catch (_error) {
    return false;
  }
}

function extractExplorerArray(payload, candidatePaths = []) {
  for (const path of candidatePaths) {
    let cursor = payload;
    let failed = false;

    for (const segment of path) {
      if (!cursor || typeof cursor !== "object") {
        failed = true;
        break;
      }

      cursor = cursor[segment];
    }

    if (!failed && Array.isArray(cursor)) {
      return cursor;
    }
  }

  return [];
}

async function fetchNativeHistory(address, limit) {
  const baseUrl = getHistoryApiUrl();
  const url = new URL(`${baseUrl}/accounts/${address}/transactions`);
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("limit", String(limit));

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: abortController.signal,
      headers: {
        accept: "application/json",
        "TRON-PRO-API-KEY": process.env.TRON_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`TronGrid native history HTTP ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTrc20History(address, limit) {
  const baseUrl = getHistoryApiUrl();
  const url = new URL(`${baseUrl}/accounts/${address}/transactions/trc20`);
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("limit", String(limit));
  const configuredContract =
    process.env.TRON_USDT_CONTRACT || "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

  url.searchParams.set(
    "contract_address",
    normalizeTronContractAddress(configuredContract),
  );

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: abortController.signal,
      headers: {
        accept: "application/json",
        "TRON-PRO-API-KEY": process.env.TRON_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`TronGrid TRC20 history HTTP ${response.status}`);
    }

    const payload = await response.json();
    return extractExplorerArray(payload, [
      ["data"],
      ["token_transfers"],
      ["data", "token_transfers"],
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHistory(input = {}) {
  const network = String(input.network || MAINNET_NETWORK)
    .trim()
    .toLowerCase();

  const address = String(input.address || "").trim();
  const limit = normalizeHistoryLimit(input.limit);

  if (network !== MAINNET_NETWORK) {
    return [];
  }

  if (!wallet.validateAddress(address)) {
    logger.warn("Invalid TRON address for history", {
      address,
      network,
    });
    return [];
  }

  const historyApiUrl = getHistoryApiUrl();

  if (!historyApiUrl) {
    logger.warn(
      "TRON history sync skipped because no explorer APIs are configured",
      {
        address,
        network,
        env: {
          TRON_HISTORY_API_URL: historyApiUrl,
        },
      },
    );
    return [];
  }

  const nativePromise = fetchNativeHistory(address, limit).catch((error) => {
    logger.warn("Native TRON history fetch failed", {
      address,
      network,
      reason: error.message,
    });
    return [];
  });

  const tokenPromise = fetchTrc20History(address, limit).catch((error) => {
    logger.warn("TRON TRC20 history fetch failed", {
      address,
      network,
      reason: error.message,
    });
    return [];
  });

  const [nativeEntries, tokenEntries] = await Promise.all([
    nativePromise,
    tokenPromise,
  ]);

  logger.warn("TRON TRC20 fetch summary", {
    address,
    network,
    tokenCount: tokenEntries.length,
    firstTokenSample: tokenEntries[0]
      ? {
          transaction_id: tokenEntries[0].transaction_id || tokenEntries[0].txID,
          from: tokenEntries[0].from || tokenEntries[0].from_address,
          to: tokenEntries[0].to || tokenEntries[0].to_address,
          contract_address:
            tokenEntries[0].contract_address ||
            tokenEntries[0].token_info?.address ||
            tokenEntries[0].tokenInfo?.address,
          value:
            tokenEntries[0].value ||
            tokenEntries[0].amount ||
            tokenEntries[0].quant,
        }
      : null,
  });

  const combinedEntries = [
    ...nativeEntries.filter(isNativeTransferEntry),
    ...tokenEntries.filter(isSupportedTrc20Entry),
  ];

  const dedupedEntries = Array.from(
    new Map(
      combinedEntries.map((entry) => {
        const txHash = String(
          entry?.hash || entry?.txID || entry?.txid || entry?.transaction_id || "",
        ).trim();
        const timestamp = Number(entry?.timestamp || entry?.block_ts || 0);
        const contractAddress = extractTrc20ContractAddress(entry);
        const fromAddress = String(
          entry?.from ||
            entry?.from_address ||
            entry?.ownerAddress ||
            entry?.contractData?.owner_address ||
            entry?.raw_data?.contract?.[0]?.parameter?.value?.owner_address ||
            "",
        ).trim();
        const toAddress = String(
          entry?.to ||
            entry?.to_address ||
            entry?.toAddress ||
            entry?.contractData?.to_address ||
            entry?.raw_data?.contract?.[0]?.parameter?.value?.to_address ||
            "",
        ).trim();
        const key =
          txHash ||
          `${contractAddress}:${timestamp}:${fromAddress}:${toAddress}`;
        return [key, entry];
      }),
    ).values(),
  );

  return dedupedEntries
    .sort((a, b) => {
      const aTs = Number(a.timestamp || a.block_ts || 0);
      const bTs = Number(b.timestamp || b.block_ts || 0);
      return bTs - aTs;
    })
    .slice(0, limit);
}

function normalizeTronContractAddress(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    if (/^41[0-9a-fA-F]{40}$/.test(normalized)) {
      return client.TronWeb.address.fromHex(normalized);
    }

    if (wallet.validateAddress(normalized)) {
      return normalized;
    }
  } catch (_error) {
    // ignore and fall through
  }

  return normalized;
}

function extractTrc20ContractAddress(entry = {}) {
  return normalizeTronContractAddress(
    entry?.contract_address ||
      entry?.token_info?.address ||
      entry?.token_info?.tokenId ||
      entry?.tokenInfo?.address ||
      entry?.tokenInfo?.tokenId ||
      entry?.token_address ||
      entry?.contractAddress ||
      entry?.token?.address ||
      "",
  );
}

function toHexContractAddress(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    if (/^41[0-9a-fA-F]{40}$/.test(normalized)) {
      return normalized;
    }

    if (wallet.validateAddress(normalized)) {
      const hex = client.TronWeb.address.toHex(normalized);
      return String(hex || "").replace(/^0x/i, "");
    }
  } catch (_error) {
    // ignore
  }

  return normalized;
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
