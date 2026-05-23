const { AppError } = require("../helpers/errors");
const {
  getConfiguredChainConfig,
  getConfiguredNetworkConfig,
} = require("./chains");
const { getConfiguredTokenConfig } = require("./tokens");

const PLACEHOLDER_VALUE_PATTERN =
  /(change[-_ ]?me|replace[-_ ]?with|your[_-]|example\.com|your_key_here|placeholder|dummy)/i;
const CHAIN_NETWORK_KEY_PATTERN = /^([a-z0-9_-]+):([a-z0-9_-]+)$/i;
const SWAP_ROUTE_KEY_PATTERN =
  /^([a-z0-9_-]+):([a-z0-9_-]+):([a-z0-9._-]+)->([a-z0-9_-]+):([a-z0-9_-]+):([a-z0-9._-]+)$/i;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

function normalizeChainCode(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeNetworkCode(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAssetCode(value) {
  return String(value || "").trim().toUpperCase();
}

function trimDecimalString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return fallback;
  }

  const [wholePartRaw, fractionPartRaw = ""] = normalized.split(".");
  const wholePart = wholePartRaw.replace(/^0+(?=\d)/, "") || "0";
  const fractionPart = fractionPartRaw.replace(/0+$/, "");

  return fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
}

function isNonNegativeDecimalString(value) {
  return /^\d+(\.\d+)?$/.test(String(value || "").trim());
}

function decimalStringToComparableInt(value, scale = 12) {
  const normalized = trimDecimalString(value, "0");
  const [wholePart, fractionPart = ""] = normalized.split(".");
  return BigInt(
    `${wholePart}${fractionPart.padEnd(scale, "0").slice(0, scale)}`.replace(/^0+(?=\d)/, "") || "0",
  );
}

function normalizeChainNetworkKey(input) {
  const match = CHAIN_NETWORK_KEY_PATTERN.exec(String(input || "").trim());
  if (!match) {
    return "";
  }

  const rawChain = normalizeChainCode(match[1]);
  const chainConfig = getConfiguredChainConfig(rawChain);
  const chain = chainConfig?.code || rawChain;
  const network = normalizeNetworkCode(match[2]);

  return `${chain}:${network}`;
}

function getSupportedNativeSwapTreasuryEndpoints() {
  const {
    getChainFeatures,
    getChainToggles,
    listImplementedChainContexts,
  } = require("../common/utils/chain");
  const { buildNativeAssetDescriptor } = require("../common/utils/assets");

  return listImplementedChainContexts()
    .flatMap((context) =>
      context.supportedNetworks.map((network) => {
        const features = getChainFeatures(context.chain, network.code) || {};
        const toggles = getChainToggles(context.chain, network.code) || {};

        if (
          toggles.enabled === false ||
          toggles.maintenance === true ||
          features.send !== true ||
          features.receive !== true
        ) {
          return null;
        }

        const nativeAsset = buildNativeAssetDescriptor(
          context.chain,
          network.code,
        );

        return {
          key: `${context.chain}:${network.code}`,
          chain: context.chain,
          network: network.code,
          chainLabel: context.label || context.chain,
          networkLabel: network.label || network.code,
          asset: nativeAsset.asset,
          symbol: nativeAsset.symbol,
          decimals: nativeAsset.decimals,
        };
      }),
    )
    .filter(Boolean)
    .sort((left, right) => left.key.localeCompare(right.key));
}

function getSupportedNativeSwapTreasuryEndpoint(input = {}) {
  const key = normalizeChainNetworkKey(`${input.chain}:${input.network}`);
  return (
    getSupportedNativeSwapTreasuryEndpoints().find(
      (endpoint) => endpoint.key === key,
    ) || null
  );
}

function formatSupportedNativeSwapTreasuryEndpoints() {
  return getSupportedNativeSwapTreasuryEndpoints()
    .map((endpoint) => `${endpoint.key} (${endpoint.asset})`)
    .join(", ");
}

function safeParseObject(value) {
  if (!String(value || "").trim()) {
    return { value: {}, error: null };
  }

  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        value: {},
        error: "must be a valid JSON object",
      };
    }

    return {
      value: parsed,
      error: null,
    };
  } catch (_error) {
    return {
      value: {},
      error: "must be valid JSON",
    };
  }
}

function getPreviewTtlSeconds() {
  return Number(process.env.SWAP_PREVIEW_TTL_SECONDS || 60);
}

function getServiceFeeBps() {
  return Number(process.env.SWAP_SERVICE_FEE_BPS || 100);
}

