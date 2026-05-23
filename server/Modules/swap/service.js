const crypto = require("crypto");

const balanceService = require("../balance/service");
const feeService = require("../transaction/fee.service");
const marketService = require("../market/service");
const Transaction = require("../transaction/model");
const transactionService = require("../transaction/service");
const Wallet = require("../wallet/model");
const walletService = require("../wallet/service");
const Swap = require("./model");
const swapConfig = require("../../config/swap");
const atomicityService = require("../../services/atomicity.service");
const logger = require("../../common/utils/logger");
const { AppError } = require("../../helpers/errors");
const { addBaseUnits, isBaseUnitsGte } = require("../../common/utils/amount");
const { normalizeTxHash } = require("../../common/utils/txHash");
const { buildTransactionExplorerUrl } = require("../../common/utils/explorer");
const {
  assertChainFeature,
  assertSupportedChainNetwork,
  getChainLabel,
  getNetworkLabel,
} = require("../../common/utils/chain");
const {
  buildNativeAssetDescriptor,
  fromAssetBaseUnits,
  normalizeAssetAmount,
  toAssetBaseUnits,
} = require("../../common/utils/assets");
const { buildWalletVisibilityFilter } = require("../../common/utils/walletState");

const PRICE_SCALE = 12;
const USD_SCALE = 12;
const RATE_SCALE = 18;
const BASIS_POINTS_DIVISOR = 10000n;
const PAYOUT_SUBMISSION_STALE_WINDOW_MS =
  atomicityService.DEFAULT_OPERATION_LOCK_TTL_MS;

const SWAP_FAILURE_CODES = Object.freeze({
  QUOTE_EXPIRED: "SWAP_QUOTE_EXPIRED",
  SOURCE_SUBMISSION_FAILED: "SWAP_SOURCE_SUBMISSION_FAILED",
  SOURCE_TRANSACTION_MISSING: "SWAP_SOURCE_TRANSACTION_MISSING",
  SOURCE_TRANSACTION_NOT_FOUND: "SWAP_SOURCE_TRANSACTION_NOT_FOUND",
  SOURCE_TRANSACTION_FAILED: "SWAP_SOURCE_TRANSACTION_FAILED",
  DESTINATION_LIQUIDITY_INSUFFICIENT: "SWAP_DESTINATION_LIQUIDITY_INSUFFICIENT",
  DESTINATION_CONFIG_INVALID: "SWAP_DESTINATION_CONFIG_INVALID",
  PAYOUT_PREPARATION_FAILED: "SWAP_PAYOUT_PREPARATION_FAILED",
  PAYOUT_SUBMISSION_FAILED: "SWAP_PAYOUT_SUBMISSION_FAILED",
  PAYOUT_SUBMISSION_UNCERTAIN: "SWAP_PAYOUT_SUBMISSION_UNCERTAIN",
  PAYOUT_CHAIN_REJECTED: "SWAP_PAYOUT_CHAIN_REJECTED",
  PAYOUT_TRANSACTION_MISSING: "SWAP_PAYOUT_TRANSACTION_MISSING",
});
const SWAP_USER_MESSAGES = Object.freeze({
  INSUFFICIENT_BALANCE: "Insufficient balance to complete this swap.",
  AMOUNT_TOO_SMALL:
    "This amount is too small for this network. Please enter a higher amount.",
  PRICE_UNAVAILABLE:
    "Live pricing is temporarily unavailable for this swap route.",
  FEE_ESTIMATION_FAILED:
    "Destination network fee estimation is temporarily unavailable for this swap route.",
  LIQUIDITY_INSUFFICIENT:
    "Destination liquidity is temporarily unavailable for this swap route.",
  TEMPORARILY_UNAVAILABLE:
    "This swap is temporarily unavailable. Please try again after some time.",
  QUOTE_EXPIRED:
    "Swap quote expired. Enter the amount again to refresh the preview.",
  SWAP_FAILED: "This swap could not be completed.",
});
const SWAP_VALIDATION_CODES = Object.freeze({
  AMOUNT_TOO_SMALL: "swap_amount_too_small",
  PRICE_UNAVAILABLE: "PRICE_UNAVAILABLE",
  FEE_ESTIMATION_FAILED: "FEE_ESTIMATION_FAILED",
  LIQUIDITY_INSUFFICIENT: "LIQUIDITY_INSUFFICIENT",
});
const FINAL_SWAP_STATUS_SET = new Set([
  "completed",
  "failed",
  "payout_failed",
  "manual_review",
  "expired",
]);

const POWER_OF_TEN = new Map([[0, 1n]]);

function getPowerOfTen(exponent) {
  const safeExponent = Math.max(Number(exponent) || 0, 0);
  if (!POWER_OF_TEN.has(safeExponent)) {
    POWER_OF_TEN.set(safeExponent, 10n ** BigInt(safeExponent));
  }

  return POWER_OF_TEN.get(safeExponent);
}

function normalizeAddress(value) {
  return String(value || "").trim();
}

function normalizeComparableString(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isXrpChain(value = "") {
  return normalizeComparableString(value) === "xrp";
}

function normalizeErrorMessage(error, fallbackMessage = "Swap request failed") {
  if (error instanceof Error) {
    return error.message || fallbackMessage;
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallbackMessage;
}

function isSourceBalanceValidationError(error) {
  const message = normalizeErrorMessage(error, "").toLowerCase();
  return (
    message.includes("insufficient balance") ||
    message.includes("cover the network fee")
  );
}

function buildReviewValidationError(message, reason, details = {}) {
  const nextDetails =
    details && typeof details === "object" && !Array.isArray(details)
      ? { ...details }
      : {};
  const internalReason =
    typeof nextDetails.internalReason === "string" && nextDetails.internalReason.trim()
      ? nextDetails.internalReason.trim()
      : "";

  delete nextDetails.internalReason;

  if (internalReason) {
    logger.warn("Swap review validation rejected", {
      reason: String(reason || "").trim() || null,
      message,
      swapId: nextDetails.swapId ? String(nextDetails.swapId) : null,
      internalReason,
    });
  }

  return AppError.validation(message, {
    validationCode: reason,
    ...nextDetails,
  });
}

function buildTemporarilyUnavailableValidationError(reason, details = {}) {
  return buildReviewValidationError(
    SWAP_USER_MESSAGES.TEMPORARILY_UNAVAILABLE,
    reason,
    details,
  );
}

function buildPriceUnavailableValidationError(details = {}) {
  return buildReviewValidationError(
    SWAP_USER_MESSAGES.PRICE_UNAVAILABLE,
    SWAP_VALIDATION_CODES.PRICE_UNAVAILABLE,
    details,
  );
}

function buildFeeEstimationFailedValidationError(details = {}) {
  return buildReviewValidationError(
    SWAP_USER_MESSAGES.FEE_ESTIMATION_FAILED,
    SWAP_VALIDATION_CODES.FEE_ESTIMATION_FAILED,
    details,
  );
}

function buildLiquidityInsufficientValidationError(details = {}) {
  return buildReviewValidationError(
    SWAP_USER_MESSAGES.LIQUIDITY_INSUFFICIENT,
    SWAP_VALIDATION_CODES.LIQUIDITY_INSUFFICIENT,
    details,
  );
}

function buildAmountTooSmallValidationError(reason, details = {}) {
  return buildReviewValidationError(
    SWAP_USER_MESSAGES.AMOUNT_TOO_SMALL,
    reason,
    details,
  );
}

function isAmountTooSmallValidationError(error) {
  return (
    error instanceof AppError &&
    error.errors &&
    typeof error.errors === "object" &&
    error.errors.validationCode === SWAP_VALIDATION_CODES.AMOUNT_TOO_SMALL
  );
}

function isTypedSwapValidationError(error, validationCode = "") {
  return (
    error instanceof AppError &&
    error.errors &&
    typeof error.errors === "object" &&
    String(error.errors.validationCode || "").trim() === String(validationCode || "").trim()
  );
}

function shouldPropagateSwapValidationError(error) {
  return (
    isAmountTooSmallValidationError(error) ||
    isTypedSwapValidationError(error, SWAP_VALIDATION_CODES.PRICE_UNAVAILABLE) ||
    isTypedSwapValidationError(error, SWAP_VALIDATION_CODES.FEE_ESTIMATION_FAILED) ||
    isTypedSwapValidationError(error, SWAP_VALIDATION_CODES.LIQUIDITY_INSUFFICIENT)
  );
}

function buildSafeSwapFailureReason(status = "", failureCode = "") {
  const normalizedStatus = normalizeComparableString(status);
  const normalizedFailureCode = normalizeComparableString(failureCode);

  if (normalizedStatus === "expired") {
    return SWAP_USER_MESSAGES.QUOTE_EXPIRED;
  }

  if (normalizedStatus === "manual_review") {
    return "This swap is under manual review before it can be completed.";
  }

  if (normalizedStatus === "payout_failed") {
    return "This swap could not be completed. Our team will review it for refund or retry.";
  }

  if (
    normalizedFailureCode ===
      normalizeComparableString(SWAP_FAILURE_CODES.DESTINATION_LIQUIDITY_INSUFFICIENT) ||
    normalizedFailureCode ===
      normalizeComparableString(SWAP_FAILURE_CODES.DESTINATION_CONFIG_INVALID) ||
    normalizedFailureCode ===
      normalizeComparableString(SWAP_FAILURE_CODES.PAYOUT_PREPARATION_FAILED) ||
    normalizedFailureCode ===
      normalizeComparableString(SWAP_FAILURE_CODES.PAYOUT_SUBMISSION_FAILED) ||
    normalizedFailureCode ===
      normalizeComparableString(SWAP_FAILURE_CODES.PAYOUT_SUBMISSION_UNCERTAIN) ||
    normalizedFailureCode ===
      normalizeComparableString(SWAP_FAILURE_CODES.PAYOUT_CHAIN_REJECTED) ||
    normalizedFailureCode ===
      normalizeComparableString(SWAP_FAILURE_CODES.PAYOUT_TRANSACTION_MISSING)
  ) {
    return SWAP_USER_MESSAGES.SWAP_FAILED;
  }

  return null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getElapsedMsSince(value) {
  const normalized = normalizeDate(value);
  if (!normalized) {
    return null;
  }

  return Date.now() - normalized.getTime();
}

function formatScaledDecimal(value, scale) {
  const normalized = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw AppError.validation("Invalid scaled decimal value");
  }

  const negative = normalized.startsWith("-");
  const digits = negative ? normalized.slice(1) : normalized;
  const safeScale = Math.max(Number(scale) || 0, 0);

  if (safeScale === 0) {
    return `${negative ? "-" : ""}${digits}`;
  }

  const padded = digits.padStart(safeScale + 1, "0");
  const wholePart = padded.slice(0, -safeScale) || "0";
  const fractionPart = padded.slice(-safeScale).replace(/0+$/, "");
  const formatted = fractionPart ? `${wholePart}.${fractionPart}` : wholePart;

  return `${negative ? "-" : ""}${formatted}`;
}

function parseDecimalToScaledInt(value, scale) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw AppError.validation("Invalid decimal amount");
  }

  const safeScale = Math.max(Number(scale) || 0, 0);
  const [wholePart, fractionPart = ""] = normalized.split(".");
  if (fractionPart.length > safeScale) {
    throw AppError.validation(
      `Decimal amount exceeds supported precision of ${safeScale} places`,
    );
  }

  return BigInt(
    `${wholePart}${fractionPart.padEnd(safeScale, "0")}`.replace(/^0+(?=\d)/, "") || "0",
  );
}

function divideBigInt(numerator, denominator, { rounding = "floor" } = {}) {
  const left = BigInt(numerator);
  const right = BigInt(denominator);
  if (right === 0n) {
    throw AppError.validation("Division by zero");
  }

  const quotient = left / right;
  const remainder = left % right;

  if (remainder === 0n || rounding === "floor") {
    return quotient;
  }

  if (rounding === "ceil") {
    return quotient + 1n;
  }

  throw AppError.validation(`Unsupported rounding mode "${rounding}"`);
}

function isFinalSwapStatus(status = "") {
  return FINAL_SWAP_STATUS_SET.has(String(status || "").trim().toLowerCase());
}

function getMaximumBaseUnits(...values) {
  return values
    .map((value) => {
      const normalized = String(value ?? "0").trim();
      return /^\d+$/.test(normalized) ? BigInt(normalized) : 0n;
    })
    .reduce((maxValue, currentValue) =>
      currentValue > maxValue ? currentValue : maxValue, 0n)
    .toString();
}

function normalizeMarketPrice(marketEntry = {}, assetSymbol = "") {
  const numericValue = Number(marketEntry?.priceUsd);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw buildPriceUnavailableValidationError({
      asset: String(assetSymbol || "").trim().toUpperCase() || null,
      provider: marketEntry?.provider || null,
      providerId: marketEntry?.providerId || null,
      internalReason:
        marketEntry?.error ||
        `No live, cached, or fallback market price is available for ${String(assetSymbol || "this asset").trim().toUpperCase()}`,
    });
  }

  return numericValue
    .toFixed(PRICE_SCALE)
    .replace(/\.?0+$/, "");
}

function normalizeEstimatedNetworkFeeBaseUnits(value, details = {}) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw buildFeeEstimationFailedValidationError({
      ...details,
      internalReason: "Destination fee estimator returned an invalid base-unit fee value",
    });
  }

  return normalized;
}

function buildMinimumSwapQuoteDiagnostics({
  routeProtection,
  protectedQuote,
  payoutFeeBaseUnits,
  destinationAssetDescriptor,
}) {
  return {
    serviceFeeBps: routeProtection.serviceFeeBps,
    spreadBps: routeProtection.spreadBps,
    totalFeeBps: routeProtection.totalFeeBps,
    payoutFeeBufferBps: routeProtection.payoutFeeBufferBps,
    minimumProfitUsd: routeProtection.minimumProfitUsd,
    payoutFeeBufferAmountAtMinimum: fromAssetBaseUnits(
      destinationAssetDescriptor,
      protectedQuote.payoutFeeBufferAmountBaseUnits,
    ),
    payoutFeeBufferAmountAtMinimumBaseUnits:
      protectedQuote.payoutFeeBufferAmountBaseUnits,
    bufferedPayoutNetworkFeeEstimate: fromAssetBaseUnits(
      destinationAssetDescriptor,
      protectedQuote.bufferedPayoutNetworkFeeBaseUnits,
    ),
    bufferedPayoutNetworkFeeEstimateBaseUnits:
      protectedQuote.bufferedPayoutNetworkFeeBaseUnits,
    minimumProfitAmountAtMinimum: fromAssetBaseUnits(
      destinationAssetDescriptor,
      protectedQuote.minimumProfitBaseUnits,
    ),
    minimumProfitAmountAtMinimumBaseUnits:
      protectedQuote.minimumProfitBaseUnits,
    actualPayoutNetworkFeeEstimate: fromAssetBaseUnits(
      destinationAssetDescriptor,
      payoutFeeBaseUnits,
    ),
    actualPayoutNetworkFeeEstimateBaseUnits: payoutFeeBaseUnits,
  };
}

function buildPricingMetadataEntry(assetDescriptor, marketEntry = {}) {
  return {
    asset: assetDescriptor.asset,
    symbol: assetDescriptor.symbol,
    provider: marketEntry?.provider || null,
    providerId: marketEntry?.providerId || null,
    sourceType: marketEntry?.sourceType || null,
    fallbackPriceUsed: Boolean(marketEntry?.fallbackPriceUsed),
    stale: Boolean(marketEntry?.stale),
    updatedAt: marketEntry?.updatedAt || null,
    error: marketEntry?.error || null,
    metadata:
      marketEntry?.metadata &&
      typeof marketEntry.metadata === "object" &&
      !Array.isArray(marketEntry.metadata)
        ? marketEntry.metadata
        : {},
  };
}

function extractErrorMessage(error, fallback = "Swap operation failed") {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error || fallback);
}

function getTransferExecutionStatus(result = {}, options = {}) {
  const normalizedChain = normalizeComparableString(
    options.chain || result.chain || "",
  );
  const normalizedChainStatus = String(result.chainStatus || "")
    .trim()
    .toLowerCase();

  if (normalizedChain === "xrp") {
    if (normalizedChainStatus === "tessuccess") {
      return "success";
    }

    if (/^(tec|tef|ter|tel|tem)/.test(normalizedChainStatus) || result.validated) {
      return "failed";
    }

    return "pending";
  }

  if (
    normalizedChainStatus === "tessuccess" ||
    normalizedChainStatus.startsWith("success")
  ) {
    return "success";
  }

  if (
    /^(tec|tef|ter|tel|tem)/.test(normalizedChainStatus) ||
    normalizedChainStatus === "failed"
  ) {
    return "failed";
  }

  if (result.succeeded) {
    return "success";
  }

  return result.validated ? "failed" : "pending";
}

function isAcceptedPendingSubmission(result = {}, options = {}) {
  const normalizedChain = normalizeComparableString(
    options.chain || result.chain || "",
  );
  const normalizedChainStatus = String(result.chainStatus || "")
    .trim()
    .toLowerCase();

  if (normalizedChain === "xrp") {
    if (/^(tec|tef|ter|tel|tem|tessuccess)/.test(normalizedChainStatus)) {
      return false;
    }

    if (result.succeeded || result.validated) {
      return false;
    }

    return normalizedChainStatus === "submitted" || normalizedChainStatus === "pending";
  }

  if (/^(tec|tef|ter|tel|tem)/.test(normalizedChainStatus)) {
    return false;
  }

  if (result.succeeded || result.validated) {
    return false;
  }

  return normalizedChainStatus === "submitted" || normalizedChainStatus === "pending";
}

