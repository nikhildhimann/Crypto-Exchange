import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  estimateNftTransferFee,
  fetchWalletNfts,
  fetchWalletNftCollections,
  fetchWalletNftCollectionDetail,
  fetchNftActivityFeed,
  fetchNftById,
  hideNft,
  requestWalletNftRefresh,
  syncWalletNfts,
  transferNft,
} from "../api/nft";
import {
  fetchMarketplaceListings,
  fetchMyListings,
  fetchMyOrders,
  listNftForSale,
  buyNft,
  cancelListing,
} from "../api/marketplace";

function normalizeNftChain(chain = "") {
  const normalized = String(chain || "").trim().toLowerCase();
  if (normalized === "polygon" || normalized === "matic") {
    return "polygon";
  }
  return normalized;
}

function normalizeCollectionContractAddress(contractAddress = "") {
  return String(contractAddress || "").trim().toLowerCase();
}

export function buildNftCollectionDetailKey({
  walletId = "",
  chain = "",
  contractAddress = "",
} = {}) {
  const normalizedWalletId = String(walletId || "").trim();
  const normalizedChain = normalizeNftChain(chain);
  const normalizedContractAddress =
    normalizeCollectionContractAddress(contractAddress);

  if (!normalizedWalletId || !normalizedChain || !normalizedContractAddress) {
    return "";
  }

  return `${normalizedWalletId}:${normalizedChain}:${normalizedContractAddress}`;
}

function normalizeNftCollection(item = {}) {
  const chain = item.chain || "";
  const contractAddress = item.contractAddress || "";
  const collectionId =
    item.id ||
    item.collectionId ||
    (chain && contractAddress ? `${chain}:${contractAddress}` : contractAddress) ||
    item.name ||
    "";

  return {
    id: collectionId,
    collectionId,
    chain,
    contractAddress,
    standard: item.standard || "",
    standards: Array.isArray(item.standards) ? item.standards : [],
    name: item.name || item.collectionName || "Unknown Collection",
    collectionName: item.collectionName || item.name || "Unknown Collection",
    symbol: item.symbol || "",
    imageUrl:
      item.previewImageUrl ||
      item.logoUrl ||
      item.previewOriginalImageUrl ||
      item.imageUrl ||
      "",
    previewImageUrl: item.previewImageUrl || item.logoUrl || "",
    logoUrl: item.logoUrl || item.previewImageUrl || "",
    count: Number(item.count || item.itemCount || 0) || 0,
    lastTransferAt: item.lastTransferAt || null,
    lastSyncedAt: item.lastSyncedAt || null,
    isVerified: Boolean(item.isVerified),
    isSpam: Boolean(item.isSpam),
    isHidden: Boolean(item.isHidden),
    raw: item,
  };
}

function normalizeNftItem(item = {}) {
  const collectionName =
    item.collection?.name ||
    item.collectionName ||
    (typeof item.collection === "string" ? item.collection : "") ||
    "";

  return {
    id: item.id || item.appId || item._id || item.nftId || "",
    backendId: item.backendId || item._id || item.nftId || (String(item.id || "").length === 24 ? item.id : "") || "",
    _id: item._id || item.nftId || "",
    appId: item.appId || "",
    chain: item.chain || "",
    walletId: item.walletId || "",
    accountId: item.accountId || "",
    ownerAddress: item.ownerAddress || "",
    contractAddress: item.contractAddress || "",
    tokenId: item.tokenId || "",
    standard: item.standard || "",
    balance: item.balance || "",
    name: item.name || item.title || "",
    description: item.description || "",
    image:
      item.imageOriginalUrl ||
      item.image ||
      item.imageUrl ||
      item.media?.image ||
      item.media?.thumbnail ||
      "",
    imageUrl:
      item.imageOriginalUrl ||
      item.imageUrl ||
      item.image ||
      item.media?.image ||
      item.media?.thumbnail ||
      "",
    thumbnailUrl:
      item.thumbnailUrl ||
      item.media?.thumbnail ||
      item.imageUrl ||
      item.image ||
      "",
    imageOriginalUrl:
      item.imageOriginalUrl ||
      item.imageUrl ||
      item.image ||
      "",
    metadataUrl: item.metadataUrl || "",
    collectionName,
    collection: collectionName,
    collectionId:
      item.collection?.id ||
      item.collectionId ||
      (item.chain && item.contractAddress
        ? `${item.chain}:${item.contractAddress}`
        : "") ||
      "",
    attributes: Array.isArray(item.attributes) ? item.attributes : [],
    isVerified: Boolean(item.isVerified),
    isSpam: Boolean(item.isSpam),
    isHidden: Boolean(item.isHidden),
    lastTransferAt: item.lastTransferAt || null,
    lastSyncedAt: item.lastSyncedAt || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    rawMetadata: item.rawMetadata || null,
    raw: item,
  };
}

function normalizeNftActivityNft(item = {}) {
  return {
    nftId: item.nftId || item._id || "",
    contractAddress: item.contractAddress || "",
    tokenId: item.tokenId || "",
    standard: item.standard || "",
    chain: item.chain || "",
    name: item.name || "",
    imageUrl: item.imageUrl || "",
    collectionName: item.collectionName || "",
    raw: item,
  };
}

