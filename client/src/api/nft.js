import { apiRequest } from "./client";

function buildListQuery(params = {}) {
  return {
    walletId: params.walletId,
    chain: params.chain,
    page: params.page,
    limit: params.limit,
    showHidden: params.showHidden,
    showSpam: params.showSpam,
    search: params.search,
    contractAddress: params.contractAddress,
    collectionName: params.collectionName,
    standard: params.standard,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };
}

export async function fetchWalletNfts({
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
}) {
  const response = await apiRequest("/nft", {
    query: buildListQuery({
      walletId,
      chain,
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
    }),
  });

  return {
    items: response?.data || [],
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function syncWalletNfts({
  walletId,
  force = false,
}) {
  const response = await apiRequest("/nft/sync", {
    method: "POST",
    body: {
      walletId,
      force,
    },
  });

  return {
    data: response?.data || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function fetchWalletNftCollections({
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
}) {
  const response = await apiRequest("/nft/collections", {
    query: buildListQuery({
      walletId,
      chain,
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
    }),
  });

  return {
    items: response?.data || [],
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function fetchWalletNftCollectionDetail({
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
}) {
  const response = await apiRequest("/nft/collections/detail", {
    query: {
      walletId,
      contractAddress,
      chain,
      page,
      limit,
      showHidden,
      showSpam,
      search,
      standard,
      sortBy,
      sortOrder,
    },
  });

  return {
    collection: response?.data?.collection || null,
    items: response?.data?.items || [],
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function requestWalletNftRefresh({
  walletId,
  chain = "polygon",
  source = "frontend_manual",
}) {
  const response = await apiRequest("/nft/refresh", {
    method: "POST",
    headers: {
      "x-refresh-source": source,
    },
    body: {
      walletId,
      chain,
    },
  });

  return {
    data: response?.data || null,
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function fetchNftById(id) {
  const response = await apiRequest(`/nft/${encodeURIComponent(String(id || ""))}`);

  return {
    item: response?.data || null,
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function fetchNftActivityFeed(id, { page = 1, limit = 20 } = {}) {
  const response = await apiRequest(
    `/nft/${encodeURIComponent(String(id || ""))}/activity`,
    {
      query: {
        page,
        limit,
      },
    },
  );

  return {
    data: response?.data || null,
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function hideNft({ nftId, hidden = true }) {
  const response = await apiRequest("/nft/hide", {
    method: "POST",
    body: {
      nftId,
      hidden,
    },
  });

  return {
    data: response?.data || null,
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function estimateNftTransferFee({
  walletId,
  nftId,
  toAddress,
  amount = "1",
}) {
  const response = await apiRequest("/nft/estimate-fee", {
    method: "POST",
    body: {
      walletId,
      nftId,
      toAddress,
      amount: String(amount),
    },
  });

  return {
    data: response?.data || null,
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function transferNft({
  walletId,
  nftId,
  toAddress,
  amount = "1",
}) {
  const response = await apiRequest("/nft/transfer", {
    method: "POST",
    body: {
      walletId,
      nftId,
      toAddress,
      amount: String(amount),
    },
  });

  return {
    data: response?.data || null,
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

export async function fetchNftSyncStatus({ walletId }) {
  if (!walletId) {
    throw new Error("walletId is required");
  }

  try {
    const response = await apiRequest(`/nft/wallets/${walletId}/sync-status`);

    return {
      success: Boolean(response?.success),
      data: response?.data || null,
    };
  } catch (error) {
    console.error("Failed to fetch NFT sync status", error);

    return {
      success: false,
      data: null,
      error: error?.message || "Unknown error",
    };
  }
}

