const { Address, TonClient } = require("@ton/ton");

const { AppError } = require("../../../helpers/errors");

const DEFAULT_NETWORK = String(process.env.TON_DEFAULT_NETWORK || "mainnet")
  .trim()
  .toLowerCase();

const clients = new Map();

function normalizeNetwork(network = DEFAULT_NETWORK) {
  const normalized = String(network || DEFAULT_NETWORK).trim().toLowerCase();

  if (normalized !== "mainnet") {
    throw AppError.validation(`Unsupported TON network "${network}"`);
  }

  return normalized;
}

function ensureHttpUrl(url, fieldName) {
  const normalized = String(url || "").trim();

  if (!normalized) {
    throw AppError.validation(`${fieldName} is required for TON operations`);
  }

  if (!/^https?:\/\//.test(normalized)) {
    throw AppError.validation(`${fieldName} must be a valid HTTP or HTTPS URL`);
  }

  return normalized.replace(/\/+$/, "");
}

function getRpcUrl(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (normalizedNetwork === "mainnet") {
    return ensureHttpUrl(
      process.env.TON_MAINNET_RPC_URL,
      "TON_MAINNET_RPC_URL",
    );
  }

  throw AppError.validation(`Unsupported TON network "${normalizedNetwork}"`);
}

function getApiKey(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (normalizedNetwork === "mainnet") {
    return String(process.env.TON_MAINNET_API_KEY || "").trim();
  }

  return "";
}

function getSdkClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const rpcUrl = getRpcUrl(normalizedNetwork);
  const apiKey = getApiKey(normalizedNetwork);
  const cacheKey = `${normalizedNetwork}:${rpcUrl}:${apiKey}`;

  if (clients.has(cacheKey)) {
    return clients.get(cacheKey);
  }

  const sdkClient = new TonClient({
    endpoint: rpcUrl,
    apiKey: apiKey || undefined,
  });

  clients.set(cacheKey, sdkClient);
  return sdkClient;
}

function toTonAddress(address) {
  return Address.parse(String(address || "").trim());
}

function normalizeAccountState(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "active" || normalized === "uninitialized" || normalized === "frozen") {
    return normalized;
  }

  return normalized || "unknown";
}

function serializeLastTransaction(lastTransaction = null) {
  if (!lastTransaction || typeof lastTransaction !== "object") {
    return null;
  }

  return {
    lt:
      lastTransaction.lt === undefined || lastTransaction.lt === null
        ? null
        : String(lastTransaction.lt),
    hash:
      lastTransaction.hash === undefined || lastTransaction.hash === null
        ? null
        : String(lastTransaction.hash),
  };
}

async function getContractState(address, network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const sdkClient = getSdkClient(normalizedNetwork);
  const state = await withRpcRetry(() => sdkClient.getContractState(toTonAddress(address)));

  return {
    balance:
      state?.balance === undefined || state?.balance === null ? "0" : String(state.balance),
    state: normalizeAccountState(state?.state),
    code: state?.code || null,
    data: state?.data || null,
    blockId:
      state?.blockId && typeof state.blockId === "object"
        ? {
            workchain:
              state.blockId.workchain === undefined || state.blockId.workchain === null
                ? null
                : Number(state.blockId.workchain),
            shard:
              state.blockId.shard === undefined || state.blockId.shard === null
                ? null
                : String(state.blockId.shard),
            seqno:
              state.blockId.seqno === undefined || state.blockId.seqno === null
                ? null
                : Number(state.blockId.seqno),
          }
        : null,
    lastTransaction: serializeLastTransaction(state?.lastTransaction),
    extraCurrencies: Array.isArray(state?.extra_currencies) ? state.extra_currencies : [],
    timestamp:
      state?.timestampt === undefined || state?.timestampt === null
        ? null
        : Number(state.timestampt),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRpcRetry(execute) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      if (attempt === attempts) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.toLowerCase().includes("ratelimit") &&
        !message.toLowerCase().includes("429") &&
        !message.toLowerCase().includes("timeout") &&
        !message.toLowerCase().includes("fetch") &&
        !message.toLowerCase().includes("network")
      ) {
        throw error; // Don't retry non-transient errors
      }
      await sleep(1000 * attempt);
    }
  }
}

function getClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const rpcUrl = getRpcUrl(normalizedNetwork);
  const apiKey = getApiKey(normalizedNetwork);
  const sdkClient = getSdkClient(normalizedNetwork);

  return Object.freeze({
    network: normalizedNetwork,
    rpcUrl,
    apiKeyConfigured: Boolean(apiKey),
    sdkClient,
    getBalance(address) {
      return withRpcRetry(() => sdkClient.getBalance(toTonAddress(address)));
    },
    getAddressInfo(address) {
      return getContractState(address, normalizedNetwork); // Already updated below
    },
    getContractState(address) {
      return getContractState(address, normalizedNetwork);
    },
    getTransactions(address, options = {}) {
      return withRpcRetry(() => sdkClient.getTransactions(toTonAddress(address), options));
    },
    estimateExternalMessageFee(address, args = {}) {
      return withRpcRetry(() => sdkClient.estimateExternalMessageFee(toTonAddress(address), args));
    },
    openContract(contract) {
      return sdkClient.open(contract);
    },
    isContractDeployed(address) {
      return withRpcRetry(() => sdkClient.isContractDeployed(toTonAddress(address)));
    },
  });
}


module.exports = {
  DEFAULT_NETWORK,
  normalizeNetwork,
  getRpcUrl,
  getApiKey,
  getSdkClient,
  getClient,
  getContractState,
  normalizeAccountState,
  toTonAddress,
};