function mergeMetadata(base = {}, patch = {}) {
  const left = base && typeof base === "object" && !Array.isArray(base) ? base : {};
  const right = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  const merged = { ...left };

  for (const [key, value] of Object.entries(right)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      left[key] &&
      typeof left[key] === "object" &&
      !Array.isArray(left[key])
    ) {
      merged[key] = mergeMetadata(left[key], value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function buildFailureMetadata(existingMetadata = {}, reason, code = null, context = null) {
  return mergeMetadata(existingMetadata, {
    failure: {
      reason: reason || null,
      code: code || null,
      context: context && typeof context === "object" ? context : null,
      updatedAt: new Date(),
    },
  });
}

function clearFailureMetadata(existingMetadata = {}) {
  return mergeMetadata(existingMetadata, {
    failure: {
      reason: null,
      code: null,
      context: null,
      updatedAt: new Date(),
    },
  });
}

function buildSwapLogContext(swap, extra = {}) {
  return {
    swapId: String(swap?._id || ""),
    userId: String(swap?.userId || extra.userId || ""),
    accountId: swap?.accountId ? String(swap.accountId) : null,
    status: swap?.status || null,
    fromChain: swap?.fromChain || null,
    fromNetwork: swap?.fromNetwork || null,
    toChain: swap?.toChain || null,
    toNetwork: swap?.toNetwork || null,
    sourceTransactionId: swap?.sourceTransactionId
      ? String(swap.sourceTransactionId)
      : null,
    sourceTxHash: swap?.sourceTxHash || null,
    payoutTransactionId: swap?.payoutTransactionId || null,
    payoutTxHash: swap?.payoutTxHash || null,
    ...extra,
  };
}

function logSwapEvent(level, message, swap, extra = {}) {
  logger[level](message, buildSwapLogContext(swap, extra));
}

function buildSwapFeeContext(context, assetDescriptor) {
  return {
    ...context,
    assetDescriptor,
    chainConfig: {
      ...(context.chainConfig || {}),
      feePolicy: {
        ...((context.chainConfig && context.chainConfig.feePolicy) || {}),
        external: {
          ...((context.chainConfig &&
            context.chainConfig.feePolicy &&
            context.chainConfig.feePolicy.external) ||
            {}),
          chargeNetworkFee: true,
          platformFee: {
            enabled: false,
            type: "none",
            value: "0",
          },
        },
      },
    },
  };
}

function buildEndpointDescriptorFromTreasuryConfig(config = {}, context = null) {
  const chain = String(config.chain || "").trim().toLowerCase();
  const network = String(config.network || "").trim().toLowerCase();
  let nativeAsset = null;

  try {
    nativeAsset = buildNativeAssetDescriptor(chain, network);
  } catch (_error) {
    nativeAsset = {
      asset: String(config.asset || "").trim().toUpperCase(),
      symbol: String(config.asset || "").trim().toUpperCase(),
      code: String(config.asset || "").trim().toLowerCase(),
      label: String(config.asset || "").trim().toUpperCase(),
      decimals: 0,
      assetType: "native",
      standard: "native",
      baseUnitName: "",
    };
  }

  return {
    id: `${chain}:${network}:${nativeAsset.asset}`,
    chain,
    chainLabel: getChainLabel(chain),
    network,
    networkLabel: getNetworkLabel(chain, network),
    asset: nativeAsset.asset,
    symbol: nativeAsset.symbol,
    code: nativeAsset.code,
    label: nativeAsset.label,
    decimals: nativeAsset.decimals,
    assetType: nativeAsset.assetType,
    standard: nativeAsset.standard,
    baseUnitName: nativeAsset.baseUnitName,
    features: context?.features || {},
    toggles: context?.toggles || {},
  };
}

function buildPairId(fromEndpoint, toEndpoint) {
  return `${fromEndpoint.chain}:${fromEndpoint.network}:${fromEndpoint.asset}->${toEndpoint.chain}:${toEndpoint.network}:${toEndpoint.asset}`;
}

function buildSupportedPairRecord(fromEndpoint, toEndpoint) {
  return {
    pairId: buildPairId(fromEndpoint, toEndpoint),
    from: fromEndpoint,
    to: toEndpoint,
  };
}

async function readLiveSwapSystemBalance({
  chain,
  network,
  address,
}) {
  const context = assertSupportedChainNetwork(chain, network);
  const assetDescriptor = buildNativeAssetDescriptor(chain, network);
  const balance = await context.adapter.balance.fetchBalance({
    network,
    address,
  });
  const availableBaseUnits = String(
    balance?.availableBaseUnits || balance?.baseUnitBalance || "0",
  );

  return {
    chain,
    network,
    address,
    availableBalance: fromAssetBaseUnits(assetDescriptor, availableBaseUnits),
    metadata: {
      availableBaseUnits,
      minimumReserveBaseUnits: String(
        balance?.rentExemptMinimumBaseUnits ||
          balance?.minimumReserveBaseUnits ||
          "0",
      ),
      raw: balance && typeof balance === "object" ? balance : {},
    },
  };
}

function buildTreasuryLiquiditySnapshot(
  assetDescriptor,
  systemWalletConfig,
  liveBalance = {},
) {
  const availableBaseUnits = String(
    liveBalance?.metadata?.availableBaseUnits ||
      toAssetBaseUnits(assetDescriptor, liveBalance?.availableBalance || "0"),
  );
  const configuredReserveBaseUnits = toAssetBaseUnits(
    assetDescriptor,
    systemWalletConfig?.reserve || "0",
  );
  const liveMinimumReserveBaseUnits = String(
    liveBalance?.metadata?.minimumReserveBaseUnits || "0",
  );
  const reserveBaseUnits = getMaximumBaseUnits(
    configuredReserveBaseUnits,
    liveMinimumReserveBaseUnits,
  );
  const availableAfterReserveBaseUnits = (
    BigInt(availableBaseUnits) - BigInt(reserveBaseUnits)
  ) > 0n
    ? (BigInt(availableBaseUnits) - BigInt(reserveBaseUnits)).toString()
    : "0";

  return {
    availableBalance: fromAssetBaseUnits(assetDescriptor, availableBaseUnits),
    availableBalanceBaseUnits: availableBaseUnits,
    reserve: fromAssetBaseUnits(assetDescriptor, reserveBaseUnits),
    reserveBaseUnits,
    configuredReserve: systemWalletConfig?.reserve || "0",
    configuredReserveBaseUnits,
    minimumReserve: fromAssetBaseUnits(assetDescriptor, liveMinimumReserveBaseUnits),
    minimumReserveBaseUnits: liveMinimumReserveBaseUnits,
    availableAfterReserve: fromAssetBaseUnits(
      assetDescriptor,
      availableAfterReserveBaseUnits,
    ),
    availableAfterReserveBaseUnits,
  };
}

function buildEndpointDescriptorFromWallet(wallet = {}) {
  return buildEndpointDescriptorFromTreasuryConfig({
    chain: wallet.chain,
    network: wallet.network,
    asset: wallet.asset,
    reserve: "0",
  });
}

function buildWalletEndpointDiagnostics(wallet = {}) {
  let context = null;
  const sourceReasons = [];
  const destinationReasons = [];

  try {
    context = assertSupportedChainNetwork(wallet.chain, wallet.network);
  } catch (error) {
    sourceReasons.push("chain_network_unavailable");
    destinationReasons.push("chain_network_unavailable");
  }

  const endpoint = buildEndpointDescriptorFromWallet(wallet);
  endpoint.features = context?.features || {};
  endpoint.toggles = context?.toggles || {};

  if (endpoint?.toggles?.maintenance === true) {
    sourceReasons.push("network_in_maintenance");
    destinationReasons.push("network_in_maintenance");
  }

  if (endpoint?.features?.send !== true) {
    sourceReasons.push("send_not_supported");
    destinationReasons.push("send_not_supported");
  }

  if (endpoint?.features?.receive !== true) {
    destinationReasons.push("receive_not_supported");
  }

  const uniqueSourceReasons = Array.from(new Set(sourceReasons));
  const uniqueDestinationReasons = Array.from(new Set(destinationReasons));

  return {
    ...endpoint,
    swapEligible:
      uniqueSourceReasons.length === 0 && uniqueDestinationReasons.length === 0,
    sourceReady: uniqueSourceReasons.length === 0,
    destinationReady: uniqueDestinationReasons.length === 0,
    reasons: Array.from(new Set([...uniqueSourceReasons, ...uniqueDestinationReasons])),
    sourceReasons: uniqueSourceReasons,
    destinationReasons: uniqueDestinationReasons,
    walletCount: 1,
    walletIds: [String(wallet._id || wallet.id || "")],
  };
}

async function listUserNativeSwapWallets(userId) {
  if (!userId) {
    return [];
  }

  const wallets = await Wallet.find({
    userId,
    ...buildWalletVisibilityFilter({ includeHidden: false }),
  })
    .select("_id chain network asset")
    .lean();

  return wallets.filter((wallet) => {
    try {
      const assetDescriptor = buildNativeAssetDescriptor(
        wallet.chain,
        wallet.network,
      );

      return (
        String(wallet.asset || "").trim().toUpperCase() ===
        assetDescriptor.asset
      );
    } catch (_error) {
      return false;
    }
  });
}

function buildSupportedPairsDiagnostics(endpointDiagnostics = [], pairs = []) {
  const emptyReasons = [];

  if (!endpointDiagnostics.length) {
    emptyReasons.push("This account does not have any native wallets available for swap");
  }

  if (!endpointDiagnostics.some((endpoint) => endpoint.sourceReady === true)) {
    emptyReasons.push(
      "No user wallets currently support source transfers for swap",
    );
  }

  if (
    !endpointDiagnostics.some((endpoint) => endpoint.destinationReady === true)
  ) {
    emptyReasons.push(
      "No user wallets currently support destination payouts for swap",
    );
  }

  return {
    pairCount: pairs.length,
    configWarnings: [],
    configuredSystemWallets: [],
    endpointChecks: endpointDiagnostics,
    emptyReasons,
  };
}

function mergeEndpointDiagnostics(endpointDiagnostics = []) {
  const byEndpoint = new Map();

  for (const endpoint of endpointDiagnostics) {
    if (!endpoint?.id) {
      continue;
    }

    const existing = byEndpoint.get(endpoint.id);
    if (!existing) {
      byEndpoint.set(endpoint.id, {
        ...endpoint,
        reasons: Array.from(new Set(endpoint.reasons || [])),
        sourceReasons: Array.from(new Set(endpoint.sourceReasons || [])),
        destinationReasons: Array.from(new Set(endpoint.destinationReasons || [])),
        walletIds: Array.from(new Set(endpoint.walletIds || [])),
        walletCount: Math.max(1, Number(endpoint.walletCount || 1)),
      });
      continue;
    }

    const walletIds = Array.from(
      new Set([...(existing.walletIds || []), ...(endpoint.walletIds || [])]),
    );
    const sourceReasons = Array.from(
      new Set([...(existing.sourceReasons || []), ...(endpoint.sourceReasons || [])]),
    );
    const destinationReasons = Array.from(
      new Set([
        ...(existing.destinationReasons || []),
        ...(endpoint.destinationReasons || []),
      ]),
    );

    byEndpoint.set(endpoint.id, {
      ...existing,
      sourceReady: existing.sourceReady === true || endpoint.sourceReady === true,
      destinationReady:
        existing.destinationReady === true || endpoint.destinationReady === true,
      swapEligible:
        (existing.sourceReady === true || endpoint.sourceReady === true) &&
        (existing.destinationReady === true || endpoint.destinationReady === true),
      sourceReasons,
      destinationReasons,
      reasons: Array.from(new Set([...sourceReasons, ...destinationReasons])),
      walletIds,
      walletCount: walletIds.length || existing.walletCount || 1,
    });
  }

  return Array.from(byEndpoint.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function buildSupportedPairsFromDiagnostics(endpointDiagnostics = []) {
  const sourceEndpoints = endpointDiagnostics.filter(
    (endpoint) => endpoint.sourceReady === true,
  );
  const destinationEndpoints = endpointDiagnostics.filter(
    (endpoint) => endpoint.destinationReady === true,
  );
  const pairsById = new Map();

  for (const fromEndpoint of sourceEndpoints) {
    for (const toEndpoint of destinationEndpoints) {
      if (
        !fromEndpoint?.id ||
        !toEndpoint?.id ||
        toEndpoint.id === fromEndpoint.id ||
        toEndpoint.asset === fromEndpoint.asset
      ) {
        continue;
      }

      const pair = buildSupportedPairRecord(fromEndpoint, toEndpoint);
      if (!pairsById.has(pair.pairId)) {
        pairsById.set(pair.pairId, pair);
      }
    }
  }

  return Array.from(pairsById.values()).sort((left, right) =>
    left.pairId.localeCompare(right.pairId),
  );
}

async function getSupportedPairs(_options = {}) {
  if (!swapConfig.enabled) {
    return {
      enabled: false,
      pairs: [],
      diagnostics: {
        pairCount: 0,
        configWarnings: ["Swap is disabled by configuration"],
        configuredSystemWallets: [],
        endpointChecks: [],
        emptyReasons: ["Swap is disabled by configuration"],
      },
    };
  }

  const endpointDiagnostics = mergeEndpointDiagnostics(
    (await listUserNativeSwapWallets(_options.userId)).map((wallet) =>
      buildWalletEndpointDiagnostics(wallet),
    ),
  );
  const pairs = buildSupportedPairsFromDiagnostics(endpointDiagnostics);

  return {
    enabled: true,
    pairs,
    diagnostics: buildSupportedPairsDiagnostics(endpointDiagnostics, pairs),
  };
}

function buildPositiveNativeAmount(assetDescriptor, value) {
  const amount = normalizeAssetAmount(assetDescriptor, value);
  const amountBaseUnits = toAssetBaseUnits(assetDescriptor, amount);

  if (!isBaseUnitsGte(amountBaseUnits, "1")) {
    throw AppError.validation("Swap amount must be greater than zero");
  }

  return {
    amount,
    amountBaseUnits,
  };
}

function buildSourceUsdBaseUnits(sourceAmountBaseUnits, sourceDecimals, sourcePriceScaled) {
  return divideBigInt(
    BigInt(String(sourceAmountBaseUnits)) *
      BigInt(String(sourcePriceScaled)) *
      getPowerOfTen(USD_SCALE),
    getPowerOfTen(sourceDecimals + PRICE_SCALE),
    { rounding: "floor" },
  );
}

function buildGrossDestinationBaseUnits({
  sourceAmountBaseUnits,
  sourcePriceScaled,
  sourceDecimals,
  destinationPriceScaled,
  destinationDecimals,
}) {
  return divideBigInt(
    BigInt(String(sourceAmountBaseUnits)) *
      BigInt(String(sourcePriceScaled)) *
      getPowerOfTen(destinationDecimals),
    getPowerOfTen(sourceDecimals) * BigInt(String(destinationPriceScaled)),
    { rounding: "floor" },
  );
}

function buildSystemFeeBaseUnits(destinationAmountBaseUnits, serviceFeeBps) {
  return divideBigInt(
    BigInt(String(destinationAmountBaseUnits)) * BigInt(serviceFeeBps),
    BASIS_POINTS_DIVISOR,
    { rounding: "ceil" },
  );
}

function buildBufferedFeeBaseUnits(feeBaseUnits, bufferBps = 0) {
  const normalizedFeeBaseUnits = String(feeBaseUnits || "0");
  const normalizedBufferBps = Math.max(Number(bufferBps) || 0, 0);

  if (normalizedBufferBps <= 0) {
    return {
      bufferedFeeBaseUnits: normalizedFeeBaseUnits,
      bufferAmountBaseUnits: "0",
    };
  }

  const bufferAmountBaseUnits = divideBigInt(
    BigInt(normalizedFeeBaseUnits) * BigInt(normalizedBufferBps),
    BASIS_POINTS_DIVISOR,
    { rounding: "ceil" },
  ).toString();

  return {
    bufferedFeeBaseUnits: addBaseUnits(
      normalizedFeeBaseUnits,
      bufferAmountBaseUnits,
    ),
    bufferAmountBaseUnits,
  };
}

function buildMinimumProfitBaseUnits({
  minimumProfitUsd = "0",
  destinationPriceScaled,
  destinationDecimals,
}) {
  const normalizedMinimumProfitUsd = String(minimumProfitUsd || "0").trim();
  if (!normalizedMinimumProfitUsd || normalizedMinimumProfitUsd === "0") {
    return "0";
  }

  const minimumProfitScaled = parseDecimalToScaledInt(
    normalizedMinimumProfitUsd,
    USD_SCALE,
  );
  if (minimumProfitScaled <= 0n) {
    return "0";
  }

  return divideBigInt(
    minimumProfitScaled * getPowerOfTen(destinationDecimals + PRICE_SCALE),
    BigInt(String(destinationPriceScaled)) * getPowerOfTen(USD_SCALE),
    { rounding: "ceil" },
  ).toString();
}

function buildSourceAmountForUsdEquivalentBaseUnits({
  minimumUsdEquivalent = "0",
  sourcePriceScaled,
  sourceDecimals,
}) {
  const normalizedMinimumUsdEquivalent = String(minimumUsdEquivalent || "0").trim();
  if (!normalizedMinimumUsdEquivalent || normalizedMinimumUsdEquivalent === "0") {
    return "0";
  }

  const minimumUsdScaled = parseDecimalToScaledInt(
    normalizedMinimumUsdEquivalent,
    USD_SCALE,
  );
  if (minimumUsdScaled <= 0n) {
    return "0";
  }

  return divideBigInt(
    minimumUsdScaled * getPowerOfTen(sourceDecimals + PRICE_SCALE),
    BigInt(String(sourcePriceScaled)) * getPowerOfTen(USD_SCALE),
    { rounding: "ceil" },
  ).toString();
}

function buildSourceAmountForDestinationBaseUnitMinimum({
  sourcePriceScaled,
  sourceDecimals,
  destinationPriceScaled,
  destinationDecimals,
}) {
  return divideBigInt(
    BigInt(String(destinationPriceScaled)) * getPowerOfTen(sourceDecimals),
    BigInt(String(sourcePriceScaled)) * getPowerOfTen(destinationDecimals),
    { rounding: "ceil" },
  ).toString();
}

function getLargerBaseUnitCandidate(left, right) {
  const normalizedLeft = /^\d+$/.test(String(left ?? "").trim()) ? BigInt(String(left).trim()) : 0n;
  const normalizedRight = /^\d+$/.test(String(right ?? "").trim()) ? BigInt(String(right).trim()) : 0n;

  return normalizedLeft >= normalizedRight
    ? normalizedLeft.toString()
    : normalizedRight.toString();
}

function normalizeBaseUnitCandidate(value, fallback = "0") {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    return fallback;
  }

  return normalized.replace(/^0+(?=\d)/, "") || "0";
}

function buildAmountTooSmallConstraintDetails({
  constraintCode,
  swapId = null,
  minimumSwapQuote = null,
} = {}) {
  const details = {
    code: constraintCode || "swap_amount_too_small",
    reason: "The entered amount is below the minimum swappable amount for this route",
  };

  if (swapId) {
    details.swapId = String(swapId);
  }

  if (minimumSwapQuote && typeof minimumSwapQuote === "object") {
    Object.assign(details, minimumSwapQuote);
  }

  return details;
}

function selectDominantMinimumCandidate(candidates = []) {
  return candidates.reduce(
    (selected, candidate) => {
      const normalizedBaseUnits = normalizeBaseUnitCandidate(candidate?.baseUnits, "0");
      const normalizedWeight = BigInt(normalizedBaseUnits);

      if (!selected) {
        return {
          ...candidate,
          baseUnits: normalizedBaseUnits,
          weight: normalizedWeight,
        };
      }

      if (normalizedWeight > selected.weight) {
        return {
          ...candidate,
          baseUnits: normalizedBaseUnits,
          weight: normalizedWeight,
        };
      }

      return selected;
    },
    null,
  );
}

function assertMinimumSourceAmountOrThrow({
  assetDescriptor,
  amountBaseUnits,
  minimumSourceAmount = "0",
  swapId = null,
  minimumSwapQuote = null,
}) {
  const minimumSourceAmountBaseUnits = toAssetBaseUnits(
    assetDescriptor,
    minimumSourceAmount || "0",
  );

  if (
    isBaseUnitsGte(minimumSourceAmountBaseUnits, "1") &&
    !isBaseUnitsGte(String(amountBaseUnits || "0"), minimumSourceAmountBaseUnits)
  ) {
    throw buildAmountTooSmallValidationError(
      "swap_amount_too_small",
      buildAmountTooSmallConstraintDetails({
        constraintCode: "route_min_source_amount",
        swapId,
        minimumSwapQuote,
      }),
    );
  }

  return {
    minimumSourceAmount: fromAssetBaseUnits(
      assetDescriptor,
      minimumSourceAmountBaseUnits,
    ),
    minimumSourceAmountBaseUnits,
  };
}

function buildProfitProtectedQuote({
  routeProtection,
  sourceAmountBaseUnits,
  sourcePriceScaled,
  sourceDecimals,
  destinationPriceScaled,
  destinationDecimals,
  payoutNetworkFeeBaseUnits,
  swapId = null,
}) {
  const grossDestinationBaseUnits = buildGrossDestinationBaseUnits({
    sourceAmountBaseUnits,
    sourcePriceScaled,
    sourceDecimals,
    destinationPriceScaled,
    destinationDecimals,
  }).toString();

  return buildProfitProtectedQuoteFromGross({
    routeProtection,
    grossDestinationBaseUnits,
    destinationPriceScaled,
    destinationDecimals,
    payoutNetworkFeeBaseUnits,
    swapId,
  });
}

function buildProfitProtectedQuoteFromGross({
  routeProtection,
  grossDestinationBaseUnits,
  destinationPriceScaled,
  destinationDecimals,
  payoutNetworkFeeBaseUnits,
  swapId = null,
}) {
  const normalizedGrossDestinationBaseUnits = String(
    grossDestinationBaseUnits || "0",
  );

  if (!isBaseUnitsGte(normalizedGrossDestinationBaseUnits, "1")) {
    throw buildAmountTooSmallValidationError(
      "swap_amount_too_small",
      buildAmountTooSmallConstraintDetails({
        constraintCode: "destination_base_unit_minimum",
        swapId,
      }),
    );
  }

  const serviceFeeAmountBaseUnits = buildSystemFeeBaseUnits(
    normalizedGrossDestinationBaseUnits,
    routeProtection.serviceFeeBps,
  ).toString();
  const spreadFeeAmountBaseUnits = buildSystemFeeBaseUnits(
    normalizedGrossDestinationBaseUnits,
    routeProtection.spreadBps,
  ).toString();
  const platformFeeAmountBaseUnits = addBaseUnits(
    serviceFeeAmountBaseUnits,
    spreadFeeAmountBaseUnits,
  );
  const destinationAmountBeforePayoutBaseUnits =
    BigInt(normalizedGrossDestinationBaseUnits) - BigInt(platformFeeAmountBaseUnits) > 0n
      ? (
          BigInt(normalizedGrossDestinationBaseUnits) -
          BigInt(platformFeeAmountBaseUnits)
        ).toString()
      : "0";

  if (!isBaseUnitsGte(destinationAmountBeforePayoutBaseUnits, "1")) {
    throw buildAmountTooSmallValidationError(
      "swap_amount_too_small",
      buildAmountTooSmallConstraintDetails({
        constraintCode: "destination_after_platform_fees_below_base_unit_minimum",
        swapId,
      }),
    );
  }

  const normalizedPayoutNetworkFeeBaseUnits = String(
    payoutNetworkFeeBaseUnits || "0",
  );

  if (
    BigInt(normalizedPayoutNetworkFeeBaseUnits) >= BigInt(normalizedGrossDestinationBaseUnits)
  ) {
    throw buildAmountTooSmallValidationError(
      "swap_amount_too_small",
      buildAmountTooSmallConstraintDetails({
        constraintCode: "payout_network_fee_gte_gross_destination",
        swapId,
      }),
    );
  }

  const { bufferedFeeBaseUnits, bufferAmountBaseUnits } = buildBufferedFeeBaseUnits(
    normalizedPayoutNetworkFeeBaseUnits,
    routeProtection.payoutFeeBufferBps,
  );
  const minimumProfitBaseUnits = buildMinimumProfitBaseUnits({
    minimumProfitUsd: routeProtection.minimumProfitUsd,
    destinationPriceScaled,
    destinationDecimals,
  });

  if (
    BigInt(platformFeeAmountBaseUnits) <
    BigInt(bufferedFeeBaseUnits) + BigInt(minimumProfitBaseUnits)
  ) {
    throw buildAmountTooSmallValidationError(
      "swap_amount_too_small",
      buildAmountTooSmallConstraintDetails({
        constraintCode: "minimum_profit_not_covered",
        swapId,
      }),
    );
  }

  const estimatedReceiveAmountBaseUnits =
    BigInt(destinationAmountBeforePayoutBaseUnits) - BigInt(bufferedFeeBaseUnits) > 0n
      ? (
          BigInt(destinationAmountBeforePayoutBaseUnits) -
          BigInt(bufferedFeeBaseUnits)
        ).toString()
      : "0";

  if (!isBaseUnitsGte(estimatedReceiveAmountBaseUnits, "1")) {
    throw buildAmountTooSmallValidationError(
      "swap_amount_too_small",
      buildAmountTooSmallConstraintDetails({
        constraintCode: "estimated_receive_below_base_unit_minimum",
        swapId,
      }),
    );
  }

  return {
    grossDestinationBaseUnits: normalizedGrossDestinationBaseUnits,
    serviceFeeAmountBaseUnits,
    spreadFeeAmountBaseUnits,
    platformFeeAmountBaseUnits,
    destinationAmountBeforePayoutBaseUnits,
    payoutNetworkFeeBaseUnits: normalizedPayoutNetworkFeeBaseUnits,
    payoutFeeBufferAmountBaseUnits: bufferAmountBaseUnits,
    bufferedPayoutNetworkFeeBaseUnits: bufferedFeeBaseUnits,
    minimumProfitBaseUnits,
    estimatedReceiveAmountBaseUnits,
  };
}

function evaluateProfitProtectedSourceAmount({
  routeProtection,
  sourceAmountBaseUnits,
  sourcePriceScaled,
  sourceDecimals,
  destinationPriceScaled,
  destinationDecimals,
  payoutNetworkFeeBaseUnits,
  swapId = null,
}) {
  try {
    return {
      ok: true,
      quote: buildProfitProtectedQuote({
        routeProtection,
        sourceAmountBaseUnits,
        sourcePriceScaled,
        sourceDecimals,
        destinationPriceScaled,
        destinationDecimals,
        payoutNetworkFeeBaseUnits,
        swapId,
      }),
      constraintCode: null,
    };
  } catch (error) {
    if (isAmountTooSmallValidationError(error)) {
      return {
        ok: false,
        quote: null,
        constraintCode:
          String(
            error?.errors?.code ||
              error?.errors?.constraintCode ||
              error?.errors?.reasonCode ||
              "swap_amount_too_small",
          ).trim() || "swap_amount_too_small",
      };
    }

    throw error;
  }
}

function findMinimumSourceAmountForProtectedQuote({
  routeProtection,
  sourcePriceScaled,
  sourceDecimals,
  destinationPriceScaled,
  destinationDecimals,
  payoutNetworkFeeBaseUnits,
  lowerBoundBaseUnits = "1",
  swapId = null,
}) {
  let low = BigInt(normalizeBaseUnitCandidate(lowerBoundBaseUnits, "1"));
  if (low < 1n) {
    low = 1n;
  }

  let high = low;
  let highEvaluation = evaluateProfitProtectedSourceAmount({
    routeProtection,
    sourceAmountBaseUnits: high.toString(),
    sourcePriceScaled,
    sourceDecimals,
    destinationPriceScaled,
    destinationDecimals,
    payoutNetworkFeeBaseUnits,
    swapId,
  });

  let expansionCount = 0;
  while (!highEvaluation.ok) {
    high *= 2n;
    highEvaluation = evaluateProfitProtectedSourceAmount({
      routeProtection,
      sourceAmountBaseUnits: high.toString(),
      sourcePriceScaled,
      sourceDecimals,
      destinationPriceScaled,
      destinationDecimals,
      payoutNetworkFeeBaseUnits,
      swapId,
    });
    expansionCount += 1;

    if (expansionCount > 64) {
      throw AppError.validation("Unable to calculate the minimum swappable amount");
    }
  }

  let left = low;
  let right = high;
  let winningEvaluation = highEvaluation;

  while (left < right) {
    const midpoint = left + ((right - left) / 2n);
    const midpointEvaluation = evaluateProfitProtectedSourceAmount({
      routeProtection,
      sourceAmountBaseUnits: midpoint.toString(),
      sourcePriceScaled,
      sourceDecimals,
      destinationPriceScaled,
      destinationDecimals,
      payoutNetworkFeeBaseUnits,
      swapId,
    });

    if (midpointEvaluation.ok) {
      right = midpoint;
      winningEvaluation = midpointEvaluation;
      continue;
    }

    left = midpoint + 1n;
  }

  const minimumSourceAmountBaseUnits = left.toString();
  const finalEvaluation =
    winningEvaluation.ok && left === right
      ? winningEvaluation
      : evaluateProfitProtectedSourceAmount({
          routeProtection,
          sourceAmountBaseUnits: minimumSourceAmountBaseUnits,
          sourcePriceScaled,
          sourceDecimals,
          destinationPriceScaled,
          destinationDecimals,
          payoutNetworkFeeBaseUnits,
          swapId,
        });

  if (!finalEvaluation.ok || !finalEvaluation.quote) {
    throw AppError.validation("Unable to calculate the minimum swappable amount");
  }

  let constraintCode = "swap_amount_too_small";
  if (left > 1n) {
    const previousEvaluation = evaluateProfitProtectedSourceAmount({
      routeProtection,
      sourceAmountBaseUnits: (left - 1n).toString(),
      sourcePriceScaled,
      sourceDecimals,
      destinationPriceScaled,
      destinationDecimals,
      payoutNetworkFeeBaseUnits,
      swapId,
    });

    if (!previousEvaluation.ok && previousEvaluation.constraintCode) {
      constraintCode = previousEvaluation.constraintCode;
    }
  }

  return {
    minimumSourceAmountBaseUnits,
    protectedQuote: finalEvaluation.quote,
    constraintCode,
  };
}

async function calculateMinimumSwapQuote({
  routeProtection,
  sourceAssetDescriptor,
  destinationAssetDescriptor,
  sourcePriceScaled,
  destinationPriceScaled,
  destinationWallet,
  destinationSystemWallet,
  destinationReceive,
  swapId = null,
  estimatePayoutQuote = estimateDestinationPayoutQuote,
}) {
  const routeMinimumSourceAmountBaseUnits = toAssetBaseUnits(
    sourceAssetDescriptor,
    routeProtection.minSourceAmount || "0",
  );
  const minUsdSourceAmountBaseUnits = buildSourceAmountForUsdEquivalentBaseUnits({
    minimumUsdEquivalent: swapConfig.minUsdEquivalent,
    sourcePriceScaled,
    sourceDecimals: sourceAssetDescriptor.decimals,
  });
  const destinationBaseUnitMinimumSourceAmountBaseUnits =
    buildSourceAmountForDestinationBaseUnitMinimum({
      sourcePriceScaled,
      sourceDecimals: sourceAssetDescriptor.decimals,
      destinationPriceScaled,
      destinationDecimals: destinationAssetDescriptor.decimals,
    });
  const lowerBoundBaseUnits = selectDominantMinimumCandidate([
    {
      baseUnits: "1",
      constraintCode: "source_base_unit_minimum",
    },
    {
      baseUnits: routeMinimumSourceAmountBaseUnits,
      constraintCode: "route_min_source_amount",
    },
    {
      baseUnits: minUsdSourceAmountBaseUnits,
      constraintCode: "min_usd_equivalent",
    },
    {
      baseUnits: destinationBaseUnitMinimumSourceAmountBaseUnits,
      constraintCode: "destination_base_unit_minimum",
    },
  ]);

  const zeroFeeMinimum = findMinimumSourceAmountForProtectedQuote({
    routeProtection,
    sourcePriceScaled,
    sourceDecimals: sourceAssetDescriptor.decimals,
    destinationPriceScaled,
    destinationDecimals: destinationAssetDescriptor.decimals,
    payoutNetworkFeeBaseUnits: "0",
    lowerBoundBaseUnits: lowerBoundBaseUnits?.baseUnits || "1",
    swapId,
  });

  let minimumQuote = zeroFeeMinimum;
  let payoutFeeBaseUnits = "0";
  let payoutQuote = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    payoutQuote = await estimatePayoutQuote({
      destinationWallet,
      destinationAssetDescriptor,
      destinationSystemWallet,
      amount: fromAssetBaseUnits(
        destinationAssetDescriptor,
        minimumQuote.protectedQuote.destinationAmountBeforePayoutBaseUnits,
      ),
      destinationAddress: destinationReceive.address,
      executionParams: destinationReceive.executionParams,
    });

    const nextPayoutFeeBaseUnits = normalizeEstimatedNetworkFeeBaseUnits(
      payoutQuote?.networkFeeBaseUnits,
      {
        asset: destinationAssetDescriptor.symbol,
      },
    );
    const nextMinimumQuote = findMinimumSourceAmountForProtectedQuote({
      routeProtection,
      sourcePriceScaled,
      sourceDecimals: sourceAssetDescriptor.decimals,
      destinationPriceScaled,
      destinationDecimals: destinationAssetDescriptor.decimals,
      payoutNetworkFeeBaseUnits: nextPayoutFeeBaseUnits,
      lowerBoundBaseUnits: getLargerBaseUnitCandidate(
        lowerBoundBaseUnits?.baseUnits || "1",
        zeroFeeMinimum.minimumSourceAmountBaseUnits,
      ),
      swapId,
    });

    const stabilized =
      nextPayoutFeeBaseUnits === payoutFeeBaseUnits &&
      nextMinimumQuote.minimumSourceAmountBaseUnits ===
        minimumQuote.minimumSourceAmountBaseUnits;

    payoutFeeBaseUnits = nextPayoutFeeBaseUnits;
    minimumQuote = nextMinimumQuote;

    if (stabilized) {
      break;
    }
  }

  const dominantConstraint = selectDominantMinimumCandidate([
    lowerBoundBaseUnits,
    {
      baseUnits: minimumQuote.minimumSourceAmountBaseUnits,
      constraintCode: minimumQuote.constraintCode,
    },
  ]);
  const sourceUsdAtMinimumBaseUnits = buildSourceUsdBaseUnits(
    minimumQuote.minimumSourceAmountBaseUnits,
    sourceAssetDescriptor.decimals,
    sourcePriceScaled,
  );

  return {
    minimumSourceAmount: fromAssetBaseUnits(
      sourceAssetDescriptor,
      minimumQuote.minimumSourceAmountBaseUnits,
    ),
    minimumSourceAmountBaseUnits: minimumQuote.minimumSourceAmountBaseUnits,
    minimumSourceAsset: sourceAssetDescriptor.symbol,
    destinationAsset: destinationAssetDescriptor.symbol,
    estimatedReceiveAtMinimum: fromAssetBaseUnits(
      destinationAssetDescriptor,
      minimumQuote.protectedQuote.estimatedReceiveAmountBaseUnits,
    ),
    estimatedReceiveAtMinimumBaseUnits:
      minimumQuote.protectedQuote.estimatedReceiveAmountBaseUnits,
    payoutNetworkFeeEstimate: payoutQuote?.networkFee
      ? String(payoutQuote.networkFee)
      : fromAssetBaseUnits(
          destinationAssetDescriptor,
          payoutFeeBaseUnits,
        ),
    payoutNetworkFeeEstimateBaseUnits: payoutFeeBaseUnits,
    systemFeeAmountAtMinimum: fromAssetBaseUnits(
      destinationAssetDescriptor,
      minimumQuote.protectedQuote.platformFeeAmountBaseUnits,
    ),
    systemFeeAmountAtMinimumBaseUnits:
      minimumQuote.protectedQuote.platformFeeAmountBaseUnits,
    grossDestinationAmountAtMinimum: fromAssetBaseUnits(
      destinationAssetDescriptor,
      minimumQuote.protectedQuote.grossDestinationBaseUnits,
    ),
    grossDestinationAmountAtMinimumBaseUnits:
      minimumQuote.protectedQuote.grossDestinationBaseUnits,
    sourceUsdEquivalentAtMinimum: formatScaledDecimal(
      sourceUsdAtMinimumBaseUnits.toString(),
      USD_SCALE,
    ),
    ...buildMinimumSwapQuoteDiagnostics({
      routeProtection,
      protectedQuote: minimumQuote.protectedQuote,
      payoutFeeBaseUnits,
      destinationAssetDescriptor,
    }),
    constraintCode:
      dominantConstraint?.constraintCode ||
      minimumQuote.constraintCode ||
      "swap_amount_too_small",
  };
}

function assertMinimumSwapQuoteOrThrow({
  sourceAmountBaseUnits,
  minimumSwapQuote,
  swapId = null,
}) {
  const minimumSourceAmountBaseUnits = normalizeBaseUnitCandidate(
    minimumSwapQuote?.minimumSourceAmountBaseUnits,
    "0",
  );

  if (
    isBaseUnitsGte(minimumSourceAmountBaseUnits, "1") &&
    !isBaseUnitsGte(String(sourceAmountBaseUnits || "0"), minimumSourceAmountBaseUnits)
  ) {
    throw buildAmountTooSmallValidationError(
      "swap_amount_too_small",
      buildAmountTooSmallConstraintDetails({
        constraintCode: minimumSwapQuote?.constraintCode,
        swapId,
        minimumSwapQuote,
      }),
    );
  }

  return minimumSwapQuote;
}

function buildExchangeRate({
  sourceAmountBaseUnits,
  sourceDecimals,
  destinationAmountBaseUnits,
  destinationDecimals,
}) {
  const rateScaled = divideBigInt(
    BigInt(String(destinationAmountBaseUnits)) *
      getPowerOfTen(sourceDecimals + RATE_SCALE),
    BigInt(String(sourceAmountBaseUnits)) * getPowerOfTen(destinationDecimals),
    { rounding: "floor" },
  );

  return formatScaledDecimal(rateScaled.toString(), RATE_SCALE);
}

async function resolveValidatedSwapSystemWalletConfig(input = {}) {
  const config = swapConfig.getSwapSystemWalletConfig(input, {
    includeSecret: true,
  });
  const context = assertSupportedChainNetwork(input.chain, input.network);

  if (!context.adapter.wallet.validateAddress(config.address, input.network)) {
    throw AppError.validation(
      `Configured swap system wallet address for "${config.key}" is invalid`,
    );
  }

  let derivedAddress;
  try {
    derivedAddress = await context.adapter.wallet.resolveAddressFromSecret(config.secret);
  } catch (_error) {
    throw AppError.validation(
      `Configured swap system wallet secret for "${config.key}" is invalid`,
    );
  }

  if (normalizeAddress(derivedAddress) !== normalizeAddress(config.address)) {
    throw AppError.conflict(
      `Configured swap system wallet secret does not match the address for "${config.key}"`,
    );
  }

  return config;
}

async function resolveValidatedDestination(input = {}) {
  const context = assertChainFeature(input.wallet.chain, input.wallet.network, "send");
  const validated = await context.adapter.transaction.validateDestination({
    network: input.wallet.network,
    fromAddress: input.wallet.address,
    destinationAddress: input.destinationAddress,
    executionParams: input.executionParams || {},
    asset: input.assetDescriptor.asset,
    assetDescriptor: input.assetDescriptor,
  });

  return {
    destinationAddress: validated.destinationAddress,
    executionParams: validated.executionParams || {},
  };
}

async function resolveDestinationReceivePayload(userId, wallet, assetDescriptor) {
  return walletService.getReceivePayload(userId, {
    walletId: wallet._id,
    asset: assetDescriptor.asset,
  });
}

async function estimateSourceSideQuote({
  userId,
  wallet,
  destinationAddress,
  assetDescriptor,
  amount,
  requestId,
  validateBalance = true,
}) {
  if (!validateBalance) {
    const context = assertChainFeature(wallet.chain, wallet.network, "send");
    const validatedDestination = await resolveValidatedDestination({
      wallet,
      destinationAddress,
      executionParams: {},
      assetDescriptor,
    });
    const balance = await balanceService.getWalletBalance(userId, String(wallet._id), {
      requestId,
      force: false,
      trigger: "swap_preview_quote",
    });
    const availableBalanceBaseUnits = String(
      balance?.metadata?.availableBaseUnits ||
        toAssetBaseUnits(assetDescriptor, balance?.availableBalance || "0"),
    );
    const feeQuote = await feeService.quoteTransfer({
      context: {
        ...context,
        network: wallet.network,
        assetDescriptor,
      },
      amount,
      senderAddress: wallet.address,
      destinationAddress: validatedDestination.destinationAddress,
      network: wallet.network,
      transactionType: "external",
      executionParams: validatedDestination.executionParams,
      assetDescriptor,
    });
    const totalDebitBaseUnits = String(feeQuote.totalDebitBaseUnits || "0");
    const remainingBalanceBaseUnits = isBaseUnitsGte(
      availableBalanceBaseUnits,
      totalDebitBaseUnits,
    )
      ? (BigInt(availableBalanceBaseUnits) - BigInt(totalDebitBaseUnits)).toString()
      : "0";

    return {
      amount: String(feeQuote.amount || amount),
      amountBaseUnits: String(feeQuote.amountBaseUnits || "0"),
      sourceNetworkFee: feeQuote.networkFee,
      sourceNetworkFeeBaseUnits: String(feeQuote.networkFeeBaseUnits || "0"),
      totalDebit: feeQuote.totalDebit,
      totalDebitBaseUnits,
      availableBalance: fromAssetBaseUnits(
        assetDescriptor,
        availableBalanceBaseUnits,
      ),
      availableBalanceBaseUnits,
      availableFeeBalance: balance?.availableBalance || "0",
      availableFeeBalanceBaseUnits: availableBalanceBaseUnits,
      remainingBalance: fromAssetBaseUnits(
        assetDescriptor,
        remainingBalanceBaseUnits,
      ),
      remainingBalanceBaseUnits,
      toAddress: validatedDestination.destinationAddress,
      executionParams: validatedDestination.executionParams || {},
      preparedTransaction: feeQuote.preparedTransaction || null,
    };
  }

  const quote = await transactionService.previewTransfer({
    userId,
    walletId: String(wallet._id),
    destinationAddress,
    amount,
    asset: assetDescriptor.asset,
    requestId,
  });

  if (quote.canSubmit === false) {
    throw AppError.validation(
      quote.validationErrors?.[0] || "Source transfer cannot be submitted",
      quote.validationContext || null,
    );
  }

  if (quote.transactionType !== "external") {
    throw AppError.conflict(
      "Configured source treasury wallet must resolve as an external send destination",
    );
  }

  return {
    amount: quote.amount,
    amountBaseUnits: quote.amountBaseUnits,
    sourceNetworkFee: quote.networkFee,
    sourceNetworkFeeBaseUnits: quote.networkFeeBaseUnits,
    totalDebit: quote.totalDebit,
    totalDebitBaseUnits: quote.totalDebitBaseUnits,
    availableBalance: quote.availableBalance,
    availableBalanceBaseUnits: quote.availableBalanceBaseUnits,
    availableFeeBalance: quote.availableFeeBalance,
    availableFeeBalanceBaseUnits: quote.availableFeeBalanceBaseUnits,
    remainingBalance: quote.remainingBalance,
    remainingBalanceBaseUnits: quote.remainingBalanceBaseUnits,
    toAddress: quote.toAddress,
    executionParams: quote.executionParams || {},
    preparedTransaction: null,
  };
}

async function estimateDestinationPayoutQuote({
  destinationWallet,
  destinationAssetDescriptor,
  destinationSystemWallet,
  amount,
  destinationAddress,
  executionParams = {},
}) {
  const context = assertChainFeature(
    destinationWallet.chain,
    destinationWallet.network,
    "send",
  );
  const swapFeeContext = buildSwapFeeContext(context, destinationAssetDescriptor);
  const validatedDestination = await resolveValidatedDestination({
    wallet: {
      ...destinationWallet,
      address: destinationSystemWallet.address,
    },
    destinationAddress,
    executionParams,
    assetDescriptor: destinationAssetDescriptor,
  });

  try {
    return {
      ...(await feeService.quoteTransfer({
        context: swapFeeContext,
        amount,
        senderAddress: destinationSystemWallet.address,
        destinationAddress: validatedDestination.destinationAddress,
        network: destinationWallet.network,
        transactionType: "external",
        executionParams: validatedDestination.executionParams,
        assetDescriptor: destinationAssetDescriptor,
      })),
      destinationAddress: validatedDestination.destinationAddress,
      executionParams: validatedDestination.executionParams,
    };
  } catch (error) {
    if (shouldPropagateSwapValidationError(error)) {
      throw error;
    }

    throw buildFeeEstimationFailedValidationError({
      asset: destinationAssetDescriptor.symbol,
      chain: destinationWallet.chain,
      network: destinationWallet.network,
      internalReason: normalizeErrorMessage(error),
    });
  }
}

function assertNativeWallet(wallet, assetDescriptor, message) {
  if (String(wallet.asset || "").trim().toUpperCase() !== assetDescriptor.asset) {
    throw AppError.validation(message);
  }
}

async function getOwnedSwapOrFail(userId, swapId) {
  const swap = await Swap.findOne({
    _id: swapId,
    userId,
  }).lean();

  if (!swap) {
    throw AppError.notFound("Swap not found");
  }

  return swap;
}

async function updateSwapRecord(swap, updates = {}) {
  const persistedSwap = await Swap.findOne({
    _id: swap._id,
    userId: swap.userId,
  }).lean();

  if (!persistedSwap) {
    throw AppError.notFound("Swap not found");
  }

  const safeUpdates = { ...updates };
  if (
    safeUpdates.status &&
    isFinalSwapStatus(persistedSwap.status) &&
    String(safeUpdates.status).trim().toLowerCase() !==
      String(persistedSwap.status || "").trim().toLowerCase()
  ) {
    return persistedSwap;
  }

  const updatedSwap = await Swap.findOneAndUpdate(
    { _id: swap._id, userId: swap.userId },
    { $set: safeUpdates },
    { new: true },
  ).lean();

  await syncSourceTransactionSwapMetadata(updatedSwap);

  return updatedSwap;
}

async function syncSourceTransactionSwapMetadata(swap) {
  const transactionId = swap?.sourceTransactionId;
  if (!transactionId) {
    return;
  }

  try {
    await Transaction.updateOne(
      { _id: transactionId },
      {
        $set: {
          "metadata.swap.swapId": String(swap._id),
          "metadata.swap.quoteId": String(swap._id),
          "metadata.swap.conversionId":
            swap?.metadata?.conversionId || String(swap._id),
          "metadata.swap.requestId": swap.requestId || null,
          "metadata.swap.routeId": swap.routeId || null,
          "metadata.swap.role": "source_transfer",
          "metadata.swap.fromWalletId": String(swap.fromWalletId || ""),
          "metadata.swap.toWalletId": String(swap.toWalletId || ""),
          "metadata.swap.sourceAsset": swap.fromAsset,
          "metadata.swap.destinationAsset": swap.toAsset,
          "metadata.swap.sourceAmount": swap.sourceAmount,
          "metadata.swap.sourceAmountBaseUnits": swap.sourceAmountBaseUnits,
          "metadata.swap.estimatedReceiveAmount": swap.estimatedReceiveAmount,
          "metadata.swap.estimatedReceiveAmountBaseUnits":
            swap.estimatedReceiveAmountBaseUnits,
          "metadata.swap.finalReceiveAmount": swap.finalReceiveAmount || null,
          "metadata.swap.finalReceiveAmountBaseUnits":
            swap.finalReceiveAmountBaseUnits || null,
          "metadata.swap.sourceChain": swap.fromChain,
          "metadata.swap.sourceNetwork": swap.fromNetwork,
          "metadata.swap.destinationChain": swap.toChain,
          "metadata.swap.destinationNetwork": swap.toNetwork,
          "metadata.swap.sourceTxHash": swap.sourceTxHash || null,
          "metadata.swap.payoutTxHash": swap.payoutTxHash || null,
          "metadata.swap.quoteExpiresAt": swap.quoteExpiresAt || null,
          "metadata.swap.fallbackPriceUsed":
            Boolean(swap?.metadata?.pricing?.fallbackPriceUsed),
          "metadata.swap.priceSource":
            swap?.metadata?.pricing?.source?.provider || null,
          "metadata.swap.priceTimestamp":
            swap?.metadata?.pricing?.source?.updatedAt || null,
          "metadata.swap.systemFeeAmount": swap.systemFeeAmount || "0",
          "metadata.swap.systemFeeAmountBaseUnits":
            swap.systemFeeAmountBaseUnits || "0",
          "metadata.swap.payoutNetworkFee":
            swap.payoutNetworkFee || swap.payoutNetworkFeeEstimate || "0",
          "metadata.swap.payoutNetworkFeeBaseUnits":
            swap.payoutNetworkFeeBaseUnits ||
            swap.payoutNetworkFeeEstimateBaseUnits ||
            "0",
          "metadata.swap.sourceNetworkFee": swap.sourceNetworkFee || "0",
          "metadata.swap.sourceNetworkFeeBaseUnits":
            swap.sourceNetworkFeeBaseUnits || "0",
          "metadata.swap.status": swap.status,
          "metadata.swap.statusUpdatedAt": swap.updatedAt || null,
        },
      },
    );
  } catch (error) {
    logger.warn("Failed to link source transaction back to swap", {
      swapId: String(swap?._id || ""),
      transactionId: String(transactionId || ""),
      error: extractErrorMessage(error),
    });
  }
}

async function expirePreviewedSwapIfNeeded(swap) {
  if (swap.status !== "previewed") {
    return swap;
  }

  const expiresAt = normalizeDate(swap.quoteExpiresAt);
  if (!expiresAt || expiresAt.getTime() > Date.now()) {
    return swap;
  }

  return updateSwapRecord(swap, {
    status: "expired",
    failureReason: "Swap quote expired before execution",
    failureCode: SWAP_FAILURE_CODES.QUOTE_EXPIRED,
    metadata: buildFailureMetadata(
      swap.metadata || {},
      "Swap quote expired before execution",
      SWAP_FAILURE_CODES.QUOTE_EXPIRED,
      {
        expiredAt: new Date(),
        quoteExpiresAt: expiresAt,
      },
    ),
  });
}

function buildWalletAssetInfoFromSwap({
  walletId,
  accountId,
  chain,
  network,
  asset,
  address,
}) {
  const assetDescriptor = buildNativeAssetDescriptor(chain, network);

  return {
    walletId: String(walletId || ""),
    accountId: accountId ? String(accountId) : null,
    chain,
    chainLabel: getChainLabel(chain),
    network,
    networkLabel: getNetworkLabel(chain, network),
    asset,
    symbol: assetDescriptor.symbol,
    code: assetDescriptor.code,
    label: assetDescriptor.label,
    decimals: assetDescriptor.decimals,
    address: address || null,
  };
}

function buildSwapResponse(swap) {
  const metadata = swap?.metadata && typeof swap.metadata === "object" ? swap.metadata : {};
  const pricingMetadata =
    metadata?.pricing && typeof metadata.pricing === "object" ? metadata.pricing : {};
  const routeProtection =
    metadata?.routeProtection &&
    typeof metadata.routeProtection === "object" &&
    !Array.isArray(metadata.routeProtection)
      ? metadata.routeProtection
      : {};
  const payoutPreviewMetadata =
    metadata?.payoutPreview &&
    typeof metadata.payoutPreview === "object" &&
    !Array.isArray(metadata.payoutPreview)
      ? metadata.payoutPreview
      : {};
  const failureCode = swap.failureCode || metadata?.failure?.code || null;
  const sourceAccountId = metadata?.accounts?.sourceAccountId || swap.accountId || null;
  const destinationAccountId =
    metadata?.accounts?.destinationAccountId || swap.accountId || null;
  const sourcePreview = metadata?.sourcePreview || {};
  const destinationReceive = metadata?.destinationReceive || {};
  const sourceTransaction = swap.sourceTransactionId || swap.sourceTxHash
    ? {
        transactionId: swap.sourceTransactionId ? String(swap.sourceTransactionId) : null,
        txHash: swap.sourceTxHash || null,
        status: swap.sourceTransactionStatus || null,
        chainStatus: swap.sourceChainStatus || null,
        submittedAt: swap.sourceSubmittedAt || null,
        confirmedAt: swap.sourceConfirmedAt || null,
      }
    : null;
  const payoutTransaction = swap.payoutTxHash || swap.payoutTransactionId
    ? {
        transactionId: swap.payoutTransactionId || null,
        txHash: swap.payoutTxHash || null,
        status: swap.payoutTransactionStatus || null,
        chainStatus: swap.payoutChainStatus || null,
        submittedAt: swap.payoutSubmittedAt || null,
        confirmedAt: swap.payoutConfirmedAt || null,
      }
    : null;

  return {
    swapId: String(swap._id),
    quoteId: String(swap._id),
    conversionId: metadata?.conversionId || String(swap._id),
    requestId: swap.requestId || metadata?.requestId || null,
    routeId:
      swap.routeId ||
      metadata.routeId ||
      metadata.pairId ||
      buildPairId(
        {
          chain: swap.fromChain,
          network: swap.fromNetwork,
          asset: swap.fromAsset,
        },
        {
          chain: swap.toChain,
          network: swap.toNetwork,
          asset: swap.toAsset,
        },
      ),
    status: swap.status,
    failureReason:
      buildSafeSwapFailureReason(swap.status, failureCode) ||
      swap.failureReason ||
      null,
    failureCode,
    failureContext: null,
    expiresAt: swap.quoteExpiresAt,
    createdAt: swap.createdAt,
    updatedAt: swap.updatedAt,
    pairId: swap.routeId || metadata.routeId || metadata.pairId || buildPairId(
      {
        chain: swap.fromChain,
        network: swap.fromNetwork,
        asset: swap.fromAsset,
      },
      {
        chain: swap.toChain,
        network: swap.toNetwork,
        asset: swap.toAsset,
      },
    ),
    sourceTxHash: swap.sourceTxHash || null,
    payoutTxHash: swap.payoutTxHash || null,
    finalReceiveAmount: swap.finalReceiveAmount || null,
    finalReceiveAmountBaseUnits: swap.finalReceiveAmountBaseUnits || null,
    from: {
      ...buildWalletAssetInfoFromSwap({
        walletId: swap.fromWalletId,
        accountId: sourceAccountId,
        chain: swap.fromChain,
        network: swap.fromNetwork,
        asset: swap.fromAsset,
        address: metadata.sourceWalletAddress,
      }),
      amount: swap.sourceAmount,
      amountBaseUnits: swap.sourceAmountBaseUnits,
      priceUsd: swap.sourcePriceUsd,
      usdEquivalent: metadata.sourceUsdEquivalent || null,
      sourceNetworkFee: swap.sourceNetworkFee,
      sourceNetworkFeeBaseUnits: swap.sourceNetworkFeeBaseUnits,
      totalDebit: sourcePreview.totalDebit || null,
      totalDebitBaseUnits: sourcePreview.totalDebitBaseUnits || null,
      availableBalance: sourcePreview.availableBalance || null,
      availableBalanceBaseUnits: sourcePreview.availableBalanceBaseUnits || null,
      remainingBalance: sourcePreview.remainingBalance || null,
      remainingBalanceBaseUnits: sourcePreview.remainingBalanceBaseUnits || null,
      sourceTransaction,
    },
    to: {
      ...buildWalletAssetInfoFromSwap({
        walletId: swap.toWalletId,
        accountId: destinationAccountId,
        chain: swap.toChain,
        network: swap.toNetwork,
        asset: swap.toAsset,
        address: destinationReceive.address || metadata.destinationWalletAddress,
      }),
      executionParams: destinationReceive.executionParams || {},
      priceUsd: swap.destinationPriceUsd,
      grossDestinationAmount: swap.grossDestinationAmount,
      grossDestinationAmountBaseUnits: swap.grossDestinationAmountBaseUnits,
      systemFeeAmount: swap.systemFeeAmount,
      systemFeeAmountBaseUnits: swap.systemFeeAmountBaseUnits,
      payoutNetworkFeeEstimate: swap.payoutNetworkFeeEstimate,
      payoutNetworkFeeEstimateBaseUnits: swap.payoutNetworkFeeEstimateBaseUnits,
      payoutNetworkFee: swap.payoutNetworkFee,
      payoutNetworkFeeBaseUnits: swap.payoutNetworkFeeBaseUnits,
      estimatedReceiveAmount: swap.estimatedReceiveAmount,
      estimatedReceiveAmountBaseUnits: swap.estimatedReceiveAmountBaseUnits,
      finalReceiveAmount: swap.finalReceiveAmount || null,
      finalReceiveAmountBaseUnits: swap.finalReceiveAmountBaseUnits || null,
      payoutTransaction,
    },
    pricing: {
      exchangeRate: swap.exchangeRate,
      systemFeeBps: swap.systemFeeBps,
      serviceFeeBps:
        routeProtection.serviceFeeBps === undefined
          ? swap.systemFeeBps
          : routeProtection.serviceFeeBps,
      spreadBps: routeProtection.spreadBps || 0,
      payoutFeeBufferBps: routeProtection.payoutFeeBufferBps || 0,
      minimumProfitUsd: routeProtection.minimumProfitUsd || "0",
      sourcePriceUsd: swap.sourcePriceUsd,
      destinationPriceUsd: swap.destinationPriceUsd,
      fallbackPriceUsed: Boolean(pricingMetadata?.fallbackPriceUsed),
      source: pricingMetadata?.source || null,
      destination: pricingMetadata?.destination || null,
    },
    fees: {
      sourceNetworkFee: swap.sourceNetworkFee,
      sourceNetworkFeeBaseUnits: swap.sourceNetworkFeeBaseUnits,
      systemFeeAmount: swap.systemFeeAmount,
      systemFeeAmountBaseUnits: swap.systemFeeAmountBaseUnits,
      spreadFeeAmount: payoutPreviewMetadata.spreadFeeAmount || "0",
      spreadFeeAmountBaseUnits:
        payoutPreviewMetadata.spreadFeeAmountBaseUnits || "0",
      payoutNetworkFeeEstimate: swap.payoutNetworkFeeEstimate,
      payoutNetworkFeeEstimateBaseUnits: swap.payoutNetworkFeeEstimateBaseUnits,
      payoutNetworkFeeActualEstimate:
        payoutPreviewMetadata.actualNetworkFee || swap.payoutNetworkFeeEstimate,
      payoutNetworkFeeActualEstimateBaseUnits:
        payoutPreviewMetadata.actualNetworkFeeBaseUnits ||
        swap.payoutNetworkFeeEstimateBaseUnits,
      payoutNetworkFeeBufferAmount:
        payoutPreviewMetadata.bufferAmount || "0",
      payoutNetworkFeeBufferAmountBaseUnits:
        payoutPreviewMetadata.bufferAmountBaseUnits || "0",
      payoutNetworkFee: swap.payoutNetworkFee,
      payoutNetworkFeeBaseUnits: swap.payoutNetworkFeeBaseUnits,
      minimumProfitAmount: payoutPreviewMetadata.minimumProfitAmount || "0",
      minimumProfitAmountBaseUnits:
        payoutPreviewMetadata.minimumProfitAmountBaseUnits || "0",
    },
    linkage: {
      sourceTransactionId: swap.sourceTransactionId
        ? String(swap.sourceTransactionId)
        : null,
      payoutTransactionId: swap.payoutTransactionId || null,
    },
    routing: {
      routeId:
        swap.routeId ||
        metadata.routeId ||
        metadata.pairId ||
        buildPairId(
          {
            chain: swap.fromChain,
            network: swap.fromNetwork,
            asset: swap.fromAsset,
          },
          {
            chain: swap.toChain,
            network: swap.toNetwork,
            asset: swap.toAsset,
          },
        ),
      mode: "treasury_universal",
    },
  };
}

function buildPayoutLiquidityEvaluation({
  assetDescriptor,
  systemWalletConfig,
  liveBalance,
  payoutAmountBaseUnits = "0",
  payoutNetworkFeeBaseUnits = "0",
}) {
  const payoutLiquidity = buildTreasuryLiquiditySnapshot(
    assetDescriptor,
    systemWalletConfig,
    liveBalance,
  );
  const requiredLiquidityBaseUnits = addBaseUnits(
    payoutAmountBaseUnits,
    payoutNetworkFeeBaseUnits,
  );

  return {
    checkedAt: new Date(),
    ...payoutLiquidity,
    requiredAmount: fromAssetBaseUnits(assetDescriptor, payoutAmountBaseUnits),
    requiredAmountBaseUnits: String(payoutAmountBaseUnits || "0"),
    requiredNetworkFee: fromAssetBaseUnits(
      assetDescriptor,
      payoutNetworkFeeBaseUnits,
    ),
    requiredNetworkFeeBaseUnits: String(payoutNetworkFeeBaseUnits || "0"),
    requiredLiquidity: fromAssetBaseUnits(
      assetDescriptor,
      requiredLiquidityBaseUnits,
    ),
    requiredLiquidityBaseUnits,
    isSufficient: isBaseUnitsGte(
      payoutLiquidity.availableAfterReserveBaseUnits,
      requiredLiquidityBaseUnits,
    ),
  };
}

function assertPayoutLiquidityOrThrow({
  assetDescriptor,
  systemWalletConfig,
  liveBalance,
  payoutAmountBaseUnits,
  payoutNetworkFeeBaseUnits,
  swapId = null,
}) {
  const payoutLiquidity = buildPayoutLiquidityEvaluation({
    assetDescriptor,
    systemWalletConfig,
    liveBalance,
    payoutAmountBaseUnits,
    payoutNetworkFeeBaseUnits,
  });

  if (!payoutLiquidity.isSufficient) {
    throw buildLiquidityInsufficientValidationError({
      ...(swapId ? { swapId: String(swapId) } : {}),
      asset: assetDescriptor.symbol,
      requiredLiquidity: payoutLiquidity.requiredLiquidity,
      requiredLiquidityBaseUnits: payoutLiquidity.requiredLiquidityBaseUnits,
      availableLiquidity: payoutLiquidity.availableAfterReserve,
      availableLiquidityBaseUnits:
        payoutLiquidity.availableAfterReserveBaseUnits,
      internalReason:
        "Destination swap system wallet does not have enough live liquidity to cover the payout and reserve requirements",
    });
  }

  return payoutLiquidity;
}

async function validatePreviewedSwapOrThrow(swap, options = {}) {
  const expiredSwap = await expirePreviewedSwapIfNeeded(swap);
  if (expiredSwap.status === "expired") {
    throw buildReviewValidationError(
      SWAP_USER_MESSAGES.QUOTE_EXPIRED,
      "quote_expired",
      {
        swapId: String(expiredSwap._id || ""),
        quoteExpiresAt: expiredSwap.quoteExpiresAt || null,
      },
    );
  }

  if (expiredSwap.status !== "previewed") {
    return expiredSwap;
  }

  const [fromWallet, toWallet] = await Promise.all([
    transactionService.getWalletOrFail(options.userId, expiredSwap.fromWalletId),
    transactionService.getWalletOrFail(options.userId, expiredSwap.toWalletId),
  ]);
  const fromAssetDescriptor = buildNativeAssetDescriptor(fromWallet.chain, fromWallet.network);
  const toAssetDescriptor = buildNativeAssetDescriptor(toWallet.chain, toWallet.network);
  const routeProtection = swapConfig.getRouteProtectionConfig({
    routeId: expiredSwap.routeId,
  });

  assertNativeWallet(fromWallet, fromAssetDescriptor, "Source wallet must use a native asset");
  assertNativeWallet(toWallet, toAssetDescriptor, "Destination wallet must use a native asset");

  let sourceSystemWallet;
  let destinationSystemWallet;
  let destinationReceive;
  let minimumSwapQuote;
  const sourcePriceScaled = parseDecimalToScaledInt(
    expiredSwap.sourcePriceUsd,
    PRICE_SCALE,
  );
  const destinationPriceScaled = parseDecimalToScaledInt(
    expiredSwap.destinationPriceUsd,
    PRICE_SCALE,
  );
  try {
    [sourceSystemWallet, destinationSystemWallet] = await Promise.all([
      resolveValidatedSwapSystemWalletConfig({
        chain: fromWallet.chain,
        network: fromWallet.network,
        asset: fromAssetDescriptor.asset,
      }),
      resolveValidatedSwapSystemWalletConfig({
        chain: toWallet.chain,
        network: toWallet.network,
        asset: toAssetDescriptor.asset,
      }),
    ]);
  } catch (error) {
    throw buildReviewValidationError(
      SWAP_USER_MESSAGES.TEMPORARILY_UNAVAILABLE,
      "swap_temporarily_unavailable",
      {
        swapId: String(expiredSwap._id || ""),
        internalReason: normalizeErrorMessage(error),
      },
    );
  }

  try {
    destinationReceive = await resolveDestinationReceivePayload(
      options.userId,
      toWallet,
      toAssetDescriptor,
    );
    minimumSwapQuote = await calculateMinimumSwapQuote({
      routeProtection,
      sourceAssetDescriptor: fromAssetDescriptor,
      destinationAssetDescriptor: toAssetDescriptor,
      sourcePriceScaled,
      destinationPriceScaled,
      destinationWallet: toWallet,
      destinationSystemWallet,
      destinationReceive,
      swapId: expiredSwap._id,
    });
  } catch (error) {
    if (shouldPropagateSwapValidationError(error)) {
      throw error;
    }

    throw buildReviewValidationError(
      SWAP_USER_MESSAGES.TEMPORARILY_UNAVAILABLE,
      "swap_temporarily_unavailable",
      {
        swapId: String(expiredSwap._id || ""),
        internalReason: normalizeErrorMessage(error),
      },
    );
  }

  const minimumSourceAmountRule = {
    minimumSourceAmount: minimumSwapQuote.minimumSourceAmount,
    minimumSourceAmountBaseUnits: minimumSwapQuote.minimumSourceAmountBaseUnits,
  };
  assertMinimumSwapQuoteOrThrow({
    sourceAmountBaseUnits: expiredSwap.sourceAmountBaseUnits,
    minimumSwapQuote,
    swapId: expiredSwap._id,
  });

  let sourcePreview;
  try {
    sourcePreview = await estimateSourceSideQuote({
      userId: options.userId,
      wallet: fromWallet,
      destinationAddress: sourceSystemWallet.address,
      assetDescriptor: fromAssetDescriptor,
      amount: expiredSwap.sourceAmount,
      requestId: options.requestId,
      validateBalance: true,
    });
  } catch (error) {
    if (isSourceBalanceValidationError(error)) {
      throw buildReviewValidationError(
        SWAP_USER_MESSAGES.INSUFFICIENT_BALANCE,
        "source_balance_insufficient",
        {
          swapId: String(expiredSwap._id || ""),
          internalReason: normalizeErrorMessage(error),
        },
      );
    }

    throw buildReviewValidationError(
      SWAP_USER_MESSAGES.TEMPORARILY_UNAVAILABLE,
      "swap_temporarily_unavailable",
      {
        swapId: String(expiredSwap._id || ""),
        internalReason: normalizeErrorMessage(error),
      },
    );
  }

  let payoutQuote;
  let liveDestinationBalance;
  const platformProtection = buildProfitProtectedQuoteFromGross({
    routeProtection,
    grossDestinationBaseUnits: expiredSwap.grossDestinationAmountBaseUnits,
    destinationPriceScaled,
    destinationDecimals: toAssetDescriptor.decimals,
    payoutNetworkFeeBaseUnits: "0",
    swapId: expiredSwap._id,
  });
  try {
    payoutQuote = await estimateDestinationPayoutQuote({
      destinationWallet: toWallet,
      destinationAssetDescriptor: toAssetDescriptor,
      destinationSystemWallet,
      amount: fromAssetBaseUnits(
        toAssetDescriptor,
        platformProtection.destinationAmountBeforePayoutBaseUnits,
      ),
      destinationAddress: destinationReceive.address,
      executionParams: destinationReceive.executionParams,
    });
    liveDestinationBalance = await readLiveSwapSystemBalance({
      userId: options.userId,
      chain: toWallet.chain,
      network: toWallet.network,
      address: destinationSystemWallet.address,
      requestId: options.requestId,
    });
  } catch (error) {
    if (shouldPropagateSwapValidationError(error)) {
      throw error;
    }

    throw buildReviewValidationError(
      SWAP_USER_MESSAGES.TEMPORARILY_UNAVAILABLE,
      "swap_temporarily_unavailable",
      {
        swapId: String(expiredSwap._id || ""),
        internalReason: normalizeErrorMessage(error),
      },
    );
  }

  const protectedQuote = buildProfitProtectedQuote({
    routeProtection,
    sourceAmountBaseUnits: expiredSwap.sourceAmountBaseUnits,
    sourcePriceScaled,
    sourceDecimals: fromAssetDescriptor.decimals,
    destinationPriceScaled,
    destinationDecimals: toAssetDescriptor.decimals,
    payoutNetworkFeeBaseUnits: String(payoutQuote.networkFeeBaseUnits || "0"),
    swapId: expiredSwap._id,
  });
  const payoutNetworkFeeEstimateBaseUnits =
    protectedQuote.bufferedPayoutNetworkFeeBaseUnits;
  const estimatedReceiveAmountBaseUnits =
    protectedQuote.estimatedReceiveAmountBaseUnits;

  const payoutLiquidity = assertPayoutLiquidityOrThrow({
    assetDescriptor: toAssetDescriptor,
    systemWalletConfig: destinationSystemWallet,
    liveBalance: liveDestinationBalance,
    payoutAmountBaseUnits: estimatedReceiveAmountBaseUnits,
    payoutNetworkFeeBaseUnits: String(payoutQuote.networkFeeBaseUnits || "0"),
    swapId: expiredSwap._id,
  });

  const refreshedSwap = await updateSwapRecord(expiredSwap, {
    systemFeeBps: routeProtection.totalFeeBps,
    systemFeeAmount: fromAssetBaseUnits(
      toAssetDescriptor,
      protectedQuote.platformFeeAmountBaseUnits,
    ),
    systemFeeAmountBaseUnits: protectedQuote.platformFeeAmountBaseUnits,
    sourceNetworkFee: sourcePreview.sourceNetworkFee,
    sourceNetworkFeeBaseUnits: sourcePreview.sourceNetworkFeeBaseUnits,
    payoutNetworkFeeEstimate: fromAssetBaseUnits(
      toAssetDescriptor,
      payoutNetworkFeeEstimateBaseUnits,
    ),
    payoutNetworkFeeEstimateBaseUnits,
    estimatedReceiveAmount: fromAssetBaseUnits(
      toAssetDescriptor,
      estimatedReceiveAmountBaseUnits,
    ),
    estimatedReceiveAmountBaseUnits,
    failureReason: null,
    failureCode: null,
    metadata: clearFailureMetadata(
      mergeMetadata(expiredSwap.metadata || {}, {
        sourcePreview: {
          totalDebit: sourcePreview.totalDebit,
          totalDebitBaseUnits: sourcePreview.totalDebitBaseUnits,
          availableBalance: sourcePreview.availableBalance,
          availableBalanceBaseUnits: sourcePreview.availableBalanceBaseUnits,
          remainingBalance: sourcePreview.remainingBalance,
          remainingBalanceBaseUnits: sourcePreview.remainingBalanceBaseUnits,
          preparedTransaction: sourcePreview.preparedTransaction || null,
        },
        destinationReceive: {
          address: destinationReceive.address,
          executionParams: destinationReceive.executionParams || {},
          destinationTag: destinationReceive.destinationTag || null,
        },
        payoutPreview: {
          preparedTransaction: payoutQuote.preparedTransaction || null,
          actualNetworkFee: payoutQuote.networkFee || null,
          actualNetworkFeeBaseUnits: String(payoutQuote.networkFeeBaseUnits || "0"),
          bufferAmount: fromAssetBaseUnits(
            toAssetDescriptor,
            protectedQuote.payoutFeeBufferAmountBaseUnits,
          ),
          bufferAmountBaseUnits: protectedQuote.payoutFeeBufferAmountBaseUnits,
          bufferedNetworkFee: fromAssetBaseUnits(
            toAssetDescriptor,
            protectedQuote.bufferedPayoutNetworkFeeBaseUnits,
          ),
          bufferedNetworkFeeBaseUnits:
            protectedQuote.bufferedPayoutNetworkFeeBaseUnits,
          serviceFeeAmount: fromAssetBaseUnits(
            toAssetDescriptor,
            protectedQuote.serviceFeeAmountBaseUnits,
          ),
          serviceFeeAmountBaseUnits: protectedQuote.serviceFeeAmountBaseUnits,
          spreadFeeAmount: fromAssetBaseUnits(
            toAssetDescriptor,
            protectedQuote.spreadFeeAmountBaseUnits,
          ),
          spreadFeeAmountBaseUnits: protectedQuote.spreadFeeAmountBaseUnits,
          minimumProfitAmount: fromAssetBaseUnits(
            toAssetDescriptor,
            protectedQuote.minimumProfitBaseUnits,
          ),
          minimumProfitAmountBaseUnits: protectedQuote.minimumProfitBaseUnits,
        },
        payoutLiquidity: {
          ...payoutLiquidity,
          requiredNetworkFee: payoutQuote.networkFee,
        },
        routeProtection: {
          serviceFeeBps: routeProtection.serviceFeeBps,
          spreadBps: routeProtection.spreadBps,
          payoutFeeBufferBps: routeProtection.payoutFeeBufferBps,
          minimumProfitUsd: routeProtection.minimumProfitUsd,
          minSourceAmount: minimumSourceAmountRule.minimumSourceAmount,
          minSourceAmountBaseUnits:
            minimumSourceAmountRule.minimumSourceAmountBaseUnits,
        },
        reviewValidation: {
          checkedAt: new Date(),
          status: "ready",
        },
      }),
    ),
  });

  return refreshedSwap;
}

async function previewSwap(input = {}) {
  if (!swapConfig.enabled) {
    throw AppError.validation("Swap is currently disabled");
  }

  if (String(input.fromWalletId || "") === String(input.toWalletId || "")) {
    throw AppError.validation("Source and destination wallets must be different");
  }

  const [fromWallet, toWallet] = await Promise.all([
    transactionService.getWalletOrFail(input.userId, input.fromWalletId),
    transactionService.getWalletOrFail(input.userId, input.toWalletId),
  ]);
  const fromAssetDescriptor = buildNativeAssetDescriptor(fromWallet.chain, fromWallet.network);
  const toAssetDescriptor = buildNativeAssetDescriptor(toWallet.chain, toWallet.network);

  assertNativeWallet(fromWallet, fromAssetDescriptor, "Source wallet must use a native asset");
  assertNativeWallet(toWallet, toAssetDescriptor, "Destination wallet must use a native asset");

  if (fromAssetDescriptor.asset === toAssetDescriptor.asset) {
    throw AppError.validation("Source and destination assets must be different");
  }
  const routeId = buildPairId(
    {
      chain: fromWallet.chain,
      network: fromWallet.network,
      asset: fromAssetDescriptor.asset,
    },
    {
      chain: toWallet.chain,
      network: toWallet.network,
      asset: toAssetDescriptor.asset,
    },
  );

  const normalizedAmount = buildPositiveNativeAmount(
    fromAssetDescriptor,
    input.amount,
  );
  const routeProtection = swapConfig.getRouteProtectionConfig({ routeId });
  let sourceSystemWallet;
  let destinationSystemWallet;
  let destinationReceive;
  let minimumSwapQuote;
  let marketDataMap;
  marketDataMap = await marketService.getMarketData([
    fromAssetDescriptor.symbol,
    toAssetDescriptor.symbol,
  ]);
  try {
    [
      sourceSystemWallet,
      destinationSystemWallet,
      destinationReceive,
    ] = await Promise.all([
      resolveValidatedSwapSystemWalletConfig({
        chain: fromWallet.chain,
        network: fromWallet.network,
        asset: fromAssetDescriptor.asset,
      }),
      resolveValidatedSwapSystemWalletConfig({
        chain: toWallet.chain,
        network: toWallet.network,
        asset: toAssetDescriptor.asset,
      }),
      resolveDestinationReceivePayload(input.userId, toWallet, toAssetDescriptor),
    ]);
  } catch (error) {
    if (shouldPropagateSwapValidationError(error)) {
      throw error;
    }

    throw buildTemporarilyUnavailableValidationError(
      "swap_temporarily_unavailable",
      {
        internalReason: normalizeErrorMessage(error),
      },
    );
  }

  const sourceMarketEntry = marketDataMap[fromAssetDescriptor.symbol] || {};
  const destinationMarketEntry = marketDataMap[toAssetDescriptor.symbol] || {};
  let sourcePriceUsd;
  let destinationPriceUsd;
  try {
    sourcePriceUsd = normalizeMarketPrice(
      sourceMarketEntry,
      fromAssetDescriptor.symbol,
    );
    destinationPriceUsd = normalizeMarketPrice(
      destinationMarketEntry,
      toAssetDescriptor.symbol,
    );
  } catch (error) {
    if (shouldPropagateSwapValidationError(error)) {
      throw error;
    }

    throw buildTemporarilyUnavailableValidationError(
      "swap_temporarily_unavailable",
      {
        internalReason: normalizeErrorMessage(error),
      },
    );
  }
  const pricingMetadata = {
    fallbackPriceUsed:
      Boolean(sourceMarketEntry?.fallbackPriceUsed) ||
      Boolean(destinationMarketEntry?.fallbackPriceUsed),
    source: buildPricingMetadataEntry(fromAssetDescriptor, sourceMarketEntry),
    destination: buildPricingMetadataEntry(
      toAssetDescriptor,
      destinationMarketEntry,
    ),
  };
  const conversionId = crypto.randomUUID();
  const sourcePriceScaled = parseDecimalToScaledInt(sourcePriceUsd, PRICE_SCALE);
  const destinationPriceScaled = parseDecimalToScaledInt(
    destinationPriceUsd,
    PRICE_SCALE,
  );
  const sourceUsdBaseUnits = buildSourceUsdBaseUnits(
    normalizedAmount.amountBaseUnits,
    fromAssetDescriptor.decimals,
    sourcePriceScaled,
  );
  const maxUsdBaseUnits = parseDecimalToScaledInt(
    swapConfig.maxUsdEquivalent,
    USD_SCALE,
  );

  if (sourceUsdBaseUnits > maxUsdBaseUnits) {
    throw AppError.validation(
      `Swap amount must not exceed ${swapConfig.maxUsdEquivalent} USD equivalent`,
    );
  }

  try {
    minimumSwapQuote = await calculateMinimumSwapQuote({
      routeProtection,
      sourceAssetDescriptor: fromAssetDescriptor,
      destinationAssetDescriptor: toAssetDescriptor,
      sourcePriceScaled,
      destinationPriceScaled,
      destinationWallet: toWallet,
      destinationSystemWallet,
      destinationReceive,
    });
  } catch (error) {
    if (shouldPropagateSwapValidationError(error)) {
      throw error;
    }

    throw buildTemporarilyUnavailableValidationError(
      "swap_temporarily_unavailable",
      {
        internalReason: normalizeErrorMessage(error),
      },
    );
  }

  const minimumSourceAmountRule = {
    minimumSourceAmount: minimumSwapQuote.minimumSourceAmount,
    minimumSourceAmountBaseUnits: minimumSwapQuote.minimumSourceAmountBaseUnits,
  };
  assertMinimumSwapQuoteOrThrow({
    sourceAmountBaseUnits: normalizedAmount.amountBaseUnits,
    minimumSwapQuote,
  });

  let sourcePreview;
  try {
    sourcePreview = await estimateSourceSideQuote({
      userId: input.userId,
      wallet: fromWallet,
      destinationAddress: sourceSystemWallet.address,
      assetDescriptor: fromAssetDescriptor,
      amount: normalizedAmount.amount,
      requestId: input.requestId,
      validateBalance: false,
    });
  } catch (error) {
    if (shouldPropagateSwapValidationError(error)) {
      throw error;
    }

    throw buildTemporarilyUnavailableValidationError(
      "swap_temporarily_unavailable",
      {
        internalReason: normalizeErrorMessage(error),
      },
    );
  }
  const grossDestinationBaseUnits = buildGrossDestinationBaseUnits({
    sourceAmountBaseUnits: normalizedAmount.amountBaseUnits,
    sourcePriceScaled,
    sourceDecimals: fromAssetDescriptor.decimals,
    destinationPriceScaled,
    destinationDecimals: toAssetDescriptor.decimals,
  }).toString();
  const platformProtection = buildProfitProtectedQuoteFromGross({
    routeProtection,
    grossDestinationBaseUnits,
    destinationPriceScaled,
    destinationDecimals: toAssetDescriptor.decimals,
    payoutNetworkFeeBaseUnits: "0",
  });

  let payoutPreview;
  try {
    payoutPreview = await estimateDestinationPayoutQuote({
      destinationWallet: toWallet,
      destinationAssetDescriptor: toAssetDescriptor,
      destinationSystemWallet,
      amount: fromAssetBaseUnits(
        toAssetDescriptor,
        platformProtection.destinationAmountBeforePayoutBaseUnits,
      ),
      destinationAddress: destinationReceive.address,
      executionParams: destinationReceive.executionParams,
    });
  } catch (error) {
    throw buildTemporarilyUnavailableValidationError(
      "swap_temporarily_unavailable",
      {
        internalReason: normalizeErrorMessage(error),
      },
    );
  }
  const protectedQuote = buildProfitProtectedQuote({
    routeProtection,
    sourceAmountBaseUnits: normalizedAmount.amountBaseUnits,
    sourcePriceScaled,
    sourceDecimals: fromAssetDescriptor.decimals,
    destinationPriceScaled,
    destinationDecimals: toAssetDescriptor.decimals,
    payoutNetworkFeeBaseUnits: String(payoutPreview.networkFeeBaseUnits || "0"),
  });
  const payoutNetworkFeeEstimateBaseUnits =
    protectedQuote.bufferedPayoutNetworkFeeBaseUnits;
  const estimatedReceiveAmountBaseUnits =
    protectedQuote.estimatedReceiveAmountBaseUnits;

  const quoteExpiresAt = new Date(
    Date.now() + swapConfig.previewTtlSeconds * 1000,
  );
  const swapRecord = await Swap.create({
    userId: input.userId,
    accountId: fromWallet.accountId || toWallet.accountId || undefined,
    fromWalletId: fromWallet._id,
    toWalletId: toWallet._id,
    fromChain: fromWallet.chain,
    fromNetwork: fromWallet.network,
    toChain: toWallet.chain,
    toNetwork: toWallet.network,
    fromAsset: fromAssetDescriptor.asset,
    routeId,
    requestId: input.requestId || null,
    toAsset: toAssetDescriptor.asset,
    sourceAmount: normalizedAmount.amount,
    sourceAmountBaseUnits: normalizedAmount.amountBaseUnits,
    sourcePriceUsd,
    destinationPriceUsd,
    exchangeRate: buildExchangeRate({
      sourceAmountBaseUnits: normalizedAmount.amountBaseUnits,
      sourceDecimals: fromAssetDescriptor.decimals,
      destinationAmountBaseUnits: grossDestinationBaseUnits,
      destinationDecimals: toAssetDescriptor.decimals,
    }),
    grossDestinationAmount: fromAssetBaseUnits(
      toAssetDescriptor,
      grossDestinationBaseUnits,
    ),
    grossDestinationAmountBaseUnits: grossDestinationBaseUnits,
    systemFeeBps: routeProtection.totalFeeBps,
    systemFeeAmount: fromAssetBaseUnits(
      toAssetDescriptor,
      protectedQuote.platformFeeAmountBaseUnits,
    ),
    systemFeeAmountBaseUnits: protectedQuote.platformFeeAmountBaseUnits,
    sourceNetworkFee: sourcePreview.sourceNetworkFee,
    sourceNetworkFeeBaseUnits: sourcePreview.sourceNetworkFeeBaseUnits,
    payoutNetworkFeeEstimate:
      fromAssetBaseUnits(toAssetDescriptor, payoutNetworkFeeEstimateBaseUnits),
    payoutNetworkFeeEstimateBaseUnits,
    estimatedReceiveAmount: fromAssetBaseUnits(
      toAssetDescriptor,
      estimatedReceiveAmountBaseUnits,
    ),
    estimatedReceiveAmountBaseUnits,
    finalReceiveAmount: null,
    finalReceiveAmountBaseUnits: null,
    sourceSystemWalletAddress: sourceSystemWallet.address,
    destinationSystemWalletAddress: destinationSystemWallet.address,
    status: "previewed",
    quoteExpiresAt,
    failureReason: null,
    metadata: {
      routeId,
      conversionId,
      requestId: input.requestId || null,
      sourceWalletAddress: fromWallet.address,
      destinationWalletAddress: toWallet.address,
      pricing: pricingMetadata,
      routeProtection: {
        serviceFeeBps: routeProtection.serviceFeeBps,
        spreadBps: routeProtection.spreadBps,
        payoutFeeBufferBps: routeProtection.payoutFeeBufferBps,
        minimumProfitUsd: routeProtection.minimumProfitUsd,
        minSourceAmount: minimumSourceAmountRule.minimumSourceAmount,
        minSourceAmountBaseUnits:
          minimumSourceAmountRule.minimumSourceAmountBaseUnits,
      },
      sourceUsdEquivalent: formatScaledDecimal(sourceUsdBaseUnits.toString(), USD_SCALE),
      sourcePreview: {
        totalDebit: sourcePreview.totalDebit,
        totalDebitBaseUnits: sourcePreview.totalDebitBaseUnits,
        availableBalance: sourcePreview.availableBalance,
        availableBalanceBaseUnits: sourcePreview.availableBalanceBaseUnits,
        remainingBalance: sourcePreview.remainingBalance,
        remainingBalanceBaseUnits: sourcePreview.remainingBalanceBaseUnits,
        preparedTransaction: sourcePreview.preparedTransaction,
      },
      destinationReceive: {
        address: destinationReceive.address,
        executionParams: destinationReceive.executionParams || {},
        destinationTag: destinationReceive.destinationTag || null,
      },
      payoutPreview: {
        preparedTransaction: payoutPreview.preparedTransaction || null,
        actualNetworkFee: payoutPreview.networkFee || null,
        actualNetworkFeeBaseUnits: String(payoutPreview.networkFeeBaseUnits || "0"),
        bufferAmount: fromAssetBaseUnits(
          toAssetDescriptor,
          protectedQuote.payoutFeeBufferAmountBaseUnits,
        ),
        bufferAmountBaseUnits: protectedQuote.payoutFeeBufferAmountBaseUnits,
        bufferedNetworkFee: fromAssetBaseUnits(
          toAssetDescriptor,
          protectedQuote.bufferedPayoutNetworkFeeBaseUnits,
        ),
        bufferedNetworkFeeBaseUnits:
          protectedQuote.bufferedPayoutNetworkFeeBaseUnits,
        serviceFeeAmount: fromAssetBaseUnits(
          toAssetDescriptor,
          protectedQuote.serviceFeeAmountBaseUnits,
        ),
        serviceFeeAmountBaseUnits: protectedQuote.serviceFeeAmountBaseUnits,
        spreadFeeAmount: fromAssetBaseUnits(
          toAssetDescriptor,
          protectedQuote.spreadFeeAmountBaseUnits,
        ),
        spreadFeeAmountBaseUnits: protectedQuote.spreadFeeAmountBaseUnits,
        minimumProfitAmount: fromAssetBaseUnits(
          toAssetDescriptor,
          protectedQuote.minimumProfitBaseUnits,
        ),
        minimumProfitAmountBaseUnits: protectedQuote.minimumProfitBaseUnits,
      },
      accounts: {
        sourceAccountId: fromWallet.accountId ? String(fromWallet.accountId) : null,
        destinationAccountId: toWallet.accountId ? String(toWallet.accountId) : null,
      },
    },
  });

  return buildSwapResponse(
    typeof swapRecord.toObject === "function" ? swapRecord.toObject() : swapRecord,
  );
}

async function markSwapFailed(swap, reason, extra = {}) {
  const updates = extra && typeof extra === "object" ? { ...extra } : {};
  const nextStatus = String(updates.status || "failed").trim().toLowerCase() || "failed";
  delete updates.status;
  delete updates.failureCode;
  delete updates.failureContext;
  const failureCode = extra.failureCode || SWAP_FAILURE_CODES.SOURCE_SUBMISSION_FAILED;
  const failureContext =
    extra.failureContext && typeof extra.failureContext === "object"
      ? extra.failureContext
      : null;
  const metadata = buildFailureMetadata(extra.metadata || swap.metadata || {}, reason, failureCode, failureContext);

  logSwapEvent("warn", "Swap marked as failed", swap, {
    failureCode,
    reason,
  });

  return updateSwapRecord(swap, {
    ...updates,
    status: nextStatus,
    failureReason: reason,
    failureCode,
    metadata,
  });
}

function buildSwapManualReviewMetadata(existingMetadata = {}, reason, extra = {}) {
  const currentReview =
    existingMetadata?.manualReview &&
    typeof existingMetadata.manualReview === "object" &&
    !Array.isArray(existingMetadata.manualReview)
      ? existingMetadata.manualReview
      : {};

  return mergeMetadata(existingMetadata, {
    manualReview: {
      required: true,
      category: "swap_payout_failure",
      status: "open",
      action: "refund_or_retry",
      reason: reason || currentReview.reason || null,
      failureCode: extra.failureCode || currentReview.failureCode || null,
      sourceTransactionId:
        extra.sourceTransactionId || currentReview.sourceTransactionId || null,
      sourceTxHash: extra.sourceTxHash || currentReview.sourceTxHash || null,
      payoutTransactionId:
        extra.payoutTransactionId || currentReview.payoutTransactionId || null,
      payoutTxHash: extra.payoutTxHash || currentReview.payoutTxHash || null,
      createdAt: currentReview.createdAt || new Date(),
      updatedAt: new Date(),
    },
  });
}

async function markSwapPayoutFailed(swap, reason, extra = {}) {
  const reviewMetadata = buildSwapManualReviewMetadata(
    extra.metadata || swap.metadata || {},
    reason,
    {
      failureCode: extra.failureCode || null,
      sourceTransactionId: swap.sourceTransactionId
        ? String(swap.sourceTransactionId)
        : null,
      sourceTxHash: swap.sourceTxHash || null,
      payoutTransactionId: extra.payoutTransactionId || swap.payoutTransactionId || null,
      payoutTxHash: extra.payoutTxHash || swap.payoutTxHash || null,
    },
  );

  return markSwapFailed(swap, reason, {
    ...extra,
    status: "payout_failed",
    metadata: reviewMetadata,
  });
}

async function markSwapManualReview(swap, reason, extra = {}) {
  const updates = extra && typeof extra === "object" ? { ...extra } : {};
  delete updates.failureCode;
  delete updates.failureContext;
  const failureCode =
    extra.failureCode || SWAP_FAILURE_CODES.PAYOUT_SUBMISSION_UNCERTAIN;
  const failureContext =
    extra.failureContext && typeof extra.failureContext === "object"
      ? extra.failureContext
      : null;
  const metadata = buildFailureMetadata(extra.metadata || swap.metadata || {}, reason, failureCode, failureContext);

  logSwapEvent("warn", "Swap moved to manual review", swap, {
    failureCode,
    reason,
  });

  return updateSwapRecord(swap, {
    ...updates,
    status: "manual_review",
    failureReason: reason,
    failureCode,
    metadata,
  });
}

async function refreshSourceTransactionState(swap, options = {}) {
  if (!swap.sourceTransactionId) {
    return markSwapManualReview(
      swap,
      "Swap source transaction reference is missing",
      {
        failureCode: SWAP_FAILURE_CODES.SOURCE_TRANSACTION_MISSING,
      },
    );
  }

  let sourceTransaction;
  try {
    sourceTransaction = await transactionService.getTransactionById(
      options.userId,
      String(swap.sourceTransactionId),
    );
  } catch (error) {
    if (Number(error?.status || 0) === 404) {
      return markSwapManualReview(
        swap,
        "Swap source transaction could not be found during confirmation tracking",
        {
          failureCode: SWAP_FAILURE_CODES.SOURCE_TRANSACTION_NOT_FOUND,
          failureContext: {
            sourceTransactionId: String(swap.sourceTransactionId),
          },
        },
      );
    }

    throw error;
  }
  const metadata = mergeMetadata(swap.metadata || {}, {
    sourceTransaction: {
      transactionId: String(sourceTransaction._id || swap.sourceTransactionId),
      txHash: sourceTransaction.txHash || swap.sourceTxHash || null,
      status: sourceTransaction.status || swap.sourceTransactionStatus || null,
      chainStatus: sourceTransaction.chainStatus || swap.sourceChainStatus || null,
      confirmedAt: sourceTransaction.confirmedAt || null,
      updatedAt: new Date(),
    },
  });
  const updates = {
    metadata,
    sourceTxHash:
      normalizeTxHash(sourceTransaction.txHash || swap.sourceTxHash || "") || null,
    sourceTransactionStatus: sourceTransaction.status || swap.sourceTransactionStatus || null,
    sourceChainStatus: sourceTransaction.chainStatus || swap.sourceChainStatus || null,
    sourceNetworkFee:
      sourceTransaction.networkFee || swap.sourceNetworkFee,
    sourceNetworkFeeBaseUnits:
      sourceTransaction.networkFeeBaseUnits || swap.sourceNetworkFeeBaseUnits,
    sourceConfirmedAt: sourceTransaction.confirmedAt || swap.sourceConfirmedAt || null,
  };

  if (sourceTransaction.status === "success") {
    logSwapEvent("info", "Swap source transaction confirmed", swap, {
      sourceTransactionId: String(sourceTransaction._id || swap.sourceTransactionId),
      sourceTxHash: sourceTransaction.txHash || swap.sourceTxHash || null,
    });

    return updateSwapRecord(swap, {
      ...updates,
      status: "source_received",
      failureReason: null,
      failureCode: null,
      metadata: clearFailureMetadata(metadata),
    });
  }

  if (sourceTransaction.status === "failed") {
    return markSwapFailed(
      swap,
      sourceTransaction.errorMessage || "Source transfer failed",
      {
        ...updates,
        failureCode: SWAP_FAILURE_CODES.SOURCE_TRANSACTION_FAILED,
        failureContext: {
          sourceTransactionId: String(sourceTransaction._id || swap.sourceTransactionId),
          sourceTxHash: sourceTransaction.txHash || swap.sourceTxHash || null,
          chainStatus: sourceTransaction.chainStatus || null,
        },
      },
    );
  }

  return updateSwapRecord(swap, {
    ...updates,
    status: "awaiting_source_confirmation",
    failureReason: null,
    failureCode: null,
    metadata: clearFailureMetadata(metadata),
  });
}

async function submitSourceForSwap(swap, options = {}) {
  const metadata = mergeMetadata(swap.metadata || {}, {
    sourceSubmission: {
      lastAttemptAt: new Date(),
      requestId: options.requestId || null,
    },
  });

  logSwapEvent("info", "Starting swap source transaction submission", swap, {
    sourceWalletId: String(swap.fromWalletId || ""),
    destinationAddress: swap.sourceSystemWalletAddress,
  });

  let sourceTransaction;
  try {
    sourceTransaction = await transactionService.sendTransaction({
      userId: options.userId,
      walletId: String(swap.fromWalletId),
      destinationAddress: swap.sourceSystemWalletAddress,
      amount: swap.sourceAmount,
      asset: swap.fromAsset,
      executionParams: {},
      requestId: options.requestId,
      idempotencyKey: `swap:source:${String(swap._id)}`,
    });
  } catch (error) {
    return markSwapFailed(
      swap,
      `Source transfer submission failed: ${extractErrorMessage(error)}`,
      {
        failureCode: SWAP_FAILURE_CODES.SOURCE_SUBMISSION_FAILED,
        failureContext: {
          sourceWalletId: String(swap.fromWalletId || ""),
          destinationAddress: swap.sourceSystemWalletAddress,
        },
        metadata: mergeMetadata(metadata, {
          sourceTransaction: {
            failedAt: new Date(),
            reason: extractErrorMessage(error),
          },
        }),
      },
    );
  }

  const normalizedSourceTxHash =
    normalizeTxHash(sourceTransaction.txHash || "") || null;
  const nextStatus =
    sourceTransaction.status === "success"
      ? "source_received"
      : sourceTransaction.status === "failed"
        ? "failed"
        : "awaiting_source_confirmation";
  const updatedMetadata = mergeMetadata(metadata, {
    sourceTransaction: {
      transactionId: String(sourceTransaction._id),
      txHash: normalizedSourceTxHash,
      status: sourceTransaction.status || "pending",
      chainStatus: sourceTransaction.chainStatus || null,
      submittedAt: new Date(),
      confirmedAt: sourceTransaction.confirmedAt || null,
    },
  });

  logSwapEvent("info", "Swap source transaction submission finished", swap, {
    sourceTransactionId: String(sourceTransaction._id || ""),
    sourceTxHash: normalizedSourceTxHash,
    sourceTransactionStatus: sourceTransaction.status || "pending",
    chainStatus: sourceTransaction.chainStatus || null,
  });

  const updatedSwap = await updateSwapRecord(swap, {
    status: nextStatus,
    failureReason:
      sourceTransaction.status === "failed"
        ? sourceTransaction.errorMessage || "Source transfer failed"
        : null,
    failureCode:
      sourceTransaction.status === "failed"
        ? SWAP_FAILURE_CODES.SOURCE_TRANSACTION_FAILED
        : null,
    sourceTransactionId: sourceTransaction._id,
    sourceTxHash: normalizedSourceTxHash,
    sourceTransactionStatus: sourceTransaction.status || "pending",
    sourceChainStatus: sourceTransaction.chainStatus || null,
    sourceSubmittedAt: new Date(),
    sourceConfirmedAt: sourceTransaction.confirmedAt || null,
    sourceNetworkFee: sourceTransaction.networkFee || swap.sourceNetworkFee,
    sourceNetworkFeeBaseUnits:
      sourceTransaction.networkFeeBaseUnits || swap.sourceNetworkFeeBaseUnits,
    metadata:
      sourceTransaction.status === "failed"
        ? buildFailureMetadata(
            updatedMetadata,
            sourceTransaction.errorMessage || "Source transfer failed",
            SWAP_FAILURE_CODES.SOURCE_TRANSACTION_FAILED,
            {
              sourceTransactionId: String(sourceTransaction._id || ""),
              sourceTxHash: normalizedSourceTxHash,
              chainStatus: sourceTransaction.chainStatus || null,
            },
          )
        : clearFailureMetadata(updatedMetadata),
  });

  return updatedSwap;
}

function getPayoutSubmissionGuard(metadata = {}) {
  const guard =
    metadata?.payoutSubmissionGuard &&
    typeof metadata.payoutSubmissionGuard === "object" &&
    !Array.isArray(metadata.payoutSubmissionGuard)
      ? metadata.payoutSubmissionGuard
      : null;

  if (!guard) {
    return null;
  }

  return {
    attemptId: guard.attemptId ? String(guard.attemptId) : null,
    state: guard.state ? String(guard.state) : null,
    startedAt: normalizeDate(guard.startedAt),
    completedAt: normalizeDate(guard.completedAt),
  };
}

async function claimPayoutSubmissionGuard(swap) {
  const attemptId = crypto.randomUUID();
  const startedAt = new Date();
  const claimedSwap = await Swap.findOneAndUpdate(
    {
      _id: swap._id,
      userId: swap.userId,
      status: { $in: ["source_received", "ready_for_payout"] },
      payoutTxHash: null,
      "metadata.payoutSubmissionGuard.state": { $ne: "submitting" },
    },
    {
      $set: {
        "metadata.payoutSubmissionGuard": {
          attemptId,
          state: "submitting",
          startedAt,
          completedAt: null,
        },
      },
    },
    { new: true },
  ).lean();

  if (!claimedSwap) {
    return null;
  }

  return {
    swap: claimedSwap,
    attemptId,
    startedAt,
  };
}

async function submitPayoutForSwap(swap, options = {}) {
  const existingGuard = getPayoutSubmissionGuard(swap.metadata || {});
  if (
    existingGuard?.state === "submitting" &&
    !swap.payoutTxHash
  ) {
    const elapsedMs = getElapsedMsSince(existingGuard.startedAt);

    if (elapsedMs !== null && elapsedMs < PAYOUT_SUBMISSION_STALE_WINDOW_MS) {
      logSwapEvent("info", "Swap payout submission already in progress", swap, {
        attemptId: existingGuard.attemptId,
        elapsedMs,
      });
      return swap;
    }

    return markSwapManualReview(
      swap,
      "Previous payout submission attempt did not finish safely; manual review is required to avoid duplicate payout",
      {
        failureCode: SWAP_FAILURE_CODES.PAYOUT_SUBMISSION_UNCERTAIN,
        failureContext: {
          attemptId: existingGuard?.attemptId || null,
          startedAt: existingGuard?.startedAt || null,
        },
        metadata: mergeMetadata(swap.metadata || {}, {
          payoutSubmissionGuard: {
            attemptId: existingGuard?.attemptId || null,
            state: "stale",
            startedAt: existingGuard?.startedAt || null,
            completedAt: new Date(),
          },
        }),
      },
    );
  }

  let toWallet;
  let toAssetDescriptor;
  let destinationSystemWallet;
  const routeProtection = swapConfig.getRouteProtectionConfig({
    routeId: swap.routeId,
  });

  try {
    toWallet = await transactionService.getWalletOrFail(
      options.userId,
      String(swap.toWalletId),
    );
    toAssetDescriptor = buildNativeAssetDescriptor(toWallet.chain, toWallet.network);
    assertNativeWallet(
      toWallet,
      toAssetDescriptor,
      "Destination wallet must use a native asset",
    );
    destinationSystemWallet = await resolveValidatedSwapSystemWalletConfig({
      chain: toWallet.chain,
      network: toWallet.network,
      asset: toAssetDescriptor.asset,
    });
  } catch (error) {
    return markSwapPayoutFailed(swap, SWAP_USER_MESSAGES.SWAP_FAILED, {
      failureCode: SWAP_FAILURE_CODES.DESTINATION_CONFIG_INVALID,
      failureContext: {
        internalReason: extractErrorMessage(error),
      },
      metadata: mergeMetadata(swap.metadata || {}, {
        payoutProcessing: {
          failedAt: new Date(),
          reason: extractErrorMessage(error),
        },
      }),
    });
  }

  let destinationReceive;
  let payoutQuote;
  let liveBalance;

  try {
    destinationReceive = await resolveDestinationReceivePayload(
      options.userId,
      toWallet,
      toAssetDescriptor,
    );
    payoutQuote = await estimateDestinationPayoutQuote({
      destinationWallet: toWallet,
      destinationAssetDescriptor: toAssetDescriptor,
      destinationSystemWallet,
      amount: swap.estimatedReceiveAmount,
      destinationAddress: destinationReceive.address,
      executionParams: destinationReceive.executionParams,
    });
    liveBalance = await readLiveSwapSystemBalance({
      userId: options.userId,
      chain: toWallet.chain,
      network: toWallet.network,
      address: destinationSystemWallet.address,
      requestId: options.requestId,
    });
  } catch (error) {
    return markSwapPayoutFailed(swap, SWAP_USER_MESSAGES.SWAP_FAILED, {
      failureCode: SWAP_FAILURE_CODES.PAYOUT_PREPARATION_FAILED,
      failureContext: {
        internalReason: `Destination payout preparation failed: ${extractErrorMessage(error)}`,
      },
      metadata: mergeMetadata(swap.metadata || {}, {
        payoutProcessing: {
          failedAt: new Date(),
          reason: extractErrorMessage(error),
        },
      }),
    });
  }

  const payoutNetworkFeeBaseUnits = String(
    payoutQuote.networkFeeBaseUnits || "0",
  );
  const minimumProfitBaseUnits = buildMinimumProfitBaseUnits({
    minimumProfitUsd: routeProtection.minimumProfitUsd,
    destinationPriceScaled: parseDecimalToScaledInt(
      swap.destinationPriceUsd,
      PRICE_SCALE,
    ),
    destinationDecimals: toAssetDescriptor.decimals,
  });
  const platformFeeAmountBaseUnits = String(
    swap.systemFeeAmountBaseUnits || "0",
  );

  if (
    BigInt(payoutNetworkFeeBaseUnits) >=
    BigInt(String(swap.grossDestinationAmountBaseUnits || "0"))
  ) {
    return markSwapPayoutFailed(swap, SWAP_USER_MESSAGES.SWAP_FAILED, {
      failureCode: SWAP_FAILURE_CODES.PAYOUT_PREPARATION_FAILED,
      failureContext: {
        internalReason:
          "Destination payout network fee exceeded the gross destination amount",
      },
      metadata: mergeMetadata(swap.metadata || {}, {
        payoutProcessing: {
          failedAt: new Date(),
          reason: "Live payout fee exceeded the gross destination amount",
        },
      }),
    });
  }

  if (
    BigInt(platformFeeAmountBaseUnits) <
    BigInt(payoutNetworkFeeBaseUnits) + BigInt(minimumProfitBaseUnits)
  ) {
    return markSwapPayoutFailed(swap, SWAP_USER_MESSAGES.SWAP_FAILED, {
      failureCode: SWAP_FAILURE_CODES.PAYOUT_PREPARATION_FAILED,
      failureContext: {
        internalReason:
          "Live payout fee no longer preserves the required minimum profit",
      },
      metadata: mergeMetadata(swap.metadata || {}, {
        payoutProcessing: {
          failedAt: new Date(),
          reason: "Live payout fee exceeded the protected profit envelope",
        },
      }),
    });
  }

  const liquidityMetadata = buildPayoutLiquidityEvaluation({
    assetDescriptor: toAssetDescriptor,
    systemWalletConfig: destinationSystemWallet,
    liveBalance,
    payoutAmountBaseUnits: swap.estimatedReceiveAmountBaseUnits,
    payoutNetworkFeeBaseUnits,
  });

  if (!liquidityMetadata.isSufficient) {
    logSwapEvent("warn", "Swap payout blocked because of insufficient liquidity", swap, {
      availableAfterReserveBaseUnits: liquidityMetadata.availableAfterReserveBaseUnits,
      requiredLiquidityBaseUnits: liquidityMetadata.requiredLiquidityBaseUnits,
    });
    return markSwapPayoutFailed(swap, SWAP_USER_MESSAGES.SWAP_FAILED, {
      failureCode: SWAP_FAILURE_CODES.DESTINATION_LIQUIDITY_INSUFFICIENT,
      failureContext: {
        ...liquidityMetadata,
        internalReason:
          "Destination swap system wallet does not have enough live liquidity to cover the payout and reserve requirements",
      },
      payoutNetworkFeeEstimate: payoutQuote.networkFee,
      payoutNetworkFeeEstimateBaseUnits: payoutNetworkFeeBaseUnits,
      metadata: mergeMetadata(swap.metadata || {}, {
        destinationReceive: {
          address: destinationReceive.address,
          executionParams: destinationReceive.executionParams || {},
          destinationTag: destinationReceive.destinationTag || null,
        },
        payoutLiquidity: liquidityMetadata,
      }),
    });
  }

  const context = assertChainFeature(toWallet.chain, toWallet.network, "send");
  const payoutClaim = await claimPayoutSubmissionGuard(swap);
  if (!payoutClaim) {
    const latestSwap = await getOwnedSwapOrFail(options.userId, swap._id);
    return latestSwap;
  }

  swap = payoutClaim.swap;
  const payoutGuardMetadata = mergeMetadata(swap.metadata || {}, {
    payoutSubmissionGuard: {
      attemptId: payoutClaim.attemptId,
      state: "submitting",
      startedAt: payoutClaim.startedAt,
      completedAt: null,
    },
  });

  logSwapEvent("info", "Submitting swap payout", swap, {
    attemptId: payoutClaim.attemptId,
    destinationAddress: payoutQuote.destinationAddress,
  });

  let submission;

  try {
    submission = await context.adapter.transaction.executeTransfer({
      network: toWallet.network,
      mnemonic: destinationSystemWallet.secret,
      secret: destinationSystemWallet.secret,
      fromAddress: destinationSystemWallet.address,
      toAddress: payoutQuote.destinationAddress,
      amount: swap.estimatedReceiveAmount,
      executionParams: payoutQuote.executionParams,
      asset: toAssetDescriptor.asset,
      assetDescriptor: toAssetDescriptor,
    });
  } catch (error) {
    return markSwapManualReview(
      swap,
      `Destination payout submission failed: ${extractErrorMessage(error)}`,
      {
        failureCode: SWAP_FAILURE_CODES.PAYOUT_SUBMISSION_FAILED,
        payoutNetworkFeeEstimate: payoutQuote.networkFee,
        payoutNetworkFeeEstimateBaseUnits: payoutNetworkFeeBaseUnits,
        metadata: mergeMetadata(payoutGuardMetadata, {
          destinationReceive: {
            address: destinationReceive.address,
            executionParams: destinationReceive.executionParams || {},
            destinationTag: destinationReceive.destinationTag || null,
          },
          payoutLiquidity: liquidityMetadata,
          payoutSubmission: {
            failedAt: new Date(),
            reason: extractErrorMessage(error),
          },
          payoutSubmissionGuard: {
            attemptId: payoutClaim.attemptId,
            state: "failed",
            startedAt: payoutClaim.startedAt,
            completedAt: new Date(),
          },
        }),
      },
    );
  }

  const payoutStatus = getTransferExecutionStatus(submission, {
    chain: toWallet.chain,
  });
  const acceptedPendingSubmission = isAcceptedPendingSubmission(submission, {
    chain: toWallet.chain,
  });
  const normalizedPayoutTxHash =
    normalizeTxHash(submission.txHash || submission.transactionId || "") || null;
  const metadata = mergeMetadata(payoutGuardMetadata, {
    destinationReceive: {
      address: destinationReceive.address,
      executionParams: destinationReceive.executionParams || {},
      destinationTag: destinationReceive.destinationTag || null,
    },
    payoutLiquidity: liquidityMetadata,
    payoutSubmission: {
      attemptedAt: new Date(),
      txHash: normalizedPayoutTxHash,
      transactionId: submission.transactionId || null,
      chainStatus: submission.chainStatus || null,
      status: payoutStatus,
      rawRequest: submission.rawRequest || null,
      rawResponse: submission.rawResponse || null,
    },
    payoutSubmissionGuard: {
      attemptId: payoutClaim.attemptId,
      state: payoutStatus === "success" ? "completed" : acceptedPendingSubmission ? "submitted" : "failed",
      startedAt: payoutClaim.startedAt,
      completedAt: new Date(),
    },
  });
  const updates = {
    metadata,
    payoutNetworkFeeEstimate: payoutQuote.networkFee,
    payoutNetworkFeeEstimateBaseUnits: payoutNetworkFeeBaseUnits,
    payoutNetworkFee: submission.networkFee || payoutQuote.networkFee,
    payoutNetworkFeeBaseUnits:
      submission.networkFeeBaseUnits || payoutNetworkFeeBaseUnits,
    payoutTransactionId:
      submission.transactionId || normalizedPayoutTxHash || swap.payoutTransactionId || null,
    payoutTxHash: normalizedPayoutTxHash || swap.payoutTxHash || null,
    payoutTransactionStatus: payoutStatus,
    payoutChainStatus: submission.chainStatus || null,
    payoutSubmittedAt: new Date(),
    payoutConfirmedAt: submission.confirmedAt || null,
    finalReceiveAmount:
      payoutStatus === "success" || acceptedPendingSubmission
        ? swap.estimatedReceiveAmount
        : swap.finalReceiveAmount || null,
    finalReceiveAmountBaseUnits:
      payoutStatus === "success" || acceptedPendingSubmission
        ? swap.estimatedReceiveAmountBaseUnits
        : swap.finalReceiveAmountBaseUnits || null,
  };

  if (payoutStatus === "success") {
    logSwapEvent("info", "Swap payout completed immediately", swap, {
      payoutTxHash: normalizedPayoutTxHash,
      attemptId: payoutClaim.attemptId,
    });
    return updateSwapRecord(swap, {
      ...updates,
      status: "completed",
      failureReason: null,
      failureCode: null,
      metadata: clearFailureMetadata(metadata),
    });
  }

  if (acceptedPendingSubmission) {
    logSwapEvent("info", "Swap payout submitted and awaiting confirmation", swap, {
      payoutTxHash: normalizedPayoutTxHash,
      attemptId: payoutClaim.attemptId,
    });
    return updateSwapRecord(swap, {
      ...updates,
      status: "payout_submitted",
      failureReason: null,
      failureCode: null,
      metadata: clearFailureMetadata(metadata),
    });
  }

  return markSwapPayoutFailed(
    swap,
    SWAP_USER_MESSAGES.SWAP_FAILED,
    {
      ...updates,
      failureCode: SWAP_FAILURE_CODES.PAYOUT_CHAIN_REJECTED,
      failureContext: {
        payoutTxHash: normalizedPayoutTxHash,
        chainStatus: submission.chainStatus || null,
        attemptId: payoutClaim.attemptId,
        internalReason: `Destination payout was rejected by the chain with status "${submission.chainStatus || "failed"}"`,
      },
    },
  );
}

async function resolveManagedTransactionOnChain({
  chain,
  network,
  walletAddress,
  txHash,
}) {
  const normalizedTargetHash = normalizeTxHash(txHash);
  if (!normalizedTargetHash) {
    return null;
  }

  let context;
  try {
    context = assertChainFeature(chain, network, "history");
  } catch (_error) {
    return null;
  }
  const mapper = context?.adapter?.mapper?.mapTransaction;
  if (typeof mapper !== "function") {
    return null;
  }

  const fetchTransaction = context?.adapter?.transaction?.fetchTransaction;
  if (typeof fetchTransaction === "function") {
    try {
      const directEntry = await fetchTransaction({
        network,
        txHash: normalizedTargetHash,
        transactionId: normalizedTargetHash,
        allowNotFound: true,
      });

      if (directEntry) {
        const mapped = mapper(directEntry, walletAddress);
        const mappedHash = normalizeTxHash(
          mapped?.txHash || mapped?.transactionId || normalizedTargetHash,
        );
        if (mapped && mappedHash === normalizedTargetHash) {
          return mapped;
        }
      }
    } catch (error) {
      logger.warn("Managed swap transaction direct status lookup failed", {
        chain,
        network,
        txHash: normalizedTargetHash,
        error: extractErrorMessage(error),
      });
    }
  }

  const fetchHistory = context?.adapter?.transaction?.fetchHistory;
  if (typeof fetchHistory !== "function") {
    return null;
  }

  try {
    const entries = await fetchHistory({
      network,
      address: walletAddress,
      limit: 25,
    });

    for (const entry of Array.isArray(entries) ? entries : []) {
      const mapped = mapper(entry, walletAddress);
      if (!mapped) {
        continue;
      }

      const mappedHash = normalizeTxHash(
        mapped.txHash || mapped.transactionId || entry?.txHash || entry?.hash || "",
      );
      if (mappedHash === normalizedTargetHash) {
        return mapped;
      }
    }
  } catch (error) {
    logger.warn("Managed swap transaction history status lookup failed", {
      chain,
      network,
      txHash: normalizedTargetHash,
      address: walletAddress,
      error: extractErrorMessage(error),
    });
  }

  return null;
}

async function refreshPayoutTransactionState(swap) {
  if (!swap.payoutTxHash) {
    return markSwapManualReview(
      swap,
      "Swap payout transaction hash is missing",
      {
        failureCode: SWAP_FAILURE_CODES.PAYOUT_TRANSACTION_MISSING,
      },
    );
  }

  const mapped = await resolveManagedTransactionOnChain({
    chain: swap.toChain,
    network: swap.toNetwork,
    walletAddress: swap.destinationSystemWalletAddress,
    txHash: swap.payoutTxHash,
  });

  if (!mapped) {
    return swap;
  }

  const payoutStatus = getTransferExecutionStatus(mapped, {
    chain: swap.toChain,
  });
  const metadata = mergeMetadata(swap.metadata || {}, {
    payoutTracking: {
      checkedAt: new Date(),
      txHash: normalizeTxHash(mapped.txHash || swap.payoutTxHash || "") || swap.payoutTxHash,
      status: payoutStatus,
      chainStatus: mapped.chainStatus || null,
      rawResponse: mapped.rawResponse || null,
    },
  });
  const updates = {
    metadata,
    payoutTxHash:
      normalizeTxHash(mapped.txHash || swap.payoutTxHash || "") || swap.payoutTxHash,
    payoutTransactionStatus: payoutStatus,
    payoutChainStatus: mapped.chainStatus || swap.payoutChainStatus || null,
    payoutNetworkFee:
      mapped.networkFee || swap.payoutNetworkFee || swap.payoutNetworkFeeEstimate,
    payoutNetworkFeeBaseUnits:
      mapped.networkFeeBaseUnits ||
      swap.payoutNetworkFeeBaseUnits ||
      swap.payoutNetworkFeeEstimateBaseUnits,
    payoutConfirmedAt: mapped.confirmedAt || swap.payoutConfirmedAt || null,
    finalReceiveAmount:
      payoutStatus === "success" || swap.finalReceiveAmount
        ? swap.estimatedReceiveAmount
        : null,
    finalReceiveAmountBaseUnits:
      payoutStatus === "success" || swap.finalReceiveAmountBaseUnits
        ? swap.estimatedReceiveAmountBaseUnits
        : null,
  };

  if (payoutStatus === "success") {
    logSwapEvent("info", "Swap payout confirmed on-chain", swap, {
      payoutTxHash:
        normalizeTxHash(mapped.txHash || swap.payoutTxHash || "") || swap.payoutTxHash,
    });
    return updateSwapRecord(swap, {
      ...updates,
      status: "completed",
      failureReason: null,
      failureCode: null,
      metadata: clearFailureMetadata(metadata),
    });
  }

  if (mapped.validated || payoutStatus === "failed") {
    return markSwapPayoutFailed(
      swap,
      SWAP_USER_MESSAGES.SWAP_FAILED,
      {
        ...updates,
        failureCode: SWAP_FAILURE_CODES.PAYOUT_CHAIN_REJECTED,
        failureContext: {
          payoutTxHash:
            normalizeTxHash(mapped.txHash || swap.payoutTxHash || "") || swap.payoutTxHash,
          chainStatus: mapped.chainStatus || null,
          internalReason: `Destination payout failed on-chain with status "${mapped.chainStatus || "failed"}"`,
        },
      },
    );
  }

  return updateSwapRecord(swap, {
    ...updates,
    status: "payout_submitted",
    failureReason: null,
    failureCode: null,
    metadata: clearFailureMetadata(metadata),
  });
}

async function refreshSwapProgress(swap, options = {}) {
  let current = swap;

  if (current.status === "previewed") {
    current = await expirePreviewedSwapIfNeeded(current);
  }

  if (current.status === "awaiting_source_submission") {
    current = current.sourceTransactionId
      ? await refreshSourceTransactionState(current, options)
      : await submitSourceForSwap(current, options);
  }

  if (current.status === "awaiting_source_confirmation") {
    current = await refreshSourceTransactionState(current, options);
  }

  if (current.status === "source_received" || current.status === "ready_for_payout") {
    current = current.payoutTxHash
      ? await refreshPayoutTransactionState(current, options)
      : await submitPayoutForSwap(current, options);
  }

  if (current.status === "payout_submitted") {
    current = await refreshPayoutTransactionState(current, options);
  }

  return current;
}

function buildSwapOperationIdentity(userId, swapId) {
  return {
    userId: String(userId || ""),
    swapId: String(swapId || ""),
  };
}

async function reviewSwap(input = {}) {
  return atomicityService.withLock(
    {
      scope: "swap_flow",
      identity: buildSwapOperationIdentity(input.userId, input.swapId),
      ttlMs: atomicityService.DEFAULT_OPERATION_LOCK_TTL_MS,
      busyMessage: "This swap is already being processed",
      logContext: {
        userId: String(input.userId || ""),
        swapId: String(input.swapId || ""),
      },
      onBusy: async () =>
        buildSwapResponse(await getOwnedSwapOrFail(input.userId, input.swapId)),
    },
    async () => {
      const swap = await getOwnedSwapOrFail(input.userId, input.swapId);
      const validatedSwap = await validatePreviewedSwapOrThrow(swap, {
        userId: input.userId,
        requestId: input.requestId,
      });

      return buildSwapResponse(validatedSwap);
    },
  );
}

async function executeSwap(input = {}) {
  return atomicityService.withLock(
    {
      scope: "swap_flow",
      identity: buildSwapOperationIdentity(input.userId, input.swapId),
      ttlMs: atomicityService.DEFAULT_OPERATION_LOCK_TTL_MS,
      busyMessage: "This swap is already being processed",
      logContext: {
        userId: String(input.userId || ""),
        swapId: String(input.swapId || ""),
      },
      onBusy: async () =>
        buildSwapResponse(await getOwnedSwapOrFail(input.userId, input.swapId)),
    },
    async () => {
      let swap = await getOwnedSwapOrFail(input.userId, input.swapId);
      swap = await expirePreviewedSwapIfNeeded(swap);

      logSwapEvent("info", "Processing swap execute request", swap, {
        requestId: input.requestId || null,
      });

      if (swap.status !== "previewed") {
        const refreshed = await refreshSwapProgress(swap, {
          userId: input.userId,
          requestId: input.requestId,
        });
        return buildSwapResponse(refreshed);
      }

      swap = await validatePreviewedSwapOrThrow(swap, {
        userId: input.userId,
        requestId: input.requestId,
      });

      const transitioned = await Swap.findOneAndUpdate(
        {
          _id: swap._id,
          userId: input.userId,
          status: "previewed",
          quoteExpiresAt: { $gt: new Date() },
        },
        {
          $set: {
            status: "awaiting_source_submission",
            failureReason: null,
          },
        },
        { new: true },
      ).lean();

      if (!transitioned) {
        swap = await getOwnedSwapOrFail(input.userId, input.swapId);
        const refreshed = await refreshSwapProgress(swap, {
          userId: input.userId,
          requestId: input.requestId,
        });
        return buildSwapResponse(refreshed);
      }

      swap = transitioned;
      swap = await submitSourceForSwap(swap, {
        userId: input.userId,
        requestId: input.requestId,
      });

      swap = await refreshSwapProgress(swap, {
        userId: input.userId,
        requestId: input.requestId,
      });

      return buildSwapResponse(swap);
    },
  );
}

async function getSwapById(userId, swapId, options = {}) {
  if (options.refresh === false) {
    return buildSwapResponse(await getOwnedSwapOrFail(userId, swapId));
  }

  return atomicityService.withLock(
    {
      scope: "swap_flow",
      identity: buildSwapOperationIdentity(userId, swapId),
      ttlMs: atomicityService.DEFAULT_OPERATION_LOCK_TTL_MS,
      busyMessage: "This swap is already being processed",
      logContext: {
        userId: String(userId || ""),
        swapId: String(swapId || ""),
      },
      onBusy: async () =>
        buildSwapResponse(await getOwnedSwapOrFail(userId, swapId)),
    },
    async () => {
      let swap = await getOwnedSwapOrFail(userId, swapId);
      swap = await refreshSwapProgress(swap, {
        userId,
        requestId: options.requestId,
      });
      return buildSwapResponse(swap);
    },
  );
}

async function getSwapHistory(userId, query = {}) {
  const Swap = require("./model");
  const logger = require("../../common/utils/logger");

  try {
    // Build filter for user's swaps
    const filter = { userId };
    const andClauses = [];

    if (query.status) {
      filter.status = query.status;
    }
    if (query.startDate || query.endDate) {
      const timestampRange = {
        ...(query.startDate ? { $gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { $lte: new Date(query.endDate) } : {}),
      };
      andClauses.push({
        $or: [
          { createdAt: timestampRange },
          { updatedAt: timestampRange },
        ],
      });
    }
    if (andClauses.length) {
      filter.$and = andClauses;
    }

    // Pagination
    const MAX_PAGE_LIMIT = 50;
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(query.limit, 10) || 20, 1),
      MAX_PAGE_LIMIT,
    );
    const skip = (page - 1) * limit;

    // Get swaps and total count
    const [swaps, total] = await Promise.all([
      Swap.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Swap.countDocuments(filter),
    ]);

    const normalizedSwaps = swaps.map((swap) => {
      const sourceAmount = swap.sourceAmount || "0";
      const destinationAmount =
        swap.finalReceiveAmount || swap.estimatedReceiveAmount || "0";
      const sourceTxHash = swap.sourceTxHash || "";
      const payoutTxHash = swap.payoutTxHash || "";

      return {
        id: swap.swapId || swap._id.toString(),
        type: "swap",
        transactionType: "swap",
        direction: "swap",
        isSwap: true,
        isNft: false,
        nft: null,
        swapId: swap.swapId || swap._id.toString(),
        conversionId: swap.conversionId || null,
        fromAsset: swap.fromAsset,
        toAsset: swap.toAsset,
        fromAmount: sourceAmount,
        toAmount: destinationAmount,
        sourceAmount,
        sourceAmountBaseUnits: swap.sourceAmountBaseUnits || "0",
        destinationAmount,
        destinationAmountBaseUnits:
          swap.finalReceiveAmountBaseUnits ||
          swap.estimatedReceiveAmountBaseUnits ||
          "0",
        estimatedReceiveAmount: swap.estimatedReceiveAmount || "0",
        estimatedReceiveAmountBaseUnits:
          swap.estimatedReceiveAmountBaseUnits || "0",
        finalReceiveAmount: swap.finalReceiveAmount || null,
        finalReceiveAmountBaseUnits: swap.finalReceiveAmountBaseUnits || null,
        amount: destinationAmount,
        amountBaseUnits:
          swap.finalReceiveAmountBaseUnits ||
          swap.estimatedReceiveAmountBaseUnits ||
          "0",
        asset: swap.toAsset,
        symbol: swap.toAsset,
        currency: swap.toAsset,
        status: swap.status,
        succeeded: swap.status === "completed",
        validated: ["completed", "failed", "payout_failed", "manual_review", "expired"].includes(swap.status),
        chainStatus: swap.status,
        createdAt: swap.createdAt,
        updatedAt: swap.updatedAt,
        displayTimestamp: swap.createdAt,
        dateTimeLabel: swap.createdAt ? new Date(swap.createdAt).toLocaleDateString() : "Date unavailable",
        sourceChain: swap.fromChain,
        destinationChain: swap.toChain,
        sourceNetwork: swap.fromNetwork,
        destinationNetwork: swap.toNetwork,
        sourceTxHash,
        payoutTxHash,
        sourceExplorerUrl: buildTransactionExplorerUrl(
          swap.fromChain,
          swap.fromNetwork,
          sourceTxHash,
        ),
        payoutExplorerUrl: buildTransactionExplorerUrl(
          swap.toChain,
          swap.toNetwork,
          payoutTxHash,
        ),
        sourceNetworkFee: swap.sourceNetworkFee || "0",
        sourceNetworkFeeBaseUnits: swap.sourceNetworkFeeBaseUnits || "0",
        payoutNetworkFee: swap.payoutNetworkFee || swap.payoutNetworkFeeEstimate || "0",
        payoutNetworkFeeBaseUnits:
          swap.payoutNetworkFeeBaseUnits ||
          swap.payoutNetworkFeeEstimateBaseUnits ||
          "0",
        payoutNetworkFeeEstimate: swap.payoutNetworkFeeEstimate || "0",
        payoutNetworkFeeEstimateBaseUnits:
          swap.payoutNetworkFeeEstimateBaseUnits || "0",
        systemFeeAmount: swap.systemFeeAmount || "0",
        systemFeeAmountBaseUnits: swap.systemFeeAmountBaseUnits || "0",
        failureReason: swap.failureReason,
        failureCode: swap.failureCode || null,
        metadata: {
          ...(swap.metadata && typeof swap.metadata === "object" && !Array.isArray(swap.metadata)
            ? swap.metadata
            : {}),
          swap: {
            swapId: swap.swapId || swap._id.toString(),
            sourceAmount,
            sourceAmountBaseUnits: swap.sourceAmountBaseUnits || "0",
            estimatedReceiveAmount: swap.estimatedReceiveAmount || "0",
            estimatedReceiveAmountBaseUnits:
              swap.estimatedReceiveAmountBaseUnits || "0",
            finalReceiveAmount: swap.finalReceiveAmount || null,
            finalReceiveAmountBaseUnits: swap.finalReceiveAmountBaseUnits || null,
            sourceAsset: swap.fromAsset,
            destinationAsset: swap.toAsset,
            sourceChain: swap.fromChain,
            sourceNetwork: swap.fromNetwork,
            destinationChain: swap.toChain,
            destinationNetwork: swap.toNetwork,
            sourceTxHash,
            payoutTxHash,
            sourceNetworkFee: swap.sourceNetworkFee || "0",
            payoutNetworkFee:
              swap.payoutNetworkFee || swap.payoutNetworkFeeEstimate || "0",
            systemFeeAmount: swap.systemFeeAmount || "0",
            status: swap.status,
          },
        },
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: normalizedSwaps,
      meta: { page, limit, total, totalPages },
    };
  } catch (error) {
    logger.error("Failed to fetch swap history", {
      userId: String(userId),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

module.exports = {
  getSupportedPairs,
  previewSwap,
  reviewSwap,
  executeSwap,
  getSwapById,
  getSwapHistory,
  __testables: {
    assertPayoutLiquidityOrThrow,
    assertMinimumSwapQuoteOrThrow,
    buildBufferedFeeBaseUnits,
    buildSupportedPairsFromDiagnostics,
    buildMinimumProfitBaseUnits,
    buildProfitProtectedQuote,
    buildProfitProtectedQuoteFromGross,
    buildSourceAmountForDestinationBaseUnitMinimum,
    buildSourceAmountForUsdEquivalentBaseUnits,
    buildPayoutLiquidityEvaluation,
    calculateMinimumSwapQuote,
    findMinimumSourceAmountForProtectedQuote,
    buildSafeSwapFailureReason,
    getTransferExecutionStatus,
    isAcceptedPendingSubmission,
  },
};