function getSpreadBps() {
  return Number(process.env.SWAP_SPREAD_BPS || 0);
}

function getPayoutFeeBufferBps() {
  return Number(process.env.SWAP_PAYOUT_FEE_BUFFER_BPS || 0);
}

function getMinimumProfitUsd() {
  return trimDecimalString(process.env.SWAP_MIN_PROFIT_USD || "0", "0");
}

function getMinUsdEquivalent() {
  return trimDecimalString(process.env.SWAP_MIN_USD_EQUIVALENT || "1", "1");
}

function getMaxUsdEquivalent() {
  return trimDecimalString(process.env.SWAP_MAX_USD_EQUIVALENT || "5000", "5000");
}

function normalizeRouteId(input) {
  const match = SWAP_ROUTE_KEY_PATTERN.exec(String(input || "").trim());
  if (!match) {
    return "";
  }

  const fromChain = normalizeChainCode(match[1]);
  const fromNetwork = normalizeNetworkCode(match[2]);
  const fromAsset = normalizeAssetCode(match[3]);
  const toChain = normalizeChainCode(match[4]);
  const toNetwork = normalizeNetworkCode(match[5]);
  const toAsset = normalizeAssetCode(match[6]);

  return `${fromChain}:${fromNetwork}:${fromAsset}->${toChain}:${toNetwork}:${toAsset}`;
}

function parseIntegerOrDefault(value, fallbackValue) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return fallbackValue;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function parseRouteProtectionEntries() {
  const parsed = safeParseObject(process.env.SWAP_ROUTE_RULES);
  if (parsed.error) {
    return parsed;
  }

  const entries = Object.fromEntries(
    Object.entries(parsed.value || {}).map(([key, value]) => {
      const normalizedKey = normalizeRouteId(key);
      const rule = value && typeof value === "object" && !Array.isArray(value) ? value : {};

      return [
        normalizedKey || String(key || "").trim(),
        {
          key: normalizedKey,
          rawKey: String(key || "").trim(),
          serviceFeeBps:
            rule.serviceFeeBps === undefined
              ? null
              : parseIntegerOrDefault(rule.serviceFeeBps, Number.NaN),
          spreadBps:
            rule.spreadBps === undefined
              ? null
              : parseIntegerOrDefault(rule.spreadBps, Number.NaN),
          payoutFeeBufferBps:
            rule.payoutFeeBufferBps === undefined
              ? null
              : parseIntegerOrDefault(rule.payoutFeeBufferBps, Number.NaN),
          minimumProfitUsd:
            rule.minimumProfitUsd === undefined
              ? ""
              : trimDecimalString(rule.minimumProfitUsd, ""),
          minSourceAmount:
            rule.minSourceAmount === undefined
              ? ""
              : trimDecimalString(rule.minSourceAmount, ""),
        },
      ];
    }),
  );

  return {
    value: entries,
    error: null,
  };
}

function validateBpsValue(value, fieldName, errors = []) {
  if (value === null || value === undefined || value === "") {
    return errors;
  }

  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    errors.push(`${fieldName} must be an integer between 0 and 10000`);
  }

  return errors;
}

function validateRouteProtectionEntry(entry = {}) {
  const errors = [];

  if (!entry.key) {
    errors.push("key must be in \"fromChain:fromNetwork:fromAsset->toChain:toNetwork:toAsset\" format");
    return errors;
  }

  validateBpsValue(entry.serviceFeeBps, "serviceFeeBps", errors);
  validateBpsValue(entry.spreadBps, "spreadBps", errors);
  validateBpsValue(entry.payoutFeeBufferBps, "payoutFeeBufferBps", errors);

  if (entry.minimumProfitUsd && !isNonNegativeDecimalString(entry.minimumProfitUsd)) {
    errors.push("minimumProfitUsd must be a non-negative decimal amount");
  }

  if (entry.minSourceAmount && !isNonNegativeDecimalString(entry.minSourceAmount)) {
    errors.push("minSourceAmount must be a non-negative decimal amount");
  }

  const effectiveServiceFeeBps =
    entry.serviceFeeBps === null || entry.serviceFeeBps === undefined
      ? getServiceFeeBps()
      : entry.serviceFeeBps;
  const effectiveSpreadBps =
    entry.spreadBps === null || entry.spreadBps === undefined
      ? getSpreadBps()
      : entry.spreadBps;

  if (
    Number.isInteger(effectiveServiceFeeBps) &&
    Number.isInteger(effectiveSpreadBps) &&
    effectiveServiceFeeBps + effectiveSpreadBps > 10000
  ) {
    errors.push("serviceFeeBps plus spreadBps must not exceed 10000");
  }

  return errors;
}

