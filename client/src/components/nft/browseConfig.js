export const NFT_BROWSE_MODES = {
  INDIVIDUAL: "individual",
  COLLECTION: "collection",
  MARKETPLACE: "marketplace",
};

export const DEFAULT_NFT_BROWSE_MODE = NFT_BROWSE_MODES.INDIVIDUAL;

export const DEFAULT_NFT_LIST_QUERY = {
  page: 1,
  limit: 24,
  search: "",
  contractAddress: "",
  collectionName: "",
  standard: "",
  sortBy: "",
  sortOrder: "desc",
  showHidden: false,
  showSpam: false,
};

export const DEFAULT_NFT_COLLECTION_QUERY = {
  page: 1,
  limit: 24,
  search: "",
  contractAddress: "",
  collectionName: "",
  standard: "",
  sortBy: "",
  sortOrder: "desc",
  showHidden: false,
  showSpam: false,
};

export const DEFAULT_NFT_COLLECTION_DETAIL_QUERY = {
  page: 1,
  limit: 24,
  search: "",
  contractAddress: "",
  collectionName: "",
  standard: "",
  sortBy: "",
  sortOrder: "desc",
  showHidden: false,
  showSpam: false,
};

export const DEFAULT_NFT_MARKETPLACE_LISTINGS_QUERY = {
  page: 1,
  limit: 24,
  contractAddress: "",
  chain: "polygon",
  sortBy: "newest",
  minPrice: "",
  maxPrice: "",
};

export const DEFAULT_NFT_MY_LISTINGS_QUERY = {
  page: 1,
  limit: 24,
  status: "active",
  chain: "",
};

export const DEFAULT_NFT_MY_ORDERS_QUERY = {
  page: 1,
  limit: 24,
  type: "",
  status: "",
  chain: "",
};

export const NFT_STANDARD_FILTER_OPTIONS = [
  { value: "", label: "All standards" },
  { value: "erc721", label: "ERC-721" },
  { value: "erc1155", label: "ERC-1155" },
];

export const NFT_LIST_SORT_OPTIONS = [
  { value: ":desc", label: "Backend default" },
  { value: "lastTransferAt:desc", label: "Recent transfer" },
  { value: "createdAt:desc", label: "Newest created" },
  { value: "name:asc", label: "Name A-Z" },
  { value: "name:desc", label: "Name Z-A" },
];

export const NFT_COLLECTION_SORT_OPTIONS = [
  { value: ":desc", label: "Backend default" },
  { value: "lastTransferAt:desc", label: "Recent activity" },
  { value: "count:desc", label: "Largest collections" },
  { value: "collectionName:asc", label: "Collection A-Z" },
  { value: "createdAt:desc", label: "Newest collection rows" },
];

export const NFT_COLLECTION_DETAIL_SORT_OPTIONS = [
  { value: ":desc", label: "Backend default" },
  { value: "lastTransferAt:desc", label: "Recent transfer" },
  { value: "createdAt:desc", label: "Newest created" },
  { value: "name:asc", label: "Name A-Z" },
  { value: "name:desc", label: "Name Z-A" },
];

export const NFT_MARKETPLACE_SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

export function applyBrowseQueryPatch(
  current,
  patchOrUpdater,
  { resetPage = false } = {},
) {
  const patch =
    typeof patchOrUpdater === "function" ? patchOrUpdater(current) : patchOrUpdater;

  return {
    ...current,
    ...patch,
    page: resetPage ? 1 : patch?.page ?? current.page,
  };
}

export function resolvePaginationTotalPages({
  page = 1,
  totalPages = 0,
  total = 0,
  limit = 24,
  hasMore = false,
} = {}) {
  const normalizedTotalPages = Number(totalPages || 0) || 0;

  if (normalizedTotalPages > 0) {
    return normalizedTotalPages;
  }

  const normalizedTotal = Number(total || 0) || 0;
  const normalizedLimit = Number(limit || 24) || 24;

  if (normalizedTotal > 0) {
    return Math.ceil(normalizedTotal / normalizedLimit);
  }

  return hasMore || page > 1 ? page + 1 : 1;
}
