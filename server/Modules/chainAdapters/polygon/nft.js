const { getAddress } = require("ethers");

const logger = require("../../../common/utils/logger");
const { AppError } = require("../../../helpers/errors");
const {
  buildNftHistoryUniqueKey,
} = require("../../nft/history.utils");
const walletAdapter = require("./wallet");

const MAINNET_NETWORK = "mainnet";
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15000;

function normalizeNetwork(network = MAINNET_NETWORK) {
  const normalized = String(network || MAINNET_NETWORK)
    .trim()
    .toLowerCase();

  if (normalized !== MAINNET_NETWORK) {
    throw AppError.validation(`Unsupported Polygon NFT network "${network}"`);
  }

  return normalized;
}

function getApiKey() {
  const apiKey = String(process.env.ALCHEMY_API_KEY || "").trim();
  if (!apiKey) {
    throw AppError.validation(
      "ALCHEMY_API_KEY is required for Polygon NFT operations",
    );
  }

  return apiKey;
}

function getBaseUrl(network = MAINNET_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const configured = String(
    process.env.ALCHEMY_POLYGON_NFT_BASE_URL || "",
  ).trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const apiKey = getApiKey();

  if (normalizedNetwork !== MAINNET_NETWORK) {
    throw AppError.validation(`Unsupported Polygon NFT network "${network}"`);
  }

  return `https://polygon-mainnet.g.alchemy.com/nft/v3/${apiKey}`;
}

function normalizePageSize(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_PAGE_SIZE).trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function normalizeOwnerAddress(address) {
  const normalized = String(address || "").trim();

  if (!normalized) {
    throw AppError.validation("Owner address is required");
  }

  if (!walletAdapter.validateAddress(normalized)) {
    throw AppError.validation("Invalid Polygon wallet address");
  }

  return getAddress(normalized);
}