function parseSystemWalletEntries() {
  const parsed = safeParseObject(process.env.SWAP_SYSTEM_WALLETS);
  if (parsed.error) {
    return parsed;
  }

  const entries = Object.fromEntries(
    Object.entries(parsed.value).map(([key, value]) => {
      const normalizedKey = normalizeChainNetworkKey(key);
      const chain = normalizedKey.split(":")[0] || "";
      const chainConfig = getConfiguredChainConfig(chain);
      const nativeAssetSymbol = String(
        chainConfig?.nativeAssetSymbol || "",
      ).trim().toUpperCase();
      const reserve = trimDecimalString(value?.reserve || "0", "0");

      return [
        normalizedKey || String(key || "").trim(),
        {
          key: normalizedKey,
          rawKey: String(key || "").trim(),
          chain,
          network: normalizedKey.split(":")[1] || "",
          address: String(value?.address || "").trim(),
          secret: String(value?.secret || "").trim(),
          asset: String(value?.asset || nativeAssetSymbol).trim().toUpperCase(),
          reserve,
        },
      ];
    }),
  );

  return {
    value: entries,
    error: null,
  };
}

function validateSystemWalletEntry(entry = {}) {
  const errors = [];

  if (!entry.key) {
    errors.push("key must be in \"chain:network\" format");
    return errors;
  }

  const chainConfig = getConfiguredChainConfig(entry.chain);
  const networkConfig = getConfiguredNetworkConfig(entry.chain, entry.network);
  if (!chainConfig || !networkConfig) {
    errors.push(
      `references unsupported chain/network "${entry.rawKey || entry.key}". Supported native treasury endpoints: ${formatSupportedNativeSwapTreasuryEndpoints() || "none"}`,
    );
    return errors;
  }

  const supportedEndpoint = getSupportedNativeSwapTreasuryEndpoint(entry);
  if (!supportedEndpoint) {
    errors.push(
      `references chain/network "${entry.rawKey || entry.key}" that is not available for native swap treasury routing in this runtime. Supported native treasury endpoints: ${formatSupportedNativeSwapTreasuryEndpoints() || "none"}`,
    );
    return errors;
  }

  if (!entry.address || !entry.secret) {
    errors.push("must include both address and secret");
  }

  if (
    PLACEHOLDER_VALUE_PATTERN.test(entry.address) ||
    PLACEHOLDER_VALUE_PATTERN.test(entry.secret)
  ) {
    errors.push("must use real address and secret values");
  }

  if (
    entry.asset &&
    entry.asset !== supportedEndpoint.asset
  ) {
    const tokenConfig = getConfiguredTokenConfig(
      entry.chain,
      entry.network,
      entry.asset,
    );

    if (tokenConfig) {
      errors.push(
        `asset "${entry.asset}" is a ${tokenConfig.standard.toUpperCase()} token; SWAP_SYSTEM_WALLETS supports native treasury assets only. Use native asset "${supportedEndpoint.asset}" for "${supportedEndpoint.key}"`,
      );
    } else {
      errors.push(
        `asset "${entry.asset}" is not the native swap treasury asset for "${supportedEndpoint.key}". Expected native asset "${supportedEndpoint.asset}"`,
      );
    }
  }

  if (!isNonNegativeDecimalString(entry.reserve)) {
    errors.push("reserve must be a non-negative decimal amount");
  }

  return errors;
}

