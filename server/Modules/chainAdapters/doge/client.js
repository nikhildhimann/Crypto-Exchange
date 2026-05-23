const axios = require("axios");
const { AppError } = require("../../../helpers/errors");

const MAINNET = "mainnet";
const RPC_TIMEOUT_MS = 30000;

function ensureHttpUrl(value, fieldName) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw AppError.validation(`${fieldName} is required`);
  }

  if (!/^https?:\/\//i.test(normalized)) {
    throw AppError.validation(`${fieldName} must be a valid HTTP or HTTPS URL`);
  }

  return normalized;
}

function normalizeNetwork(network = MAINNET) {
  const normalized = String(network || MAINNET)
    .trim()
    .toLowerCase();
  if (normalized !== MAINNET) {
    throw AppError.validation(`Unsupported DOGE network "${network}"`);
  }
  return normalized;
}

function getRpcConfig() {
  const url = ensureHttpUrl(process.env.DOGE_RPC_URL, "DOGE_RPC_URL");
  const username = String(process.env.DOGE_RPC_USERNAME || "").trim();
  const password = String(process.env.DOGE_RPC_PASSWORD || "").trim();

  if (!username) {
    throw AppError.validation("DOGE_RPC_USERNAME is required");
  }

  if (!password) {
    throw AppError.validation("DOGE_RPC_PASSWORD is required");
  }

  return { url, username, password };
}

function extractResponseText(data) {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (data && typeof data === "object") {
    if (typeof data.error?.message === "string" && data.error.message.trim()) {
      return data.error.message.trim();
    }

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
  }

  return "";
}

function buildRpcAppError(method, params, reason, extra = {}) {
  return new AppError(`DOGE RPC ${method} failed: ${reason}`, {
    status: 502,
    errors: {
      reason,
      method,
      params,
      ...extra,
    },
  });
}

function isWalletRpcUnavailableError(error) {
  const httpStatus = Number(
    error?.errors?.httpStatus ||
      error?.response?.status ||
      0,
  );
  const rpcCode = Number(
    error?.errors?.rpcCode ??
      error?.response?.data?.error?.code ??
      0,
  );
  const responseText = extractResponseText(error?.errors?.responseBody || error?.response?.data);
  const reason = [
    responseText,
    error?.errors?.reason,
    error?.message,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();

  return (
    httpStatus === 405 ||
    rpcCode === -32601 ||
    reason.includes("method not allowed") ||
    reason.includes("method not found")
  );
}

async function rpc(method, params = []) {
  const { url, username, password } = getRpcConfig();

  const axiosConfig = {
    headers: { "Content-Type": "application/json" },
    timeout: RPC_TIMEOUT_MS,
    auth: { username, password },
  };

  try {
    const response = await axios.post(
      url,
      {
        jsonrpc: "1.0",
        id: String(Date.now()),
        method,
        params,
      },
      axiosConfig,
    );

    if (response.data?.error) {
      const reason =
        extractResponseText(response.data) ||
        `DOGE RPC failed for ${method}`;

      throw buildRpcAppError(method, params, reason, {
        rpcCode: response.data?.error?.code ?? null,
        responseBody: response.data,
        url,
      });
    }

    return response.data?.result;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const httpStatus = Number(error?.response?.status || 0) || null;
    const responseBody = error?.response?.data;
    const reason =
      extractResponseText(responseBody) ||
      error?.message ||
      `DOGE RPC failed for ${method}`;

    throw buildRpcAppError(method, params, reason, {
      httpStatus,
      rpcCode:
        error?.response?.data?.error?.code !== undefined
          ? error.response.data.error.code
          : null,
      responseBody: responseBody ?? null,
      transportCode: error?.code || null,
      url,
    });
  }
}

module.exports = {
  normalizeNetwork,
  rpc,
  isWalletRpcUnavailableError,
  getClient(network) {
    normalizeNetwork(network);
    return {
      rpc,
      validateAddress: (address) => rpc("validateaddress", [address]),
      getBlockchainInfo: () => rpc("getblockchaininfo", []),
      getWalletInfo: () => rpc("getwalletinfo", []),
      listWallets: () => rpc("listwallets", []),
      importAddress: (address, label = "", rescan = false) =>
        rpc("importaddress", [address, label, rescan]),
      listUnspent: (min = 1, max = 9999999, addresses = []) =>
        rpc("listunspent", [min, max, addresses]),
      getRawTransaction: (txid, verbose = true) =>
        rpc("getrawtransaction", [txid, verbose ? 1 : 0]),
      sendRawTransaction: (hex) => rpc("sendrawtransaction", [hex]),
      estimateSmartFee: (blocks = 6) => rpc("estimatesmartfee", [blocks]),
      listSinceBlock: (blockHash = null, confirmations = 1) =>
        rpc("listsinceblock", [blockHash, confirmations]),
      listTransactions: (
        label = "*",
        count = 100,
        skip = 0,
        includeWatchOnly = true,
      ) => rpc("listtransactions", [label, count, skip, includeWatchOnly]),
    };
  },
};
