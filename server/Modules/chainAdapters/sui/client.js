const { SuiClient } = require("@mysten/sui/client");

const { AppError } = require("../../../helpers/errors");

const DEFAULT_NETWORK = String(process.env.SUI_DEFAULT_NETWORK || "mainnet")
  .trim()
  .toLowerCase();

const clients = new Map();

function normalizeNetwork(network = DEFAULT_NETWORK) {
  const normalized = String(network || DEFAULT_NETWORK).trim().toLowerCase();

  if (normalized !== "mainnet") {
    throw AppError.validation(`Unsupported SUI network "${network}"`);
  }

  return normalized;
}

function ensureHttpUrl(url, fieldName) {
  const normalized = String(url || "").trim();

  if (!normalized) {
    throw AppError.validation(`${fieldName} is required for Sui operations`);
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
      process.env.SUI_MAINNET_RPC_URL,
      "SUI_MAINNET_RPC_URL",
    );
  }

  throw AppError.validation(`Unsupported SUI network "${normalizedNetwork}"`);
}

function getSdkClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (clients.has(normalizedNetwork)) {
    return clients.get(normalizedNetwork);
  }

  const sdkClient = new SuiClient({
    url: getRpcUrl(normalizedNetwork),
  });

  clients.set(normalizedNetwork, sdkClient);
  return sdkClient;
}

function getClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const rpcUrl = getRpcUrl(normalizedNetwork);
  const sdkClient = getSdkClient(normalizedNetwork);

  return Object.freeze({
    network: normalizedNetwork,
    rpcUrl,
    sdkClient,
    getBalance(owner) {
      return sdkClient.getBalance({ owner });
    },
    getReferenceGasPrice() {
      return sdkClient.getReferenceGasPrice();
    },
    dryRunTransactionBlock(transactionBlock) {
      return sdkClient.dryRunTransactionBlock({ transactionBlock });
    },
    signAndExecuteTransaction(input = {}) {
      return sdkClient.signAndExecuteTransaction(input);
    },
    waitForTransaction(input = {}) {
      return sdkClient.waitForTransaction(input);
    },
    queryTransactionBlocks(input = {}) {
      return sdkClient.queryTransactionBlocks(input);
    },
    getTransactionBlock(input = {}) {
      return sdkClient.getTransactionBlock(input);
    },
  });
}

module.exports = {
  DEFAULT_NETWORK,
  normalizeNetwork,
  getRpcUrl,
  getSdkClient,
  getClient,
};