function getValidationIssues() {
  const invalid = [];
  const warnings = [];
  const rawEnabled = String(process.env.SWAP_ENABLED || "").trim().toLowerCase();
  const enabled = parseBoolean(process.env.SWAP_ENABLED, false);
  const previewTtlSeconds = getPreviewTtlSeconds();
  const serviceFeeBps = getServiceFeeBps();
  const spreadBps = getSpreadBps();
  const payoutFeeBufferBps = getPayoutFeeBufferBps();
  const minimumProfitUsd = getMinimumProfitUsd();
  const minUsdEquivalent = getMinUsdEquivalent();
  const maxUsdEquivalent = getMaxUsdEquivalent();
  const parsedSystemWallets = parseSystemWalletEntries();
  const parsedRouteProtectionEntries = parseRouteProtectionEntries();

  if (rawEnabled && !["true", "false"].includes(rawEnabled)) {
    invalid.push("SWAP_ENABLED must be either true or false");
  }

  if (!Number.isInteger(previewTtlSeconds) || previewTtlSeconds <= 0) {
    invalid.push(
      "SWAP_PREVIEW_TTL_SECONDS must be a positive integer number of seconds",
    );
  }

  if (
    !Number.isInteger(serviceFeeBps) ||
    serviceFeeBps < 0 ||
    serviceFeeBps > 10000
  ) {
    invalid.push("SWAP_SERVICE_FEE_BPS must be an integer between 0 and 10000");
  }

  if (!Number.isInteger(spreadBps) || spreadBps < 0 || spreadBps > 10000) {
    invalid.push("SWAP_SPREAD_BPS must be an integer between 0 and 10000");
  }

  if (
    !Number.isInteger(payoutFeeBufferBps) ||
    payoutFeeBufferBps < 0 ||
    payoutFeeBufferBps > 10000
  ) {
    invalid.push("SWAP_PAYOUT_FEE_BUFFER_BPS must be an integer between 0 and 10000");
  }

  if (
    Number.isInteger(serviceFeeBps) &&
    Number.isInteger(spreadBps) &&
    serviceFeeBps + spreadBps > 10000
  ) {
    invalid.push("SWAP_SERVICE_FEE_BPS plus SWAP_SPREAD_BPS must not exceed 10000");
  }

  if (!isNonNegativeDecimalString(minimumProfitUsd)) {
    invalid.push("SWAP_MIN_PROFIT_USD must be a non-negative decimal amount");
  }

  if (!isNonNegativeDecimalString(minUsdEquivalent)) {
    invalid.push("SWAP_MIN_USD_EQUIVALENT must be a non-negative decimal amount");
  }

  if (!isNonNegativeDecimalString(maxUsdEquivalent)) {
    invalid.push("SWAP_MAX_USD_EQUIVALENT must be a non-negative decimal amount");
  }

  if (
    isNonNegativeDecimalString(minUsdEquivalent) &&
    isNonNegativeDecimalString(maxUsdEquivalent) &&
    decimalStringToComparableInt(minUsdEquivalent) >
      decimalStringToComparableInt(maxUsdEquivalent)
  ) {
    invalid.push(
      "SWAP_MAX_USD_EQUIVALENT must be greater than or equal to SWAP_MIN_USD_EQUIVALENT",
    );
  }

  if (parsedSystemWallets.error) {
    invalid.push(`SWAP_SYSTEM_WALLETS ${parsedSystemWallets.error}`);
  }

  if (parsedRouteProtectionEntries.error) {
    invalid.push(`SWAP_ROUTE_RULES ${parsedRouteProtectionEntries.error}`);
  }

  const systemWalletEntries = Object.values(parsedSystemWallets.value || {});
  if (enabled && !systemWalletEntries.length) {
    invalid.push(
      "SWAP_SYSTEM_WALLETS must define at least one swap system wallet when SWAP_ENABLED is true",
    );
  }

  for (const entry of systemWalletEntries) {
    const entryErrors = validateSystemWalletEntry(entry);
    invalid.push(
      ...entryErrors.map(
        (message) =>
          `SWAP_SYSTEM_WALLETS entry "${entry.key || "unknown"}" ${message}`,
      ),
    );
  }

  const routeProtectionEntries = Object.values(parsedRouteProtectionEntries.value || {});
  for (const entry of routeProtectionEntries) {
    const entryErrors = validateRouteProtectionEntry(entry);
    invalid.push(
      ...entryErrors.map(
        (message) =>
          `SWAP_ROUTE_RULES entry "${entry.key || entry.rawKey || "unknown"}" ${message}`,
      ),
    );
  }

  if (enabled && !systemWalletEntries.length) {
    warnings.push("Swap is enabled but no swap system wallets are currently usable");
  }

  return {
    invalid,
    warnings,
  };
}

function ensureValidSwapConfiguration() {
  const issues = getValidationIssues();
  if (issues.invalid.length) {
    throw AppError.internal(
      `Swap configuration is invalid:\n${issues.invalid.map((entry) => `- ${entry}`).join("\n")}`,
    );
  }
}

