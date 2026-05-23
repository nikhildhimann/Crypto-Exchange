const TronWebLib = require("tronweb");

const { AppError } = require("../../../helpers/errors");
const logger = require("../../../common/utils/logger");
const { handleChainRuntimeFailure } = require("../../../services/chainRuntime.service");

const TronWeb = TronWebLib.TronWeb || TronWebLib.default || TronWebLib;
const DEFAULT_NETWORK = String(process.env.TRON_DEFAULT_NETWORK || "mainnet").toLowerCase();
const SHARED_PUBLIC_ENDPOINTS = Object.freeze([
  "https://api.trongrid.io",
  "https://nile.trongrid.io",
  "https://tron-rpc.publicnode.com",
]);
const DEFAULT_BANDWIDTH_PRICE_SUN = 1000;
const DEFAULT_ENERGY_PRICE_SUN = 100;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const clients = new Map();
const providerValidation = new Map();
const chainParameterCache = new Map();
const warnedPublicEndpoints = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRpcError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  return [
    "429",
    "allowed_rps",
    "rate exceeded",
    "too many requests",
    "timeout",
    "timed out",
    "socket",
    "econn",
    "fetch failed",
    "network error",
  ].some((token) => normalized.includes(token));
}

async function withRpcRetry(network, operation, execute) {
  for (let attempt = 1; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      if (!isRetryableRpcError(error) || attempt === DEFAULT_RETRY_ATTEMPTS) {
        throw error;
      }

      const delayMs = DEFAULT_RETRY_DELAY_MS * 2 ** (attempt - 1);
      logger.warn("Retrying TRON RPC request after transient failure", {
        network,
        operation,
        attempt,
        maxAttempts: DEFAULT_RETRY_ATTEMPTS,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw new Error(`TRON RPC request failed while ${operation}`);
}

function normalizeNetwork(network = DEFAULT_NETWORK) {
  const normalized = String(network || DEFAULT_NETWORK).toLowerCase();

  if (!["mainnet", "testnet"].includes(normalized)) {
    throw AppError.validation(`Unsupported TRON network "${network}"`);
  }

  return normalized;
}

function getApiKey() {
  return String(process.env.TRON_API_KEY || "").trim();
}

function isSharedPublicEndpoint(fullHost) {
  return SHARED_PUBLIC_ENDPOINTS.includes(String(fullHost || "").trim());
}

function ensureFullHost(fullHost, label) {
  const normalizedFullHost = String(fullHost || "").trim();

  if (!/^https?:\/\//.test(normalizedFullHost)) {
    throw AppError.validation(
      `${label} must be a valid HTTP or HTTPS URL`,
    );
  }

  return normalizedFullHost;
}

function getConfiguredFullHosts(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const primaryEnv =
    normalizedNetwork === "mainnet"
      ? process.env.TRON_MAINNET_URL
      : process.env.TRON_TESTNET_URL;
  const fallbackEnv =
    normalizedNetwork === "mainnet"
      ? process.env.TRON_MAINNET_FALLBACKS
      : process.env.TRON_TESTNET_FALLBACKS;
  const candidates = [
    String(primaryEnv || "").trim(),
    ...String(fallbackEnv || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ];
  const seen = new Set();

  return candidates.reduce((fullHosts, candidate, index) => {
    const normalizedCandidate = ensureFullHost(
      candidate,
      index === 0
        ? `TRON ${normalizedNetwork} URL`
        : `TRON ${normalizedNetwork} fallback URL`,
    );

    if (seen.has(normalizedCandidate)) {
      return fullHosts;
    }

    seen.add(normalizedCandidate);
    fullHosts.push(normalizedCandidate);
    return fullHosts;
  }, []);
}

function getFullHost(network = DEFAULT_NETWORK) {
  return getConfiguredFullHosts(network)[0];
}

function createClient(network = DEFAULT_NETWORK, fullHostOverride = "") {
  const normalizedNetwork = normalizeNetwork(network);
  const apiKey = getApiKey();
  const fullHost = fullHostOverride
    ? ensureFullHost(fullHostOverride, `TRON ${normalizedNetwork} URL`)
    : getFullHost(normalizedNetwork);
  const headers = apiKey
    ? {
        "TRON-PRO-API-KEY": apiKey,
      }
    : undefined;

  const warningKey = `${normalizedNetwork}:${fullHost}`;
  if (!apiKey && isSharedPublicEndpoint(fullHost) && !warnedPublicEndpoints.has(warningKey)) {
    warnedPublicEndpoints.add(warningKey);
    logger.warn("TRON adapter is using a shared public RPC endpoint without an API key", {
      network: normalizedNetwork,
      fullHost,
      recommendation:
        "Configure TRON_API_KEY and ideally a dedicated TRON_MAINNET_URL / TRON_TESTNET_URL for production reliability",
    });
  }

  return new TronWeb({
    fullHost,
    ...(headers ? { headers } : {}),
  });
}

function getClient(network = DEFAULT_NETWORK, fullHostOverride = "") {
  const normalizedNetwork = normalizeNetwork(network);
  const fullHost = fullHostOverride
    ? ensureFullHost(fullHostOverride, `TRON ${normalizedNetwork} URL`)
    : getFullHost(normalizedNetwork);
  const cacheKey = `${normalizedNetwork}:${fullHost}`;

  if (clients.has(cacheKey)) {
    return clients.get(cacheKey);
  }

  const client = createClient(normalizedNetwork, fullHost);
  clients.set(cacheKey, client);
  return client;
}

async function validateProviderCandidate(network = DEFAULT_NETWORK, fullHost) {
  const normalizedNetwork = normalizeNetwork(network);
  const client = getClient(normalizedNetwork, fullHost);
  const currentBlock = await withRpcRetry(
    normalizedNetwork,
    `checking TRON provider health (${fullHost})`,
    () => client.trx.getCurrentBlock(),
  );
  const blockNumber = Number(currentBlock?.block_header?.raw_data?.number);

  if (!Number.isFinite(blockNumber) || blockNumber < 0) {
    throw AppError.validation(`TRON ${normalizedNetwork} provider returned an invalid block height`);
  }

  return {
    client,
    network: normalizedNetwork,
    fullHost,
    blockNumber,
  };
}

async function assertProviderReady(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (providerValidation.has(normalizedNetwork)) {
    return providerValidation.get(normalizedNetwork);
  }

  const validationPromise = (async () => {
    const fullHosts = getConfiguredFullHosts(normalizedNetwork);
    const failures = [];

    for (const fullHost of fullHosts) {
      try {
        return await validateProviderCandidate(normalizedNetwork, fullHost);
      } catch (error) {
        failures.push({
          fullHost,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(
      failures.map((failure) => `${failure.fullHost}: ${failure.reason}`).join(" | "),
    );
  })();

  providerValidation.set(normalizedNetwork, validationPromise);

  try {
    return await validationPromise;
  } catch (error) {
    providerValidation.delete(normalizedNetwork);

    if (error instanceof AppError) {
      if (error.status === 502) {
        handleChainRuntimeFailure("tron", error, { network: normalizedNetwork });
      }
      throw error;
    }

    const rpcError = new AppError("TRON RPC is currently unavailable", {
      status: 502,
      errors: {
        reason: error instanceof Error ? error.message : String(error),
        network: normalizedNetwork,
      },
    });
    handleChainRuntimeFailure("tron", rpcError, { network: normalizedNetwork });
    throw rpcError;
  }
}

async function withClientFallback(network = DEFAULT_NETWORK, operation, execute) {
  const normalizedNetwork = normalizeNetwork(network);
  const preferredProvider = await assertProviderReady(normalizedNetwork);
  const orderedFullHosts = [
    preferredProvider.fullHost,
    ...getConfiguredFullHosts(normalizedNetwork).filter(
      (fullHost) => fullHost !== preferredProvider.fullHost,
    ),
  ];
  const failures = [];

  for (const fullHost of orderedFullHosts) {
    let candidate;

    try {
      candidate =
        fullHost === preferredProvider.fullHost
          ? preferredProvider
          : await validateProviderCandidate(normalizedNetwork, fullHost);
      return await withRpcRetry(
        normalizedNetwork,
        `${operation} (${fullHost})`,
        () => execute(candidate),
      );
    } catch (error) {
      failures.push({
        fullHost,
        reason: error instanceof Error ? error.message : String(error),
      });

      if (!isRetryableRpcError(error)) {
        throw error;
      }

      logger.warn("Switching TRON RPC provider after retryable failure", {
        network: normalizedNetwork,
        operation,
        fullHost,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new AppError("TRON RPC is currently unavailable", {
    status: 502,
    errors: {
      reason: failures.map((failure) => `${failure.fullHost}: ${failure.reason}`).join(" | "),
      network: normalizedNetwork,
    },
  });
}

async function getChainParameterMap(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (chainParameterCache.has(normalizedNetwork)) {
    return chainParameterCache.get(normalizedNetwork);
  }

  const chainParameterPromise = (async () => {
    const { client } = await assertProviderReady(normalizedNetwork);
    const parameters = await withRpcRetry(
      normalizedNetwork,
      "fetching TRON chain parameters",
      () => client.trx.getChainParameters(),
    );

    return Object.freeze(
      Object.fromEntries(
        (Array.isArray(parameters) ? parameters : [])
          .filter(
            (entry) =>
              entry &&
              typeof entry.key === "string" &&
              Number.isFinite(Number(entry.value)),
          )
          .map((entry) => [entry.key, Number(entry.value)]),
      ),
    );
  })();

  chainParameterCache.set(normalizedNetwork, chainParameterPromise);

  try {
    return await chainParameterPromise;
  } catch (error) {
    chainParameterCache.delete(normalizedNetwork);

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("TRON RPC is currently unavailable", {
      status: 502,
      errors: {
        reason: error instanceof Error ? error.message : String(error),
        network: normalizedNetwork,
      },
    });
  }
}

function parseResourcePrice(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  const segments = rawValue
    .split(",")
    .map((segment) => String(segment || "").trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const parts = segments[index].split(":");
    const candidate = Number(parts[parts.length - 1]);

    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return null;
}

async function getBandwidthPrice(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const { client } = await assertProviderReady(normalizedNetwork);

  try {
    const parsed = parseResourcePrice(
      await withRpcRetry(
        normalizedNetwork,
        "fetching TRON bandwidth prices",
        () => client.trx.getBandwidthPrices(),
      ),
    );
    if (parsed !== null) {
      return parsed;
    }
  } catch (_error) {
    // Fall through to chain parameters.
  }

  let parameterMap = {};

  try {
    parameterMap = await getChainParameterMap(normalizedNetwork);
  } catch (_error) {
    parameterMap = {};
  }

  return (
    parameterMap.getTransactionFee ||
    parameterMap.getTransactionFeeInSystemContract ||
    DEFAULT_BANDWIDTH_PRICE_SUN
  );
}

async function getEnergyPrice(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const { client } = await assertProviderReady(normalizedNetwork);

  try {
    const parsed = parseResourcePrice(
      await withRpcRetry(
        normalizedNetwork,
        "fetching TRON energy prices",
        () => client.trx.getEnergyPrices(),
      ),
    );
    if (parsed !== null) {
      return parsed;
    }
  } catch (_error) {
    // Fall through to chain parameters.
  }

  let parameterMap = {};

  try {
    parameterMap = await getChainParameterMap(normalizedNetwork);
  } catch (_error) {
    parameterMap = {};
  }

  return (
    parameterMap.getEnergyFee ||
    parameterMap.getEnergyFeeInSystemContract ||
    DEFAULT_ENERGY_PRICE_SUN
  );
}

module.exports = {
  TronWeb,
  getClient,
  getFullHost,
  assertProviderReady,
  withClientFallback,
  getChainParameterMap,
  getBandwidthPrice,
  getEnergyPrice,
  withRpcRetry,
};