function normalizeNftActivityItem(item = {}) {
  return {
    transactionId: item.transactionId || "",
    txHash: item.txHash || "",
    direction: item.direction || "",
    fromAddress: item.fromAddress || "",
    toAddress: item.toAddress || "",
    status: item.status || "",
    chainStatus: item.chainStatus || "",
    standard: item.standard || "",
    contractAddress: item.contractAddress || "",
    tokenId: item.tokenId || "",
    amount: item.amount || "",
    transactionType: item.transactionType || "",
    chain: item.chain || "",
    network: item.network || "",
    chainTimestamp: item.chainTimestamp || null,
    confirmedAt: item.confirmedAt || null,
    createdAt: item.createdAt || null,
    displayTimestamp:
      item.displayTimestamp || item.chainTimestamp || item.confirmedAt || item.createdAt || null,
    explorerUrl: item.explorerUrl || "",
    raw: item,
  };
}

function buildDefaultSyncMeta(sync = {}) {
  return {
    status: String(sync?.status || "idle").trim().toLowerCase() || "idle",
    lastSyncedAt: sync?.lastSyncedAt || null,
    needsRefresh: Boolean(sync?.needsRefresh),
    isSyncing: Boolean(sync?.isSyncing),
    hydrationPending: Boolean(sync?.hydrationPending),
  };
}

function normalizeNftMeta(meta = null, walletId = "") {
  const normalizedMeta = meta && typeof meta === "object" ? meta : {};
  const sync = buildDefaultSyncMeta({
    ...(normalizedMeta.sync || {}),
    lastSyncedAt:
      normalizedMeta?.sync?.lastSyncedAt || normalizedMeta?.lastSyncedAt || null,
  });

  const result = {
    walletId,
    page: Number(normalizedMeta.page || 1) || 1,
    limit: Number(normalizedMeta.limit || 24) || 24,
    total: Number(normalizedMeta.total || 0) || 0,
    hasMore: Boolean(normalizedMeta.hasMore),
    lastSyncedAt: normalizedMeta.lastSyncedAt || sync.lastSyncedAt || null,
    sync,
  };

  if (normalizedMeta.totalPages !== undefined) {
    result.totalPages = Number(normalizedMeta.totalPages || 0) || 0;
  }

  return result;
}

function buildDefaultRefreshState() {
  return {
    loading: false,
    error: null,
    scheduled: false,
    alreadyInFlight: false,
    sync: buildDefaultSyncMeta(),
    lastResponse: null,
  };
}

function buildDefaultActivityState(nftId = "") {
  return {
    nftId,
    nft: null,
    items: [],
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
    loading: false,
    error: null,
  };
}

function buildDefaultCollectionDetailState(params = {}) {
  return {
    key: params.key || "",
    walletId: params.walletId || "",
    chain: params.chain || "",
    contractAddress: params.contractAddress || "",
    collection: null,
    items: [],
    meta: null,
    loading: false,
    error: null,
  };
}

function buildDefaultFeeEstimateState() {
  return {
    loading: false,
    error: null,
    estimate: null,
    recipientAddress: "",
  };
}

function matchesNftId(item, nftId = "") {
  const normalizedNftId = String(nftId || "").trim();

  if (!normalizedNftId || !item || typeof item !== "object") {
    return false;
  }

  return [
    item.backendId,
    item._id,
    item.nftId,
    item.id,
    item?.raw?._id,
  ].some((value) => String(value || "").trim() === normalizedNftId);
}

function patchNftItemVisibility(item, nftId, isHidden) {
  if (!matchesNftId(item, nftId)) {
    return item;
  }

  return {
    ...item,
    isHidden,
    raw: item?.raw && typeof item.raw === "object"
      ? {
          ...item.raw,
          isHidden,
        }
      : item.raw,
  };
}

function patchNftVisibilityAcrossState(state, nftId, isHidden) {
  Object.keys(state.itemsByWalletId).forEach((walletId) => {
    state.itemsByWalletId[walletId] = (state.itemsByWalletId[walletId] || []).map(
      (item) => patchNftItemVisibility(item, nftId, isHidden),
    );
  });

  Object.keys(state.listStateByWalletId).forEach((walletId) => {
    const entry = state.listStateByWalletId[walletId];
    if (!entry) return;

    state.listStateByWalletId[walletId] = {
      ...entry,
      items: (entry.items || []).map((item) =>
        patchNftItemVisibility(item, nftId, isHidden),
      ),
    };
  });

  Object.keys(state.collectionDetailStateByKey).forEach((key) => {
    const entry = state.collectionDetailStateByKey[key];
    if (!entry) return;

    state.collectionDetailStateByKey[key] = {
      ...entry,
      collection: entry.collection,
      items: (entry.items || []).map((item) =>
        patchNftItemVisibility(item, nftId, isHidden),
      ),
    };
  });

  if (matchesNftId(state.selectedItem, nftId)) {
    state.selectedItem = patchNftItemVisibility(state.selectedItem, nftId, isHidden);
  }
}

function mergeWalletSyncIntoMeta(existingMeta, walletId, sync) {
  const normalized = normalizeNftMeta(existingMeta, walletId);
  const nextSync = buildDefaultSyncMeta({
    ...normalized.sync,
    ...sync,
  });

  return {
    ...normalized,
    lastSyncedAt: nextSync.lastSyncedAt || normalized.lastSyncedAt || null,
    sync: nextSync,
  };
}

function serializeRequestError(error, fallbackMessage) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : fallbackMessage;

  return {
    message,
    status: Number(error?.status || 0) || 0,
    payload: error?.payload && typeof error.payload === "object" ? error.payload : null,
  };
}