function getSwapSystemWalletConfig(
  { chain, network, asset } = {},
  { includeSecret = true, required = true } = {},
) {
  const key = normalizeChainNetworkKey(`${chain}:${network}`);
  if (!key) {
    throw AppError.validation("Swap system wallet lookup requires a valid chain and network");
  }

  const parsed = parseSystemWalletEntries();
  if (parsed.error) {
    throw AppError.internal(`SWAP_SYSTEM_WALLETS ${parsed.error}`);
  }

  const entry = parsed.value[key] || null;

  if (!entry) {
    if (!required) {
      return null;
    }

    throw AppError.notFound(
      `Swap system wallet is not configured for "${key}"`,
    );
  }

  const entryErrors = validateSystemWalletEntry(entry);
  if (entryErrors.length) {
    throw AppError.validation(
      `Swap system wallet "${key}" is invalid: ${entryErrors.join("; ")}`,
    );
  }

  const normalizedAsset = normalizeAssetCode(asset);
  if (normalizedAsset && normalizeAssetCode(entry.asset) !== normalizedAsset) {
    if (!required) {
      return null;
    }

    throw AppError.notFound(
      `Swap system wallet is not configured for "${key}" and asset "${normalizedAsset}"`,
    );
  }

  if (includeSecret) {
    return { ...entry };
  }

  const { secret: _secret, ...safeEntry } = entry;
  return safeEntry;
}

function hasSwapSystemWalletConfig(input = {}) {
  try {
    return Boolean(getSwapSystemWalletConfig(input, { required: false }));
  } catch (_error) {
    return false;
  }
}

function listSwapSystemWalletConfigs({ includeSecrets = false } = {}) {
  ensureValidSwapConfiguration();

  return Object.values(parseSystemWalletEntries().value).map((entry) => {
    if (includeSecrets) {
      return { ...entry };
    }

    const { secret: _secret, ...safeEntry } = entry;
    return safeEntry;
  });
}

function listSwapSystemWalletConfigEntries({ includeSecrets = false } = {}) {
  const parsed = parseSystemWalletEntries();
  if (parsed.error) {
    return {
      entries: [],
      error: `SWAP_SYSTEM_WALLETS ${parsed.error}`,
    };
  }

  return {
    entries: Object.values(parsed.value).map((entry) => {
      if (includeSecrets) {
        return { ...entry };
      }

      const { secret: _secret, ...safeEntry } = entry;
      return safeEntry;
    }),
    error: null,
  };
}

function getRouteProtectionConfig(input = {}) {
  const normalizedRouteId = normalizeRouteId(input.routeId);
  const parsed = parseRouteProtectionEntries();

  if (parsed.error) {
    throw AppError.internal(`SWAP_ROUTE_RULES ${parsed.error}`);
  }

  const rule = (normalizedRouteId && parsed.value[normalizedRouteId]) || {};
  const serviceFeeBps =
    rule.serviceFeeBps === null || rule.serviceFeeBps === undefined
      ? getServiceFeeBps()
      : rule.serviceFeeBps;
  const spreadBps =
    rule.spreadBps === null || rule.spreadBps === undefined
      ? getSpreadBps()
      : rule.spreadBps;
  const payoutFeeBufferBps =
    rule.payoutFeeBufferBps === null || rule.payoutFeeBufferBps === undefined
      ? getPayoutFeeBufferBps()
      : rule.payoutFeeBufferBps;
  const minimumProfitUsd =
    trimDecimalString(rule.minimumProfitUsd || getMinimumProfitUsd(), "0") || "0";
  const minSourceAmount =
    trimDecimalString(rule.minSourceAmount || "0", "0") || "0";

  return {
    routeId: normalizedRouteId || String(input.routeId || "").trim(),
    serviceFeeBps,
    spreadBps,
    totalFeeBps: serviceFeeBps + spreadBps,
    payoutFeeBufferBps,
    minimumProfitUsd,
    minSourceAmount,
  };
}

module.exports = Object.freeze({
  enabled: parseBoolean(process.env.SWAP_ENABLED, false),
  previewTtlSeconds: getPreviewTtlSeconds(),
  serviceFeeBps: getServiceFeeBps(),
  spreadBps: getSpreadBps(),
  payoutFeeBufferBps: getPayoutFeeBufferBps(),
  minimumProfitUsd: getMinimumProfitUsd(),
  minUsdEquivalent: getMinUsdEquivalent(),
  maxUsdEquivalent: getMaxUsdEquivalent(),
  getValidationIssues,
  getSwapSystemWalletConfig,
  hasSwapSystemWalletConfig,
  listSwapSystemWalletConfigs,
  listSwapSystemWalletConfigEntries,
  getRouteProtectionConfig,
  getSupportedNativeSwapTreasuryEndpoints,
  normalizeChainNetworkKey,
  normalizeRouteId,
});
