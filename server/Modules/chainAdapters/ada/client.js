const { AppError } = require("../../../helpers/errors");

const DEFAULT_NETWORK = String(process.env.ADA_DEFAULT_NETWORK || "mainnet")
  .trim()
  .toLowerCase();
const DEFAULT_TIMEOUT_MS = 10000;

function normalizeNetwork(network = DEFAULT_NETWORK) {
  const normalized = String(network || DEFAULT_NETWORK).trim().toLowerCase();

  if (!["mainnet", "preprod"].includes(normalized)) {
    throw AppError.validation(`Unsupported ADA network "${network}"`);
  }

  return normalized;
}

function ensureHttpUrl(url, fieldName) {
  const normalized = String(url || "").trim();

  if (!normalized) {
    throw AppError.validation(`${fieldName} is required for Cardano operations`);
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
      process.env.ADA_MAINNET_API_URL,
      "ADA_MAINNET_API_URL",
    );
  }

  return ensureHttpUrl(
    process.env.ADA_PREPROD_API_URL,
    "ADA_PREPROD_API_URL",
  );
}

function getProjectId(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const projectId =
    normalizedNetwork === "mainnet"
      ? process.env.ADA_MAINNET_PROJECT_ID
      : process.env.ADA_PREPROD_PROJECT_ID;
  const normalized = String(projectId || "").trim();

  if (!normalized || normalized.toLowerCase() === "your_key_here") {
    const fieldName =
      normalizedNetwork === "mainnet"
        ? "ADA_MAINNET_PROJECT_ID"
        : "ADA_PREPROD_PROJECT_ID";
    throw AppError.validation(`${fieldName} is required for Cardano operations`);
  }

  return normalized;
}

async function request(network, path, options = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const baseUrl = getBaseUrl(normalizedNetwork);
  const projectId = getProjectId(normalizedNetwork);
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
        project_id: projectId,
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
          ? `ADA API HTTP ${response.status}: ${body}`
          : `ADA API HTTP ${response.status}`,
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
      `Failed ADA API request for ${normalizedNetwork}: ${
        error instanceof Error ? error.message : String(error)
      }`,
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
    fetchAddressInfo(address) {
      return requestJson(normalizedNetwork, `addresses/${encodeURIComponent(address)}`, {
        allowNotFound: true,
      });
    },
    fetchAddressUtxos(address) {
      return requestJson(normalizedNetwork, `addresses/${encodeURIComponent(address)}/utxos`, {
        allowNotFound: true,
      }).then((value) => (Array.isArray(value) ? value : []));
    },
    fetchAddressTransactions(address, count = 50, page = 1, order = "desc") {
      const params = new URLSearchParams({
        count: String(count),
        page: String(page),
        order: String(order || "desc"),
      });

      return requestJson(
        normalizedNetwork,
        `addresses/${encodeURIComponent(address)}/transactions?${params.toString()}`,
        { allowNotFound: true },
      ).then((value) => (Array.isArray(value) ? value : []));
    },
    fetchTransaction(txHash) {
      return requestJson(normalizedNetwork, `txs/${encodeURIComponent(txHash)}`, {
        allowNotFound: true,
      });
    },
    fetchTransactionUtxos(txHash) {
      return requestJson(normalizedNetwork, `txs/${encodeURIComponent(txHash)}/utxos`, {
        allowNotFound: true,
      });
    },
    fetchLatestBlock() {
      return requestJson(normalizedNetwork, "blocks/latest");
    },
    fetchLatestProtocolParameters() {
      return requestJson(normalizedNetwork, "epochs/latest/parameters");
    },
    fetchNetworkInfo() {
      return requestJson(normalizedNetwork, "network");
    },
    fetchHealth() {
      return requestJson(normalizedNetwork, "health");
    },
    submitTransaction(cborBytes) {
      return requestText(normalizedNetwork, "tx/submit", {
        method: "POST",
        headers: {
          "content-type": "application/cbor",
        },
        body: cborBytes,
      }).then((value) => String(value || "").trim());
    },
  });
}

module.exports = {
  DEFAULT_NETWORK,
  normalizeNetwork,
  getBaseUrl,
  getProjectId,
  getClient,
  request,
  requestJson,
  requestText,
};