function normalizeNftTransferResult(item = {}, payload = {}) {
  const nft = item?.nft && typeof item.nft === "object" ? item.nft : null;
  const transaction =
    item?.transaction && typeof item.transaction === "object" ? item.transaction : null;

  return {
    id:
      item.transactionId ||
      transaction?.id ||
      transaction?._id ||
      item.txHash ||
      "",
    transactionId: item.transactionId || transaction?.id || transaction?._id || "",
    walletId: item.walletId || payload.walletId || "",
    nftId: item.nftId || nft?.id || payload.nftId || "",
    chain: item.chain || payload.chain || "",
    network: item.network || "",
    status: item.status || transaction?.status || "pending",
    chainStatus: item.chainStatus || transaction?.chainStatus || "",
    txHash: item.txHash || transaction?.txHash || "",
    fromAddress: item.fromAddress || transaction?.fromAddress || "",
    toAddress: item.toAddress || transaction?.toAddress || payload.toAddress || "",
    submittedAt: item.submittedAt || transaction?.createdAt || "",
    explorerUrl: item.explorerUrl || "",
    nft,
    transaction,
    raw: item,
  };
}

const initialState = {
  itemsByWalletId: {},
  collectionsByWalletId: {},
  listStateByWalletId: {},
  collectionStateByWalletId: {},
  collectionDetailStateByKey: {},
  activityByNftId: {},
  refreshStateByWalletId: {},
  selectedItem: null,
  metaByWalletId: {},
  collectionsMetaByWalletId: {},
  lastSyncedAtByWalletId: {},
  loadingByWalletId: {},
  syncingByWalletId: {},
  collectionsLoadingByWalletId: {},
  errorByWalletId: {},
  syncErrorByWalletId: {},
  visibilityLoadingByNftId: {},
  visibilityErrorByNftId: {},
  lastVisibilityResultByNftId: {},
  feeEstimateByNftId: {},
  transferLoadingByNftId: {},
  transferErrorByNftId: {},
  lastTransferResultByNftId: {},
  selectedItemLoading: false,
  selectedItemError: null,
  selectedWalletId: "",
  syncStatus: {
    status: "idle",
    needsRefresh: false,
    lastSyncedAt: null,
    inProgress: false,
  },
  // Marketplace state
  marketplaceListings: [],
  marketplaceMeta: null,
  marketplaceLoading: false,
  marketplaceError: null,
  myListings: [],
  myListingsMeta: null,
  myListingsLoading: false,
  myListingsError: null,
  myOrders: [],
  myOrdersMeta: null,
  myOrdersLoading: false,
  myOrdersError: null,
  // Marketplace operations
  listNftLoading: false,
  listNftError: null,
  buyNftLoading: false,
  buyNftError: null,
  cancelListingLoading: false,
  cancelListingError: null,
};

export const fetchWalletNftsThunk = createAsyncThunk(
  "nft/fetchWalletNfts",
  async (
    {
      walletId,
      chain,
      page = 1,
      limit = 24,
      showHidden,
      showSpam,
      search,
      contractAddress,
      collectionName,
      standard,
      sortBy,
      sortOrder,
    },
    thunkAPI,
  ) => {
    try {
      const normalizedChain = normalizeNftChain(chain);
      const result = await fetchWalletNfts({
        walletId,
        chain: normalizedChain,
        page,
        limit,
        showHidden,
        showSpam,
        search,
        contractAddress,
        collectionName,
        standard,
        sortBy,
        sortOrder,
      });
      const meta = normalizeNftMeta(result.meta, walletId);

      return {
        walletId,
        chain: normalizedChain,
        items: (result.items || []).map(normalizeNftItem),
        meta,
        message: result.message || "",
      };
    } catch (error) {
      const message = error?.payload?.errors?.chain?.[0] || 
                      error?.payload?.message || 
                      error?.message || 
                      "Failed to fetch wallet NFTs";
      return thunkAPI.rejectWithValue({
        walletId,
        message,
      });
    }
  }
);

export const syncWalletNftsThunk = createAsyncThunk(
  "nft/syncWalletNfts",
  async ({ walletId, force = false }, thunkAPI) => {
    try {
      const result = await syncWalletNfts({ walletId, force });

      return {
        walletId,
        ...(result.data || {}),
        message: result.message || "",
      };
    } catch (error) {
      return thunkAPI.rejectWithValue({
        walletId,
        message: error?.message || "Failed to sync wallet NFTs",
      });
    }
  }
);

export const fetchWalletNftCollectionsThunk = createAsyncThunk(
  "nft/fetchWalletNftCollections",
  async (
    {
      walletId,
      chain,
      page = 1,
      limit = 24,
      showHidden,
      showSpam,
      search,
      contractAddress,
      collectionName,
      standard,
      sortBy,
      sortOrder,
    },
    thunkAPI,
  ) => {
    try {
      const normalizedChain = normalizeNftChain(chain);
      const result = await fetchWalletNftCollections({
        walletId,
        chain: normalizedChain,
        page,
        limit,
        showHidden,
        showSpam,
        search,
        contractAddress,
        collectionName,
        standard,
        sortBy,
        sortOrder,
      });
      const meta = normalizeNftMeta(result.meta, walletId);

      return {
        walletId,
        chain: normalizedChain,
        items: (result.items || []).map(normalizeNftCollection),
        meta,
      };
    } catch (error) {
      const message = error?.payload?.errors?.chain?.[0] || 
                      error?.payload?.message || 
                      error?.message || 
                      "Failed to fetch NFT collections";
      return thunkAPI.rejectWithValue({
        walletId,
        message,
      });
    }
  }
);

