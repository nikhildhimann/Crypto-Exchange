const { AppError } = require("../../../helpers/errors");

const DEFAULT_NETWORK = String(process.env.BTC_DEFAULT_NETWORK || "mainnet").trim().toLowerCase();
const DEFAULT_TIMEOUT_MS = 10000;

function normalizeNetwork(network = DEFAULT_NETWORK) {
  const normalized = String(network || DEFAULT_NETWORK).trim().toLowerCase();

  if (!["mainnet", "testnet"].includes(normalized)) {
    throw AppError.validation(`Unsupported BTC network "${network}"`);
  }

  return normalized;
}

function ensureHttpUrl(url, fieldName) {
  const normalized = String(url || "").trim();

  if (!normalized) {
    throw AppError.validation(`${fieldName} is required for Bitcoin operations`);
  }

  if (!/^https?:\/\//.test(normalized)) {
    throw AppError.validation(`${fieldName} must be a valid HTTP or HTTPS URL`);
  }

  return normalized.replace(/\/+$/, "");
}

function getBaseUrl(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (normalizedNetwork === "mainnet") {
    return ensureHttpUrl(
      process.env.BTC_MAINNET_API_URL,
      "BTC_MAINNET_API_URL",
    );
  }

  return ensureHttpUrl(
    process.env.BTC_TESTNET_API_URL,
    "BTC_TESTNET_API_URL",
  );
}

async function request(network, path, options = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const baseUrl = getBaseUrl(normalizedNetwork);
  const normalizedPath = String(path || "").trim().replace(/^\/+/, "");
  const url = `${baseUrl}/${normalizedPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const method = String(options.method || "GET").toUpperCase();
  const responseType = options.responseType === "text" ? "text" : "json";

  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: responseType === "json" ? "application/json" : "*/*",
        ...(options.headers && typeof options.headers === "object" ? options.headers : {}),
      },
      body: options.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      if (response.status === 404 && options.allowNotFound === true) {
        return null;
      }

      throw new Error(
        body
          ? `BTC API HTTP ${response.status}: ${body}`
          : `BTC API HTTP ${response.status}`,
      );
    }

    if (responseType === "text") {
      return response.text();
    }

    return response.json();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new Error(
      `Failed BTC API request for ${normalizedNetwork}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function requestJson(network, path, options = {}) {
  return request(network, path, {
    ...options,
    responseType: "json",
  });
}

function requestText(network, path, options = {}) {
  return request(network, path, {
    ...options,
    responseType: "text",
  });
}

function getClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const baseUrl = getBaseUrl(normalizedNetwork);

  return Object.freeze({
    network: normalizedNetwork,
    baseUrl,
    fetchAddressSummary(address) {
      return requestJson(normalizedNetwork, `address/${encodeURIComponent(address)}`);
    },
    fetchAddressUtxos(address) {
      return requestJson(normalizedNetwork, `address/${encodeURIComponent(address)}/utxo`);
    },
    fetchAddressTransactions(address) {
      return requestJson(normalizedNetwork, `address/${encodeURIComponent(address)}/txs`);
    },
    fetchAddressTransactionsChain(address, lastSeenTxId) {
      return requestJson(
        normalizedNetwork,
        `address/${encodeURIComponent(address)}/txs/chain/${encodeURIComponent(lastSeenTxId)}`,
      );
    },
    fetchFeeEstimates() {
      return requestJson(normalizedNetwork, "fee-estimates");
    },
    fetchTipHeight() {
      return requestText(normalizedNetwork, "blocks/tip/height").then((value) => {
        const parsed = Number.parseInt(String(value || "").trim(), 10);
        return Number.isFinite(parsed) ? parsed : 0;
      });
    },
    fetchTransaction(txHash) {
      return requestJson(normalizedNetwork, `tx/${encodeURIComponent(txHash)}`, {
        allowNotFound: true,
      });
    },
    fetchTransactionHex(txHash) {
      return requestText(normalizedNetwork, `tx/${encodeURIComponent(txHash)}/hex`, {
        allowNotFound: true,
      });
    },
    broadcastTransaction(hex) {
      return requestText(normalizedNetwork, "tx", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: String(hex || "").trim(),
      }).then((value) => String(value || "").trim());
    },
  });
}

module.exports = {
  DEFAULT_NETWORK,
  normalizeNetwork,
  getBaseUrl,
  getClient,
  request,
  requestJson,
  requestText,
};