function buildRequestUrl(pathname, query = {}, network = MAINNET_NETWORK) {
  const baseUrl = getBaseUrl(network);
  const url = new URL(`${baseUrl}/${pathname.replace(/^\/+/, "")}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null || item === "") {
          return;
        }

        url.searchParams.append(key, String(item));
      });
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url;
}

function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    String(error?.message || "")
      .toLowerCase()
      .includes("aborted")
  );
}

async function requestAlchemy(pathname, query = {}, network = MAINNET_NETWORK) {
  const url = buildRequestUrl(pathname, query, network);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: abortController.signal,
      headers: {
        accept: "application/json",
      },
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_error) {
      payload = null;
    }

    if (!response.ok) {
      const providerMessage =
        payload?.error?.message ||
        payload?.message ||
        `Alchemy NFT API responded with HTTP ${response.status}`;

      logger.error("Alchemy NFT request failed", {
        event: "alchemy_nft_request_failed",
        status: response.status,
        pathname,
        origin: url.origin,
        providerMessage,
      });

      throw new AppError("Failed to fetch Polygon NFTs from provider", {
        status: response.status >= 500 ? 502 : response.status,
        errors: {
          provider: "alchemy",
          providerMessage,
          status: response.status,
        },
      });
    }

    if (!payload || typeof payload !== "object") {
      throw new AppError("Invalid Polygon NFT provider response", {
        status: 502,
        errors: {
          provider: "alchemy",
          pathname,
        },
      });
    }

    logger.info("Alchemy NFT response received", {
      event: "alchemy_nft_response_received",
      status: response.status,
      pathname,
      owner: query.owner,
      nftCount: Array.isArray(payload?.ownedNfts) ? payload.ownedNfts.length : 0,
      hasPageKey: Boolean(payload?.pageKey),
      rawResponse: payload, // Logging full payload for debug (sanitize if needed in production)
    });

    return payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new AppError("Polygon NFT provider request timed out", {
        status: 504,
        errors: {
          provider: "alchemy",
          pathname,
        },
      });
    }

    logger.error("Alchemy NFT request crashed", {
      event: "alchemy_nft_request_crashed",
      pathname,
      message: error.message,
    });

    throw new AppError("Polygon NFT provider is currently unavailable", {
      status: 502,
      errors: {
        provider: "alchemy",
        reason: error.message,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getOwnedNFTs({
  ownerAddress,
  pageKey = "",
  pageSize = DEFAULT_PAGE_SIZE,
  network,
} = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedOwnerAddress = normalizeOwnerAddress(ownerAddress);
  const normalizedPageSize = normalizePageSize(pageSize);

  const query = {
    owner: normalizedOwnerAddress,
    pageSize: normalizedPageSize,
    pageKey: String(pageKey || "").trim() || undefined,
    withMetadata: true,
    orderBy: "transferTime",
  };

  logger.info("Fetching NFTs from Alchemy", {
    event: "alchemy_get_owned_nfts_start",
    owner: normalizedOwnerAddress,
    network: normalizedNetwork,
    filters: query["excludeFilters[]"],
  });

  const payload = await requestAlchemy(
    "getNFTsForOwner",
    query,
    normalizedNetwork,
  );

  const ownedNfts = Array.isArray(payload.ownedNfts) ? payload.ownedNfts : [];

  return {
    items: ownedNfts,
    pageKey: String(payload.pageKey || "").trim() || null,
  };
}

function getTransfersBaseUrl(network = MAINNET_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const configured = String(process.env.ALCHEMY_POLYGON_BASE_URL || "").trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const apiKey = getApiKey();

  if (normalizedNetwork !== MAINNET_NETWORK) {
    throw AppError.validation(`Unsupported Polygon network "${network}"`);
  }

  return `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`;
}

async function withRetry(operation, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      attempt++;
      const isAbort = isAbortError(error);
      const status = error.status || error.details?.status || 500;
      const isRetryable =
        isAbort ||
        status === 429 ||
        status === 408 ||
        status >= 500 ||
        String(error.message).toLowerCase().includes("timed out");

      if (!isRetryable || attempt > maxRetries) {
        throw error;
      }

      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

async function requestAlchemyTransfers(payloadData, network = MAINNET_NETWORK) {
  const baseUrl = getTransfersBaseUrl(network);
  const url = new URL(baseUrl);

  return withRetry(async () => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

    try {
    const response = await fetch(url, {
      method: "POST",
      signal: abortController.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payloadData),
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_error) {
      payload = null;
    }

    if (!response.ok) {
      const providerMessage =
        payload?.error?.message ||
        payload?.message ||
        `Alchemy transfers API responded with HTTP ${response.status}`;

      logger.error("Alchemy transfers request failed", {
        event: "alchemy_transfers_request_failed",
        status: response.status,
        origin: url.origin,
        providerMessage,
      });

      throw new AppError("Failed to fetch Polygon transfers from provider", {
        status: response.status === 429 ? 429 : (response.status >= 500 ? 502 : response.status),
        errors: {
          provider: "alchemy",
          providerMessage,
          status: response.status,
        },
      });
    }

    if (!payload || typeof payload !== "object") {
      throw new AppError("Invalid Polygon transfers provider response", {
        status: 502,
        errors: {
          provider: "alchemy",
        },
      });
    }

    if (payload.error) {
      throw new AppError("Polygon transfers provider returned JSONRPC error", {
        status: 502,
        errors: {
          provider: "alchemy",
          reason: payload.error.message || "Unknown JSONRPC error",
        },
      });
    }

    logger.info("Alchemy transfers response received", {
      event: "alchemy_transfers_response_received",
      status: response.status,
      transfersCount: Array.isArray(payload?.result?.transfers)
        ? payload.result.transfers.length
        : 0,
    });

    return payload.result;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new AppError("Polygon transfers provider request timed out", {
        status: 504,
        errors: {
          provider: "alchemy",
        },
      });
    }

    logger.error("Alchemy transfers request crashed", {
      event: "alchemy_transfers_request_crashed",
      message: error.message,
    });

      throw new AppError("Polygon transfers provider is currently unavailable", {
        status: 502,
        errors: {
          provider: "alchemy",
          reason: error.message,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }, 3);
}

async function fetchTransferHistory({ address, network, fromBlock, toBlock, limit = 100 } = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedAddress = normalizeOwnerAddress(address).toLowerCase();
  
  const batchSize = Math.min(limit, 1000);
  const hexCount = "0x" + Number(batchSize).toString(16);

  const baseConfig = {
    id: 1,
    jsonrpc: "2.0",
    method: "alchemy_getAssetTransfers",
    params: [
      {
        fromBlock: fromBlock || "0x0",
        toBlock: toBlock || "latest",
        category: ["erc721", "erc1155"],
        withMetadata: true,
        excludeZeroValue: true,
        maxCount: hexCount,
        order: "desc",
      },
    ],
  };

  const getOutgoing = {
    ...baseConfig,
    params: [
      {
        ...baseConfig.params[0],
        fromAddress: normalizedAddress,
      },
    ],
  };

  const getIncoming = {
    ...baseConfig,
    params: [
      {
        ...baseConfig.params[0],
        toAddress: normalizedAddress,
      },
    ],
  };

  async function fetchAccountTransfers(config) {
    let allTransfers = [];
    let pageKey = undefined;

    while (allTransfers.length < limit) {
      const currentConfig = { ...config };
      if (pageKey) {
        currentConfig.params = [{ ...currentConfig.params[0], pageKey }];
      }

      const result = await requestAlchemyTransfers(currentConfig, normalizedNetwork);
      const transfers = Array.isArray(result?.transfers) ? result.transfers : [];
      
      if (transfers.length === 0) {
        break;
      }
      
      allTransfers.push(...transfers);

      if (!result.pageKey) {
        break;
      }
      pageKey = result.pageKey;
    }
    
    return allTransfers.slice(0, limit);
  }

  const [outgoingTransfers, incomingTransfers] = await Promise.all([
    fetchAccountTransfers(getOutgoing),
    fetchAccountTransfers(getIncoming),
  ]);

  const rawEvents = [
    ...outgoingTransfers.map((t) => ({ ...t, _assumedDirection: "outgoing" })),
    ...incomingTransfers.map((t) => ({ ...t, _assumedDirection: "incoming" })),
  ];

  function normalizeTokenId(rawTokenId) {
    let tokenId = "";
    if (rawTokenId !== null && rawTokenId !== undefined) {
      const stringTokenId = String(rawTokenId).trim();
      if (stringTokenId.startsWith("0x")) {
        try {
          tokenId = BigInt(stringTokenId).toString();
        } catch (e) {
          tokenId = "";
        }
      } else if (/^\d+$/.test(stringTokenId)) {
        tokenId = stringTokenId;
      }
    }
    return tokenId;
  }

  function normalizeDirection(rawDirection, fromAddress, toAddress) {
    if (fromAddress === normalizedAddress && toAddress !== normalizedAddress) {
      return "outgoing";
    } else if (
      toAddress === normalizedAddress &&
      fromAddress !== normalizedAddress
    ) {
      return "incoming";
    }
    return rawDirection;
  }

  const normalized = [];
  const dedup = new Set();

  const flattenedTransfers = rawEvents.flatMap((raw) => {
    const base = {
      chain: "polygon",
      txHash: String(raw.hash || "").toLowerCase().trim(),
      logIndex: raw.logIndex, // Add support for logIndex
      fromAddress: String(raw.from || "").toLowerCase().trim(),
      toAddress: String(raw.to || "").toLowerCase().trim(),
      contractAddress: String(raw.rawContract?.address || raw.asset || "").toLowerCase().trim(),
      blockNum: raw.blockNum,
      timestamp: raw.metadata?.blockTimestamp,
      _assumedDirection: raw._assumedDirection,
      raw
    };

    if (raw.category === "erc1155" && Array.isArray(raw.erc1155Metadata) && raw.erc1155Metadata.length > 0) {
      return raw.erc1155Metadata.map((item) => {
         let transferAmount = "1";
         try {
             transferAmount = BigInt(item.value || "0x1").toString();
         } catch {
             transferAmount = "1";
         }
         return {
          ...base,
          rawTokenId: item.tokenId,
          amount: transferAmount,
          standard: "erc1155"
        }
      });
    }

    // Default or ERC721 or ERC1155 missing metadata
    return [{
      ...base,
      rawTokenId: raw.tokenId || raw.erc721TokenId || (raw.erc1155Metadata && raw.erc1155Metadata.length > 0 ? raw.erc1155Metadata[0].tokenId : null),
      amount: raw.value || "1",
      standard: raw.category || "erc721"
    }];
  });

  for (const item of flattenedTransfers) {
    const txHash = item.txHash;
    const fromAddress = item.fromAddress;
    const toAddress = item.toAddress;
    const contractAddress = item.contractAddress;
    const standard = item.standard;
    const transferAmount = item.amount;
    const logIndex = item.logIndex;
    const raw = item.raw;
    
    const tokenId = normalizeTokenId(item.rawTokenId);
    const direction = normalizeDirection(item._assumedDirection, fromAddress, toAddress);

    if (!txHash || !contractAddress || !tokenId || !direction) {
      continue;
    }

    let historyUniqueKey;
    try {
      historyUniqueKey = buildNftHistoryUniqueKey({
        txHash,
        contractAddress,
        tokenId,
        direction,
        standard,
      });
      // Append logIndex if available to prevent collapsing batches of the same token
      if (logIndex !== undefined && logIndex !== null) {
          historyUniqueKey += `:${logIndex}`;
      }
    } catch (error) {
      logger.warn("Skipping malformed Polygon NFT transfer history event", {
        event: "polygon_nft_history_key_failed",
        txHash: txHash || null,
        contractAddress: contractAddress || null,
        tokenId: tokenId || null,
        direction: direction || null,
        standard: standard || null,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (dedup.has(historyUniqueKey)) {
      continue;
    }

    dedup.add(historyUniqueKey);

    let chainTimestamp = null;
    if (item.timestamp) {
      const parsedTime = new Date(item.timestamp);
      if (!Number.isNaN(parsedTime.getTime())) {
        chainTimestamp = parsedTime;
      }
    }

    let blockNum = null;
    if (item.blockNum) {
      blockNum = parseInt(item.blockNum, 16);
      if (Number.isNaN(blockNum)) {
        blockNum = null;
      }
    }

    const cleanedRaw = { ...raw };
    delete cleanedRaw._assumedDirection;

    normalized.push({
      txHash,
      logIndex,
      fromAddress,
      toAddress,
      contractAddress,
      tokenId,
      assetType: "nft",
      standard,
      transferAmount,
      amount: transferAmount,
      amountBaseUnits: transferAmount,
      direction,
      chainTimestamp,
      blockNum,
      validated: true,
      succeeded: true,
      chainStatus: "confirmed",
      historyUniqueKey,
      raw: cleanedRaw,
    });
  }

  normalized.sort((a, b) => {
    const aBlock = a.blockNum || 0;
    const bBlock = b.blockNum || 0;
    if (bBlock !== aBlock) {
      return bBlock - aBlock;
    }
    return a.txHash.localeCompare(b.txHash);
  });

  return normalized;
}

module.exports = {
  normalizeNetwork,
  normalizeOwnerAddress,
  requestAlchemy,
  getOwnedNFTs,
  fetchTransferHistory,
};