export const fetchWalletNftCollectionDetailThunk = createAsyncThunk(
  "nft/fetchWalletNftCollectionDetail",
  async (
    {
      walletId,
      contractAddress,
      chain,
      page = 1,
      limit = 24,
      showHidden,
      showSpam,
      search,
      standard,
      sortBy,
      sortOrder,
    },
    thunkAPI,
  ) => {
    const normalizedChain = normalizeNftChain(chain);
    const normalizedContractAddress =
      normalizeCollectionContractAddress(contractAddress);
    const key = buildNftCollectionDetailKey({
      walletId,
      chain: normalizedChain,
      contractAddress: normalizedContractAddress,
    });

    try {
      const result = await fetchWalletNftCollectionDetail({
        walletId,
        contractAddress: normalizedContractAddress,
        chain: normalizedChain,
        page,
        limit,
        showHidden,
        showSpam,
        search,
        standard,
        sortBy,
        sortOrder,
      });

      return {
        key,
        walletId,
        chain: normalizedChain,
        contractAddress: normalizedContractAddress,
        collection: result.collection ? normalizeNftCollection(result.collection) : null,
        items: (result.items || []).map(normalizeNftItem),
        meta: normalizeNftMeta(result.meta, walletId),
        message: result.message || "",
      };
    } catch (error) {
      return thunkAPI.rejectWithValue({
        key,
        walletId,
        chain: normalizedChain,
        contractAddress: normalizedContractAddress,
        message:
          error?.payload?.message ||
          error?.message ||
          "Failed to fetch NFT collection detail",
      });
    }
  },
);

export const requestWalletNftRefreshThunk = createAsyncThunk(
  "nft/requestWalletNftRefresh",
  async ({ walletId, chain = "polygon", source = "frontend_manual" }, thunkAPI) => {
    try {
      const normalizedChain = normalizeNftChain(chain || "polygon");
      const result = await requestWalletNftRefresh({
        walletId,
        chain: normalizedChain,
        source,
      });
      const data = result.data && typeof result.data === "object" ? result.data : {};

      return {
        walletId,
        chain: normalizedChain,
        scheduled: Boolean(data.scheduled),
        alreadyInFlight: Boolean(data.alreadyInFlight),
        sync: buildDefaultSyncMeta(data.sync),
        message: result.message || "",
      };
    } catch (error) {
      return thunkAPI.rejectWithValue({
        walletId,
        message: error?.payload?.message || error?.message || "Failed to request NFT refresh",
      });
    }
  },
);

export const fetchNftByIdThunk = createAsyncThunk(
  "nft/fetchNftById",
  async (id, thunkAPI) => {
    try {
      const result = await fetchNftById(id);
      return normalizeNftItem(result.item || {});
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error?.message || "Failed to fetch NFT details"
      );
    }
  }
);

