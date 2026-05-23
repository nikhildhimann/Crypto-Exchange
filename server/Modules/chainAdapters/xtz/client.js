const axios = require("axios");
const { AppError } = require("../../../helpers/errors");
const logger = require("../../../common/utils/logger");

const DEFAULT_NETWORK = String(process.env.XTZ_DEFAULT_NETWORK || "mainnet").trim().toLowerCase();

function normalizeNetwork(network = DEFAULT_NETWORK) {
  const normalized = String(network || DEFAULT_NETWORK).trim().toLowerCase();
  if (normalized !== "mainnet" && normalized !== "ghostnet") {
    throw AppError.validation(`Unsupported Tezos network "${network}"`);
  }
  return normalized;
}

function getRpcUrl(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  let url;
  if (normalizedNetwork === "mainnet") {
    url = process.env.XTZ_MAINNET_RPC_URL;
  } else if (normalizedNetwork === "ghostnet") {
    url = process.env.XTZ_GHOSTNET_RPC_URL;
  }
  
  const normalized = String(url || "").trim();
  if (!normalized) {
    throw AppError.validation(`RPC URL is required for Tezos ${normalizedNetwork} operations`);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw AppError.validation(`Invalid Tezos RPC URL configured for ${normalizedNetwork}`);
  }

  const hostname = String(parsedUrl.hostname || "").trim().toLowerCase();
  if (hostname === "tzkt.io" || hostname === "ghostnet.tzkt.io" || hostname === "www.tzkt.io") {
    throw AppError.validation(
      `Invalid Tezos RPC URL configured for ${normalizedNetwork}: explorer URL provided instead of node RPC`,
    );
  }

  return normalized.replace(/\/+$/, "");
}

function getTzktUrl(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  return normalizedNetwork === "mainnet" ? "https://api.tzkt.io/v1" : "https://api.ghostnet.tzkt.io/v1";
}

function serializeProviderError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    code: error?.code || null,
    status: Number(error?.response?.status || 0) || null,
    statusText: error?.response?.statusText || null,
    data: error?.response?.data ?? null,
  };
}

function buildTezosProviderAppError(message, stage, error, extra = {}) {
  const providerError = serializeProviderError(error);

  logger.error(message, {
    stage,
    ...extra,
    providerError,
  });

  return new AppError(message, {
    status: 502,
    errors: {
      stage,
      reason: providerError.message,
      providerStatus: providerError.status,
      providerStatusText: providerError.statusText,
      providerCode: providerError.code,
      providerData: providerError.data,
      ...extra,
    },
  });
}

function getClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const tzktUrl = getTzktUrl(normalizedNetwork);
  const resolveRpcUrl = () => getRpcUrl(normalizedNetwork);

  return Object.freeze({
    network: normalizedNetwork,
    get rpcUrl() {
      return resolveRpcUrl();
    },
    tzktUrl,
    async getBalance(address) {
      if (!address) {
        return {
          baseUnitBalance: "0",
          exists: false,
          confirmed: false,
          raw: {
            source: "empty_address",
          },
        };
      }

      try {
        const response = await axios.get(`${tzktUrl}/accounts/${address}`, { timeout: 10000 });
        return {
          baseUnitBalance: String(response.data?.balance || "0"),
          exists: true,
          confirmed: true,
          raw: {
            source: "tzkt",
            account: response.data,
          },
        };
      } catch (tzktError) {
        if (tzktError.response?.status === 404) {
          return {
            baseUnitBalance: "0",
            exists: false,
            confirmed: false,
            raw: {
              source: "tzkt_404",
            },
          };
        }

        logger.warn("Tezos balance read via TzKT failed, falling back to RPC", {
          network: normalizedNetwork,
          address,
          tzktUrl,
          providerError: serializeProviderError(tzktError),
        });

        try {
          const rpcUrl = resolveRpcUrl();
          const response = await axios.get(
            `${rpcUrl}/chains/main/blocks/head/context/contracts/${address}/balance`,
            { timeout: 10000 },
          );

          return {
            baseUnitBalance: String(response.data || "0"),
            exists: true,
            confirmed: true,
            raw: {
              source: "rpc_fallback",
              balance: response.data,
              tzktError: serializeProviderError(tzktError),
            },
          };
        } catch (rpcError) {
          if (rpcError.response?.status === 404) {
            return {
              baseUnitBalance: "0",
              exists: false,
              confirmed: false,
              raw: {
                source: "rpc_404",
                tzktError: serializeProviderError(tzktError),
              },
            };
          }

          throw buildTezosProviderAppError(
            "Failed to fetch Tezos balance",
            "get_balance",
            rpcError,
            {
              network: normalizedNetwork,
              address,
              tzktUrl,
              rpcUrl: (() => {
                try {
                  return resolveRpcUrl();
                } catch (_error) {
                  return null;
                }
              })(),
              tzktError: serializeProviderError(tzktError),
            },
          );
        }
      }
    },
    async getAccountConfig(address) {
      try {
        const rpcUrl = resolveRpcUrl();
        const headRes = await axios.get(`${rpcUrl}/chains/main/blocks/head`, { timeout: 10000 });
        const contractRes = await axios.get(`${rpcUrl}/chains/main/blocks/head/context/contracts/${address}`, { timeout: 10000 });
        const managerRes = await axios.get(`${rpcUrl}/chains/main/blocks/head/context/contracts/${address}/manager_key`, { timeout: 10000 });

        return {
          branch: headRes.data.hash,
          protocol: headRes.data.protocol,
          counter: contractRes.data.counter ? parseInt(contractRes.data.counter, 10) : 0,
          isRevealed: !!managerRes.data
        };
      } catch (error) {
        if (error.response?.status === 404) {
          const rpcUrl = resolveRpcUrl();
          const headRes = await axios.get(`${rpcUrl}/chains/main/blocks/head`, { timeout: 10000 });
          return {
            branch: headRes.data.hash,
            protocol: headRes.data.protocol,
            counter: 0,
            isRevealed: false
          };
        }
        throw buildTezosProviderAppError(
          "Failed to fetch Tezos account context",
          "get_account_config",
          error,
          {
            rpcUrl,
            network: normalizedNetwork,
            address,
          },
        );
      }
    },
    async forgeOperations(branch, operations) {
      try {
        const rpcUrl = resolveRpcUrl();
        const response = await axios.post(`${rpcUrl}/chains/main/blocks/head/helpers/forge/operations`, {
          branch,
          contents: operations
        }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
        return response.data;
      } catch (error) {
        throw buildTezosProviderAppError(
          "Failed to forge Tezos operations",
          "forge_operations",
          error,
          {
            rpcUrl,
            network: normalizedNetwork,
            branch,
            operations,
          },
        );
      }
    },
    async injectOperation(signedOpHex) {
      try {
        const rpcUrl = resolveRpcUrl();
        const response = await axios.post(`${rpcUrl}/injection/operation`, `"${signedOpHex}"`, {
          headers: { "Content-Type": "application/json" },
          timeout: 10000
        });
        return response.data;
      } catch (error) {
        throw buildTezosProviderAppError(
          "Failed to inject Tezos operation",
          "inject_operation",
          error,
          {
            rpcUrl,
            network: normalizedNetwork,
            signedOpHexLength: String(signedOpHex || "").length,
          },
        );
      }
    },
    async fetchHistory(address, limit = 50) {
      try {
        const res = await axios.get(`${tzktUrl}/accounts/${address}/operations`, {
          params: { limit, type: "transaction", "sort.desc": "id" },
          timeout: 15000
        });
        return Array.isArray(res.data) ? res.data : [];
      } catch (error) {
        throw new Error(`Failed to fetch Tezos history: ${error.message}`);
      }
    }
  });
}

module.exports = {
  DEFAULT_NETWORK,
  normalizeNetwork,
  getRpcUrl,
  getClient
};
