const {
  APTOS_COIN,
  Aptos,
  AptosConfig,
  Network,
  NetworkToNodeAPI,
} = require("@aptos-labs/ts-sdk");

const { AppError } = require("../../../helpers/errors");

const DEFAULT_NETWORK = String(process.env.APTOS_DEFAULT_NETWORK || "testnet")
  .trim()
  .toLowerCase();

const SUPPORTED_NETWORKS = Object.freeze(["mainnet", "testnet", "devnet"]);
const NETWORK_ENUM_MAP = Object.freeze({
  mainnet: Network.MAINNET,
  testnet: Network.TESTNET,
  devnet: Network.DEVNET,
});
const NODE_URL_ENV_MAP = Object.freeze({
  mainnet: "APTOS_MAINNET_URL",
  testnet: "APTOS_TESTNET_URL",
  devnet: "APTOS_DEVNET_URL",
});
const DEFAULT_NODE_URL_MAP = Object.freeze({
  mainnet: NetworkToNodeAPI.mainnet,
  testnet: NetworkToNodeAPI.testnet,
  devnet: NetworkToNodeAPI.devnet,
});

const clients = new Map();

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeNetwork(network = DEFAULT_NETWORK) {
  const normalized = normalizeString(network || DEFAULT_NETWORK).toLowerCase();

  if (!SUPPORTED_NETWORKS.includes(normalized)) {
    throw AppError.validation(`Unsupported Aptos network "${network}"`);
  }

  return normalized;
}

function ensureHttpUrl(url, fieldName) {
  const normalized = normalizeString(url);

  if (!normalized) {
    throw AppError.validation(`${fieldName} is required for Aptos operations`);
  }

  if (!/^https?:\/\//i.test(normalized)) {
    throw AppError.validation(`${fieldName} must be a valid HTTP or HTTPS URL`);
  }

  return normalized.replace(/\/+$/, "");
}

function getNodeUrl(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const envVarName = NODE_URL_ENV_MAP[normalizedNetwork];
  const fallback = DEFAULT_NODE_URL_MAP[normalizedNetwork];

  return ensureHttpUrl(process.env[envVarName] || fallback, envVarName);
}

function buildClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const nodeUrl = getNodeUrl(normalizedNetwork);
  const aptosConfig = new AptosConfig({
    network: NETWORK_ENUM_MAP[normalizedNetwork],
    nodeUrl,
  });
  const sdkClient = new Aptos(aptosConfig);

  return Object.freeze({
    network: normalizedNetwork,
    nodeUrl,
    aptosConfig,
    sdkClient,
    getAccountInfo(accountAddress) {
      return sdkClient.getAccountInfo({ accountAddress });
    },
    getBalance(accountAddress, asset = APTOS_COIN) {
      return sdkClient.getBalance({ accountAddress, asset });
    },
    getTransactionByHash(transactionHash) {
      return sdkClient.getTransactionByHash({ transactionHash });
    },
    getTransactionByVersion(ledgerVersion) {
      return sdkClient.getTransactionByVersion({ ledgerVersion });
    },
    waitForTransaction(transactionHash, options = {}) {
      return sdkClient.waitForTransaction({ transactionHash, options });
    },
    isPendingTransaction(transactionHash) {
      return sdkClient.isPendingTransaction({ transactionHash });
    },
    getGasPriceEstimation() {
      return sdkClient.getGasPriceEstimation();
    },
    simulateTransaction(transaction, signerPublicKey) {
      return sdkClient.transaction.simulate.simple({
        signerPublicKey,
        transaction,
      });
    },
    signAndSubmitTransaction(signer, transaction) {
      return sdkClient.signAndSubmitTransaction({
        signer,
        transaction,
      });
    },
    transferCoinTransaction(input) {
      return sdkClient.transferCoinTransaction(input);
    },
    getAccountTransactions(accountAddress, options = {}) {
      return sdkClient.getAccountTransactions({ accountAddress, options });
    },
    getTransactions(options = {}) {
      return sdkClient.getTransactions({ options });
    },
    getFungibleAssetActivities(options = {}) {
      return sdkClient.getFungibleAssetActivities({ options });
    },
    getLedgerInfo() {
      return sdkClient.getLedgerInfo();
    },
  });
}

function getClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (clients.has(normalizedNetwork)) {
    return clients.get(normalizedNetwork);
  }

  const builtClient = buildClient(normalizedNetwork);
  clients.set(normalizedNetwork, builtClient);
  return builtClient;
}

module.exports = {
  APTOS_COIN,
  DEFAULT_NETWORK,
  SUPPORTED_NETWORKS,
  normalizeNetwork,
  getNodeUrl,
  getClient,
};