export const fetchNftActivityFeedThunk = createAsyncThunk(
  "nft/fetchNftActivityFeed",
  async ({ nftId, page = 1, limit = 20 }, thunkAPI) => {
    try {
      const result = await fetchNftActivityFeed(nftId, { page, limit });
      const data = result.data && typeof result.data === "object" ? result.data : {};

      return {
        nftId,
        nft: data.nft ? normalizeNftActivityNft(data.nft) : null,
        items: (data.items || []).map(normalizeNftActivityItem),
        page: Number(data.page || page) || page,
        limit: Number(data.limit || limit) || limit,
        total: Number(data.total || 0) || 0,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      return thunkAPI.rejectWithValue({
        nftId,
        message:
          error?.payload?.message ||
          error?.message ||
          "Failed to fetch NFT activity",
      });
    }
  },
);

export const hideNftThunk = createAsyncThunk(
  "nft/hideNft",
  async ({ nftId, hidden = true }, thunkAPI) => {
    try {
      const result = await hideNft({ nftId, hidden });
      const data = result.data && typeof result.data === "object" ? result.data : {};

      return {
        nftId: String(data.nftId || nftId).trim(),
        isHidden: Boolean(data.isHidden),
        message: result.message || "",
      };
    } catch (error) {
      return thunkAPI.rejectWithValue({
        nftId,
        message:
          error?.payload?.message ||
          error?.message ||
          "Failed to update NFT visibility",
      });
    }
  },
);

export const estimateNftTransferFeeThunk = createAsyncThunk(
  "nft/estimateNftTransferFee",
  async ({ walletId, nftId, toAddress, amount = "1" }, thunkAPI) => {
    try {
      const result = await estimateNftTransferFee({
        walletId,
        nftId,
        toAddress,
        amount,
      });

      return {
        nftId,
        recipientAddress: String(toAddress || "").trim(),
        estimate:
          result.data && typeof result.data === "object" ? result.data : null,
      };
    } catch (error) {
      return thunkAPI.rejectWithValue({
        nftId,
        recipientAddress: String(toAddress || "").trim(),
        message:
          error?.payload?.message ||
          error?.message ||
          "Failed to estimate NFT transfer fee",
      });
    }
  },
);

export const transferNftThunk = createAsyncThunk(
  "nft/transferNft",
  async ({ walletId, nftId, uiNftId, toAddress, amount = "1" }, { rejectWithValue }) => {
    try {
      const result = await transferNft({
        walletId,
        nftId, // Backend document ID
        toAddress,
        amount,
      });

      return normalizeNftTransferResult(result.data || {}, {
        walletId,
        nftId: uiNftId || nftId,
        toAddress,
      });
    } catch (error) {
      return rejectWithValue({
        nftId: uiNftId || nftId,
        walletId,
        ...serializeRequestError(error, "Failed to submit NFT transfer"),
      });
    }
  },
);

export const fetchMarketplaceListingsThunk = createAsyncThunk(
  "nft/fetchMarketplaceListings",
  async (params, thunkAPI) => {
    try {
      const result = await fetchMarketplaceListings(params);
      return {
        items: result.items || [],
        meta: result.meta || null,
        params,
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(serializeRequestError(error, "Failed to fetch listings"));
    }
  }
);

export const fetchMyMarketplaceListingsThunk = createAsyncThunk(
  "nft/fetchMyMarketplaceListings",
  async (params, thunkAPI) => {
    try {
      const result = await fetchMyListings(params);
      return {
        items: result.items || [],
        meta: result.meta || null,
        params,
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(serializeRequestError(error, "Failed to fetch your listings"));
    }
  }
);

export const fetchMyMarketplaceOrdersThunk = createAsyncThunk(
  "nft/fetchMyMarketplaceOrders",
  async (params, thunkAPI) => {
    try {
      const result = await fetchMyOrders(params);
      return {
        items: result.items || [],
        meta: result.meta || null,
        params,
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(serializeRequestError(error, "Failed to fetch your orders"));
    }
  }
);

export const listNftForSaleThunk = createAsyncThunk(
  "nft/listNftForSale",
  async (params, thunkAPI) => {
    try {
      const result = await listNftForSale(params);
      return {
        data: result.data,
        params,
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(serializeRequestError(error, "Failed to list NFT"));
    }
  }
);

export const buyNftThunk = createAsyncThunk(
  "nft/buyNft",
  async (params, thunkAPI) => {
    try {
      const result = await buyNft(params);
      return {
        data: result.data,
        params,
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(serializeRequestError(error, "Failed to buy NFT"));
    }
  }
);

export const cancelNftListingThunk = createAsyncThunk(
  "nft/cancelNftListing",
  async (params, thunkAPI) => {
    try {
      const result = await cancelListing(params);
      return {
        listingId: params.listingId,
        params,
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(serializeRequestError(error, "Failed to cancel listing"));
    }
  }
);

const nftSlice = createSlice({
  name: "nft",
  initialState,
  reducers: {
    clearSelectedNft(state) {
      state.selectedItem = null;
      state.selectedItemError = null;
      state.selectedItemLoading = false;
    },
    setSelectedNftWalletId(state, action) {
      state.selectedWalletId = String(action.payload || "");
    },
    clearNftTransferState(state, action) {
      const nftId = String(action.payload || "");

      if (!nftId) {
        state.transferLoadingByNftId = {};
        state.transferErrorByNftId = {};
        state.lastTransferResultByNftId = {};
        return;
      }

      delete state.transferLoadingByNftId[nftId];
      delete state.transferErrorByNftId[nftId];
      delete state.lastTransferResultByNftId[nftId];
    },
    clearNftFeeEstimateState(state, action) {
      const nftId = String(action.payload || "");

      if (!nftId) {
        state.feeEstimateByNftId = {};
        return;
      }

      delete state.feeEstimateByNftId[nftId];
    },
    setSyncStatus(state, action) {
      const payload = action.payload || {};

      state.syncStatus = {
        status: payload.status || "idle",
        needsRefresh: Boolean(payload.needsRefresh),
        lastSyncedAt: payload.lastSyncedAt || null,
        inProgress: Boolean(payload.inProgress),
      };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWalletNftsThunk.pending, (state, action) => {
        const walletId = action.meta.arg.walletId;
        state.loadingByWalletId[walletId] = true;
        state.errorByWalletId[walletId] = null;
      })
      .addCase(fetchWalletNftsThunk.fulfilled, (state, action) => {
        const { walletId, items, meta } = action.payload;
        state.loadingByWalletId[walletId] = false;
        state.itemsByWalletId[walletId] = items;
        state.listStateByWalletId[walletId] = {
          items,
          meta,
        };
        state.metaByWalletId[walletId] = meta;
        state.lastSyncedAtByWalletId[walletId] =
          meta?.lastSyncedAt || state.lastSyncedAtByWalletId[walletId] || null;
        state.syncingByWalletId[walletId] = Boolean(meta?.sync?.isSyncing);

        if (state.refreshStateByWalletId[walletId]) {
          state.refreshStateByWalletId[walletId] = {
            ...state.refreshStateByWalletId[walletId],
            sync: buildDefaultSyncMeta(meta?.sync),
          };
        }
      })
      .addCase(fetchWalletNftsThunk.rejected, (state, action) => {
        const walletId = action.payload?.walletId || action.meta.arg.walletId;
        state.loadingByWalletId[walletId] = false;
        state.errorByWalletId[walletId] =
          action.payload?.message || "Failed to fetch wallet NFTs";
      })

      .addCase(syncWalletNftsThunk.pending, (state, action) => {
        const walletId = action.meta.arg?.walletId;
        if (!walletId) return;
        state.syncingByWalletId[walletId] = true;
        state.syncErrorByWalletId[walletId] = null;
      })
      .addCase(syncWalletNftsThunk.fulfilled, (state, action) => {
        const { walletId, lastSyncedAt, items, meta, sync } = action.payload || {};
        if (!walletId) return;

        state.syncingByWalletId[walletId] = false;
        state.syncErrorByWalletId[walletId] = null;

        if (Array.isArray(items)) {
          state.itemsByWalletId[walletId] = items.map(normalizeNftItem);
        }

        const nextMeta = meta
          ? normalizeNftMeta(meta, walletId)
          : mergeWalletSyncIntoMeta(
              state.metaByWalletId[walletId],
              walletId,
              sync || {
                lastSyncedAt: lastSyncedAt || null,
                status: lastSyncedAt ? "success" : "idle",
                needsRefresh: false,
                isSyncing: false,
              },
            );

        state.metaByWalletId[walletId] = nextMeta;
        state.listStateByWalletId[walletId] = {
          items: state.itemsByWalletId[walletId] || [],
          meta: nextMeta,
        };

        const finalSyncedAt = nextMeta.lastSyncedAt || lastSyncedAt || null;
        state.lastSyncedAtByWalletId[walletId] = finalSyncedAt;
        state.refreshStateByWalletId[walletId] = {
          ...buildDefaultRefreshState(),
          ...(state.refreshStateByWalletId[walletId] || {}),
          sync: buildDefaultSyncMeta(nextMeta.sync),
        };
      })
      .addCase(syncWalletNftsThunk.rejected, (state, action) => {
        const walletId = action.meta.arg?.walletId;
        if (!walletId) return;
        state.syncingByWalletId[walletId] = false;
        state.syncErrorByWalletId[walletId] =
          action.payload?.message || action.error?.message || "NFT sync failed";
      })

      .addCase(fetchWalletNftCollectionsThunk.pending, (state, action) => {
        const walletId = action.meta.arg.walletId;
        state.collectionsLoadingByWalletId[walletId] = true;
      })
      .addCase(fetchWalletNftCollectionsThunk.fulfilled, (state, action) => {
        const { walletId, items, meta } = action.payload;
        state.collectionsLoadingByWalletId[walletId] = false;
        state.collectionsByWalletId[walletId] = items || [];
        state.collectionStateByWalletId[walletId] = {
          items: items || [],
          meta,
        };
        state.collectionsMetaByWalletId[walletId] = meta;
        state.lastSyncedAtByWalletId[walletId] =
          meta?.lastSyncedAt || state.lastSyncedAtByWalletId[walletId] || null;

        if (!state.metaByWalletId[walletId] && meta) {
          state.metaByWalletId[walletId] = meta;
        }

        state.syncingByWalletId[walletId] = Boolean(
          state.syncingByWalletId[walletId] || meta?.sync?.isSyncing,
        );

        if (state.refreshStateByWalletId[walletId]) {
          state.refreshStateByWalletId[walletId] = {
            ...state.refreshStateByWalletId[walletId],
            sync: buildDefaultSyncMeta(meta?.sync),
          };
        }
      })
      .addCase(fetchWalletNftCollectionsThunk.rejected, (state, action) => {
        const walletId = action.payload?.walletId || action.meta.arg.walletId;
        state.collectionsLoadingByWalletId[walletId] = false;
      })

      .addCase(fetchWalletNftCollectionDetailThunk.pending, (state, action) => {
        const normalizedChain = normalizeNftChain(action.meta.arg?.chain);
        const normalizedContractAddress = normalizeCollectionContractAddress(
          action.meta.arg?.contractAddress,
        );
        const key = buildNftCollectionDetailKey({
          walletId: action.meta.arg?.walletId,
          chain: normalizedChain,
          contractAddress: normalizedContractAddress,
        });

        if (!key) {
          return;
        }

        state.collectionDetailStateByKey[key] = {
          ...buildDefaultCollectionDetailState({
            key,
            walletId: action.meta.arg?.walletId,
            chain: normalizedChain,
            contractAddress: normalizedContractAddress,
          }),
          ...(state.collectionDetailStateByKey[key] || {}),
          loading: true,
          error: null,
        };
      })
      .addCase(fetchWalletNftCollectionDetailThunk.fulfilled, (state, action) => {
        const { key, walletId, chain, contractAddress, collection, items, meta } =
          action.payload;

        if (!key) {
          return;
        }

        state.collectionDetailStateByKey[key] = {
          ...buildDefaultCollectionDetailState({
            key,
            walletId,
            chain,
            contractAddress,
          }),
          collection,
          items,
          meta,
          loading: false,
          error: null,
        };
        state.lastSyncedAtByWalletId[walletId] =
          meta?.lastSyncedAt || state.lastSyncedAtByWalletId[walletId] || null;
      })
      .addCase(fetchWalletNftCollectionDetailThunk.rejected, (state, action) => {
        const key =
          action.payload?.key ||
          buildNftCollectionDetailKey({
            walletId: action.meta.arg?.walletId,
            chain: action.meta.arg?.chain,
            contractAddress: action.meta.arg?.contractAddress,
          });

        if (!key) {
          return;
        }

        state.collectionDetailStateByKey[key] = {
          ...buildDefaultCollectionDetailState({
            key,
            walletId: action.payload?.walletId || action.meta.arg?.walletId,
            chain:
              action.payload?.chain ||
              normalizeNftChain(action.meta.arg?.chain),
            contractAddress:
              action.payload?.contractAddress ||
              normalizeCollectionContractAddress(action.meta.arg?.contractAddress),
          }),
          ...(state.collectionDetailStateByKey[key] || {}),
          loading: false,
          error:
            action.payload?.message ||
            action.error?.message ||
            "Failed to fetch NFT collection detail",
        };
      })

      .addCase(fetchNftActivityFeedThunk.pending, (state, action) => {
        const nftId = String(action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.activityByNftId[nftId] = {
          ...buildDefaultActivityState(nftId),
          ...(state.activityByNftId[nftId] || {}),
          loading: true,
          error: null,
        };
      })
      .addCase(fetchNftActivityFeedThunk.fulfilled, (state, action) => {
        const { nftId, nft, items, page, limit, total, hasMore } = action.payload;
        if (!nftId) return;

        state.activityByNftId[nftId] = {
          nftId,
          nft,
          items,
          page,
          limit,
          total,
          hasMore,
          loading: false,
          error: null,
        };
      })
      .addCase(fetchNftActivityFeedThunk.rejected, (state, action) => {
        const nftId = String(action.payload?.nftId || action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.activityByNftId[nftId] = {
          ...buildDefaultActivityState(nftId),
          ...(state.activityByNftId[nftId] || {}),
          loading: false,
          error:
            action.payload?.message ||
            action.error?.message ||
            "Failed to fetch NFT activity",
        };
      })

      .addCase(hideNftThunk.pending, (state, action) => {
        const nftId = String(action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.visibilityLoadingByNftId[nftId] = true;
        state.visibilityErrorByNftId[nftId] = null;
      })
      .addCase(hideNftThunk.fulfilled, (state, action) => {
        const { nftId, isHidden, message } = action.payload;
        if (!nftId) return;

        state.visibilityLoadingByNftId[nftId] = false;
        state.visibilityErrorByNftId[nftId] = null;
        state.lastVisibilityResultByNftId[nftId] = {
          nftId,
          isHidden,
          message,
        };
        patchNftVisibilityAcrossState(state, nftId, isHidden);
      })
      .addCase(hideNftThunk.rejected, (state, action) => {
        const nftId = String(action.payload?.nftId || action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.visibilityLoadingByNftId[nftId] = false;
        state.visibilityErrorByNftId[nftId] =
          action.payload?.message ||
          action.error?.message ||
          "Failed to update NFT visibility";
      })

      .addCase(estimateNftTransferFeeThunk.pending, (state, action) => {
        const nftId = String(action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.feeEstimateByNftId[nftId] = {
          ...buildDefaultFeeEstimateState(),
          ...(state.feeEstimateByNftId[nftId] || {}),
          loading: true,
          error: null,
          recipientAddress: String(action.meta.arg?.toAddress || "").trim(),
        };
      })
      .addCase(estimateNftTransferFeeThunk.fulfilled, (state, action) => {
        const { nftId, recipientAddress, estimate } = action.payload;
        if (!nftId) return;

        state.feeEstimateByNftId[nftId] = {
          loading: false,
          error: null,
          estimate,
          recipientAddress,
        };
      })
      .addCase(estimateNftTransferFeeThunk.rejected, (state, action) => {
        const nftId = String(action.payload?.nftId || action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.feeEstimateByNftId[nftId] = {
          ...buildDefaultFeeEstimateState(),
          ...(state.feeEstimateByNftId[nftId] || {}),
          loading: false,
          error:
            action.payload?.message ||
            action.error?.message ||
            "Failed to estimate NFT transfer fee",
          recipientAddress:
            action.payload?.recipientAddress ||
            String(action.meta.arg?.toAddress || "").trim(),
        };
      })

      .addCase(requestWalletNftRefreshThunk.pending, (state, action) => {
        const walletId = action.meta.arg?.walletId;
        if (!walletId) return;

        state.refreshStateByWalletId[walletId] = {
          ...buildDefaultRefreshState(),
          ...(state.refreshStateByWalletId[walletId] || {}),
          loading: true,
          error: null,
        };
        state.syncingByWalletId[walletId] = true;
      })
      .addCase(requestWalletNftRefreshThunk.fulfilled, (state, action) => {
        const { walletId, chain, scheduled, alreadyInFlight, sync } = action.payload || {};
        if (!walletId) return;

        state.refreshStateByWalletId[walletId] = {
          ...buildDefaultRefreshState(),
          ...(state.refreshStateByWalletId[walletId] || {}),
          loading: false,
          error: null,
          scheduled: Boolean(scheduled),
          alreadyInFlight: Boolean(alreadyInFlight),
          sync: buildDefaultSyncMeta(sync),
          lastResponse: {
            walletId,
            chain,
            scheduled: Boolean(scheduled),
            alreadyInFlight: Boolean(alreadyInFlight),
            sync: buildDefaultSyncMeta(sync),
          },
        };

        state.metaByWalletId[walletId] = mergeWalletSyncIntoMeta(
          state.metaByWalletId[walletId],
          walletId,
          sync,
        );
        state.collectionsMetaByWalletId[walletId] = mergeWalletSyncIntoMeta(
          state.collectionsMetaByWalletId[walletId],
          walletId,
          sync,
        );
        Object.keys(state.collectionDetailStateByKey).forEach((key) => {
          const entry = state.collectionDetailStateByKey[key];

          if (!entry || entry.walletId !== walletId) {
            return;
          }

          state.collectionDetailStateByKey[key] = {
            ...entry,
            meta: mergeWalletSyncIntoMeta(entry.meta, walletId, sync),
          };
        });

        if (state.listStateByWalletId[walletId]) {
          state.listStateByWalletId[walletId] = {
            ...state.listStateByWalletId[walletId],
            meta: state.metaByWalletId[walletId],
          };
        }

        if (state.collectionStateByWalletId[walletId]) {
          state.collectionStateByWalletId[walletId] = {
            ...state.collectionStateByWalletId[walletId],
            meta: state.collectionsMetaByWalletId[walletId],
          };
        }

        state.lastSyncedAtByWalletId[walletId] =
          sync?.lastSyncedAt || state.lastSyncedAtByWalletId[walletId] || null;
        state.syncingByWalletId[walletId] = Boolean(sync?.isSyncing || scheduled);
        state.syncErrorByWalletId[walletId] = null;
      })
      .addCase(requestWalletNftRefreshThunk.rejected, (state, action) => {
        const walletId = action.payload?.walletId || action.meta.arg?.walletId;
        if (!walletId) return;

        state.refreshStateByWalletId[walletId] = {
          ...buildDefaultRefreshState(),
          ...(state.refreshStateByWalletId[walletId] || {}),
          loading: false,
          error: action.payload?.message || action.error?.message || "Failed to request NFT refresh",
        };
        state.syncingByWalletId[walletId] = Boolean(
          state.metaByWalletId[walletId]?.sync?.isSyncing ||
          state.collectionsMetaByWalletId[walletId]?.sync?.isSyncing,
        );
      })

      .addCase(fetchNftByIdThunk.pending, (state) => {
        state.selectedItemLoading = true;
        state.selectedItem = null;
        state.selectedItemError = null;
      })
      .addCase(fetchNftByIdThunk.fulfilled, (state, action) => {
        state.selectedItemLoading = false;
        state.selectedItem = action.payload;
      })
      .addCase(fetchNftByIdThunk.rejected, (state, action) => {
        state.selectedItemLoading = false;
        state.selectedItem = null;

        if (action.meta.aborted) {
          state.selectedItemError = null;
          return;
        }

        state.selectedItemError =
          action.payload || action.error?.message || "Failed to fetch NFT details";
      })

      .addCase(transferNftThunk.pending, (state, action) => {
        const nftId = String(action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.transferLoadingByNftId[nftId] = true;
        state.transferErrorByNftId[nftId] = null;
        delete state.lastTransferResultByNftId[nftId];
      })
      .addCase(transferNftThunk.fulfilled, (state, action) => {
        const nftId = String(action.payload?.nftId || action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.transferLoadingByNftId[nftId] = false;
        state.transferErrorByNftId[nftId] = null;
        state.lastTransferResultByNftId[nftId] = action.payload;
      })
      .addCase(transferNftThunk.rejected, (state, action) => {
        const nftId = String(action.payload?.nftId || action.meta.arg?.nftId || "");
        if (!nftId) return;

        state.transferLoadingByNftId[nftId] = false;
        state.transferErrorByNftId[nftId] =
          action.payload?.message ||
          action.error?.message ||
          "Failed to submit NFT transfer";
      })

      // Marketplace Reducers
      .addCase(fetchMarketplaceListingsThunk.pending, (state) => {
        state.marketplaceLoading = true;
        state.marketplaceError = null;
      })
      .addCase(fetchMarketplaceListingsThunk.fulfilled, (state, action) => {
        state.marketplaceLoading = false;
        state.marketplaceListings = action.payload.items;
        state.marketplaceMeta = action.payload.meta;
      })
      .addCase(fetchMarketplaceListingsThunk.rejected, (state, action) => {
        state.marketplaceLoading = false;
        state.marketplaceError = action.payload;
      })

      .addCase(fetchMyMarketplaceListingsThunk.pending, (state) => {
        state.myListingsLoading = true;
        state.myListingsError = null;
      })
      .addCase(fetchMyMarketplaceListingsThunk.fulfilled, (state, action) => {
        state.myListingsLoading = false;
        state.myListings = action.payload.items;
        state.myListingsMeta = action.payload.meta;
      })
      .addCase(fetchMyMarketplaceListingsThunk.rejected, (state, action) => {
        state.myListingsLoading = false;
        state.myListingsError = action.payload;
      })

      .addCase(fetchMyMarketplaceOrdersThunk.pending, (state) => {
        state.myOrdersLoading = true;
        state.myOrdersError = null;
      })
      .addCase(fetchMyMarketplaceOrdersThunk.fulfilled, (state, action) => {
        state.myOrdersLoading = false;
        state.myOrders = action.payload.items;
        state.myOrdersMeta = action.payload.meta;
      })
      .addCase(fetchMyMarketplaceOrdersThunk.rejected, (state, action) => {
        state.myOrdersLoading = false;
        state.myOrdersError = action.payload;
      })

      .addCase(listNftForSaleThunk.pending, (state) => {
        state.listNftLoading = true;
        state.listNftError = null;
      })
      .addCase(listNftForSaleThunk.fulfilled, (state) => {
        state.listNftLoading = false;
      })
      .addCase(listNftForSaleThunk.rejected, (state, action) => {
        state.listNftLoading = false;
        state.listNftError = action.payload;
      })

      .addCase(buyNftThunk.pending, (state) => {
        state.buyNftLoading = true;
        state.buyNftError = null;
      })
      .addCase(buyNftThunk.fulfilled, (state) => {
        state.buyNftLoading = false;
      })
      .addCase(buyNftThunk.rejected, (state, action) => {
        state.buyNftLoading = false;
        state.buyNftError = action.payload;
      })

      .addCase(cancelNftListingThunk.pending, (state) => {
        state.cancelListingLoading = true;
        state.cancelListingError = null;
      })
      .addCase(cancelNftListingThunk.fulfilled, (state, action) => {
        state.cancelListingLoading = false;
        // Optimization: remove from local state if found
        state.marketplaceListings = state.marketplaceListings.filter(l => l.orderId !== action.payload.listingId);
        state.myListings = state.myListings.filter(l => l.orderId !== action.payload.listingId);
      })
      .addCase(cancelNftListingThunk.rejected, (state, action) => {
        state.cancelListingLoading = false;
        state.cancelListingError = action.payload;
      });
  },
});

export const {
  clearSelectedNft,
  setSelectedNftWalletId,
  clearNftTransferState,
  clearNftFeeEstimateState,
  setSyncStatus,
} = nftSlice.actions;

export const selectNftSyncStatus = (state) => state.nft.syncStatus;

export default nftSlice.reducer;
