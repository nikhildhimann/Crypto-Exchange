const { JsonRpcProvider, WebSocketProvider } = require("ethers");

const { AppError } = require("../../../helpers/errors");
const logger = require("../../../common/utils/logger");
const { handleChainRuntimeFailure } = require("../../../services/chainRuntime.service");

const MAINNET_NETWORK = "mainnet";
const DEFAULT_ETH_CHAIN_ID = 1;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 400;
const httpClients = new Map();
const websocketClients = new Map();
const providerValidation = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeNetwork(network = MAINNET_NETWORK) {
  const normalized = String(network || MAINNET_NETWORK).toLowerCase();

  if (normalized !== MAINNET_NETWORK) {
    throw AppError.validation(`Unsupported ETH network "${network}"`);
  }

  return normalized;
}

function getConfiguredChainId() {
  const rawValue = String(process.env.ETH_CHAIN_ID || DEFAULT_ETH_CHAIN_ID).trim();
  if (!/^\d+$/.test(rawValue)) {
    throw AppError.validation("ETH_CHAIN_ID must be a valid integer");
  }

  return Number(rawValue);
}

function ensureHttpUrl(url, fieldName = "ETH_RPC_HTTP") {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) {
    throw AppError.validation(`${fieldName} is required for Ethereum chain operations`);
  }

  if (!/^https?:\/\//.test(normalizedUrl)) {
    throw AppError.validation(`${fieldName} must be a valid HTTP or HTTPS URL`);
  }

  return normalizedUrl;
}

function getHttpRpcUrls() {
  const configuredPrimary = String(process.env.ETH_RPC_HTTP || "").trim();
  const configuredFallbacks = String(process.env.ETH_RPC_HTTP_FALLBACKS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const candidates = [configuredPrimary, ...configuredFallbacks];
  const seen = new Set();

  return candidates.reduce((urls, candidate) => {
    const normalizedUrl = ensureHttpUrl(candidate);
    if (seen.has(normalizedUrl)) {
      return urls;
    }

    seen.add(normalizedUrl);
    urls.push(normalizedUrl);
    return urls;
  }, []);
}

function getWebSocketRpcUrl() {
  const url = String(process.env.ETH_RPC_WSS || "").trim();
  if (!url) {
    return "";
  }

  if (!/^wss?:\/\//.test(url)) {
    throw AppError.validation("ETH_RPC_WSS must be a valid WebSocket URL");
  }

  return url;
}

function getClient(rpcUrl) {
  const normalizedUrl = ensureHttpUrl(rpcUrl);

  if (httpClients.has(normalizedUrl)) {
    return httpClients.get(normalizedUrl);
  }

  const provider = new JsonRpcProvider(normalizedUrl);
  httpClients.set(normalizedUrl, provider);
  return provider;
}

function getWebSocketClient(network = MAINNET_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const url = getWebSocketRpcUrl();

  if (!url) {
    return null;
  }

  if (websocketClients.has(normalizedNetwork)) {
    return websocketClients.get(normalizedNetwork);
  }

  const provider = new WebSocketProvider(url);
  websocketClients.set(normalizedNetwork, provider);
  return provider;
}

function isRetryableRpcError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  return [
    "429",
    "rate limit",
    "rate-limited",
    "too many requests",
    "timeout",
    "timed out",
    "socket",
    "econn",
    "network error",
    "failed to fetch",
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
      logger.warn("Retrying ETH RPC request after transient failure", {
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

  throw new Error(`ETH RPC request failed while ${operation}`);
}

async function validateProviderCandidate(network, rpcUrl) {
  const normalizedNetwork = normalizeNetwork(network);
  const provider = getClient(rpcUrl);
  const expectedChainId = getConfiguredChainId();
  const actualNetwork = await withRpcRetry(
    normalizedNetwork,
    `checking Ethereum provider health (${rpcUrl})`,
    () => provider.getNetwork(),
  );
  const actualChainId = Number(actualNetwork.chainId);

  if (actualChainId !== expectedChainId) {
    throw AppError.validation(
      `ETH RPC chain ID mismatch for ${rpcUrl}: expected ${expectedChainId}, received ${actualChainId}`,
    );
  }

  return {
    provider,
    chainId: actualChainId,
    rpcUrl,
  };
}

async function assertProviderReady(network = MAINNET_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (providerValidation.has(normalizedNetwork)) {
    return providerValidation.get(normalizedNetwork);
  }

  const validationPromise = (async () => {
    const rpcUrls = getHttpRpcUrls();
    const failures = [];

    for (const rpcUrl of rpcUrls) {
      try {
        return await validateProviderCandidate(normalizedNetwork, rpcUrl);
      } catch (error) {
        failures.push({
          rpcUrl,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(
      failures.map((failure) => `${failure.rpcUrl}: ${failure.reason}`).join(" | "),
    );
  })();

  providerValidation.set(normalizedNetwork, validationPromise);

  try {
    return await validationPromise;
  } catch (error) {
    providerValidation.delete(normalizedNetwork);
    if (error instanceof AppError) {
      if (error.status === 502) {
        handleChainRuntimeFailure("eth", error, { network: normalizedNetwork });
      }
      throw error;
    }

    const rpcError = new AppError("Ethereum RPC is currently unavailable", {
      status: 502,
      errors: {
        reason: error instanceof Error ? error.message : String(error),
        network: normalizedNetwork,
      },
    });
    handleChainRuntimeFailure("eth", rpcError, { network: normalizedNetwork });
    throw rpcError;
  }
}

async function withProviderFallback(network = MAINNET_NETWORK, operation, execute) {
  const normalizedNetwork = normalizeNetwork(network);
  const preferredProvider = await assertProviderReady(normalizedNetwork);
  const orderedRpcUrls = [
    preferredProvider.rpcUrl,
    ...getHttpRpcUrls().filter((rpcUrl) => rpcUrl !== preferredProvider.rpcUrl),
  ];
  const failures = [];

  for (const rpcUrl of orderedRpcUrls) {
    let candidate;

    try {
      candidate =
        rpcUrl === preferredProvider.rpcUrl
          ? preferredProvider
          : await validateProviderCandidate(normalizedNetwork, rpcUrl);
      return await withRpcRetry(
        normalizedNetwork,
        `${operation} (${rpcUrl})`,
        () => execute(candidate),
      );
    } catch (error) {
      failures.push({
        rpcUrl,
        reason: error instanceof Error ? error.message : String(error),
      });

      if (!isRetryableRpcError(error)) {
        throw error;
      }

      logger.warn("Switching ETH RPC provider after retryable failure", {
        network: normalizedNetwork,
        operation,
        rpcUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new AppError("Ethereum RPC is currently unavailable", {
    status: 502,
    errors: {
      reason: failures.map((failure) => `${failure.rpcUrl}: ${failure.reason}`).join(" | "),
      network: normalizedNetwork,
    },
  });
}

module.exports = {
  getClient,
  getWebSocketClient,
  getConfiguredChainId,
  assertProviderReady,
  withProviderFallback,
};
