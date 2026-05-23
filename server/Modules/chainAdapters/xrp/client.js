const { Client } = require("xrpl");
const xrplConfig = require("../../../config/xrpl");
const { AppError } = require("../../../helpers/errors");
const { handleChainRuntimeFailure } = require("../../../services/chainRuntime.service");

const clients = new Map();
const connectPromises = new Map();

function getClientUrl(network = xrplConfig.defaultNetwork) {
  const url = String(xrplConfig.networks[network] || "").trim();
  if (!url) {
    throw AppError.validation(`Unsupported XRP network "${network}"`);
  }

  if (!/^wss?:\/\//.test(url)) {
    const envVar = network === "mainnet" ? "XRPL_MAINNET_URL" : "XRPL_TESTNET_URL";
    throw AppError.validation(`${envVar} must be a valid WebSocket URL`);
  }

  return url;
}

function attachLifecycleHandlers(network, client) {
  if (client.__auraLifecycleHandlersAttached) {
    return client;
  }

  client.on("connected", () => {
    if (connectPromises.get(network)) {
      connectPromises.delete(network);
    }
  });

  client.on("disconnected", () => {
    if (connectPromises.get(network)) {
      connectPromises.delete(network);
    }
  });

  client.__auraLifecycleHandlersAttached = true;
  return client;
}

function getOrCreateClient(network = xrplConfig.defaultNetwork) {
  const existing = clients.get(network);
  if (existing) {
    return existing;
  }

  const client = attachLifecycleHandlers(network, new Client(getClientUrl(network)));
  clients.set(network, client);
  return client;
}

async function ensureConnected(network = xrplConfig.defaultNetwork, options = {}) {
  const { forceReconnect = false } = options;
  const client = getOrCreateClient(network);

  if (client.isConnected() && !forceReconnect) {
    return client;
  }

  const existingConnect = connectPromises.get(network);
  if (existingConnect) {
    await existingConnect;
    if (!client.isConnected()) {
      throw new Error(`XRPL client for "${network}" failed to connect`);
    }

    return client;
  }

  const connectPromise = (async () => {
    if (forceReconnect && client.isConnected()) {
      await client.disconnect().catch(() => null);
    }

    if (!client.isConnected()) {
      await client.connect();
    }

    if (!client.isConnected()) {
      throw new Error(`XRPL client for "${network}" is not connected`);
    }

    return client;
  })().finally(() => {
    if (connectPromises.get(network) === connectPromise) {
      connectPromises.delete(network);
    }
  });

  connectPromises.set(network, connectPromise);
  try {
    return await connectPromise;
  } catch (error) {
    handleChainRuntimeFailure("xrp", error, { network });
    throw error;
  }
}

async function getClient(network = xrplConfig.defaultNetwork) {
  return ensureConnected(network);
}

async function reconnectClient(network = xrplConfig.defaultNetwork) {
  return ensureConnected(network, { forceReconnect: true });
}

module.exports = {
  getClient,
  reconnectClient,
};
