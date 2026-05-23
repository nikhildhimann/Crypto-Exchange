import { apiRequest } from "./client";

/**
 * Fetches active marketplace listings for a specific NFT contract from OpenSea.
 * @param {Object} params
 * @param {string} params.contractAddress - The NFT contract address.
 * @param {string} [params.chain] - The blockchain network (polygon, ethereum, base).
 * @param {number} [params.page] - Page number for pagination.
 * @param {number} [params.limit] - Number of items per page.
 * @param {string} [params.sortBy] - Sort order (price_asc, price_desc, newest).
 * @param {number} [params.minPrice] - Minimum price filter.
 * @param {number} [params.maxPrice] - Maximum price filter.
 * @returns {Promise<Object>} The normalized response with items and metadata.
 */
export async function fetchMarketplaceListings({
  contractAddress,
  chain,
  page,
  limit,
  sortBy,
  minPrice,
  maxPrice,
}) {
  const response = await apiRequest("/nft/marketplace/listings", {
    query: {
      contractAddress,
      chain,
      page,
      limit,
      sortBy,
      minPrice,
      maxPrice,
    },
  });

  return {
    items: response?.data || [],
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

/**
 * Fetches the active listings created by the authenticated user.
 * @param {Object} params
 * @param {string} [params.status] - Status filter (active, sold, cancelled, expired, all).
 * @param {string} [params.chain] - Filter by blockchain network.
 * @param {number} [params.page] - Page number for pagination.
 * @param {number} [params.limit] - Number of items per page.
 * @returns {Promise<Object>} The normalized response with items and metadata.
 */
export async function fetchMyListings({ status, chain, page, limit }) {
  const response = await apiRequest("/nft/marketplace/my-listings", {
    query: {
      status,
      chain,
      page,
      limit,
    },
  });

  return {
    items: response?.data || [],
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

/**
 * Fetches the order history (buy/sell) for the authenticated user.
 * @param {Object} params
 * @param {string} [params.type] - Order type (buy, sell).
 * @param {string} [params.status] - Order status (pending, confirmed, failed).
 * @param {string} [params.chain] - Filter by blockchain network.
 * @param {number} [params.page] - Page number for pagination.
 * @param {number} [params.limit] - Number of items per page.
 * @returns {Promise<Object>} The normalized response with items and metadata.
 */
export async function fetchMyOrders({ type, status, chain, page, limit }) {
  const response = await apiRequest("/nft/marketplace/orders", {
    query: {
      type,
      status,
      chain,
      page,
      limit,
    },
  });

  return {
    items: response?.data || [],
    meta: response?.meta || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

/**
 * Lists an NFT for sale on the marketplace.
 * @param {Object} params
 * @param {string} params.walletId - The user's wallet ID.
 * @param {string} params.nftId - The NFT asset ID.
 * @param {number} params.priceInMatic - The listing price in MATIC.
 * @param {number} [params.expirationDays] - Listing duration in days.
 * @param {string} [params.chain] - The blockchain network.
 * @returns {Promise<Object>} The normalized response with listing data.
 */
export async function listNftForSale({
  walletId,
  nftId,
  priceInMatic,
  expirationDays,
  chain,
}) {
  const response = await apiRequest("/nft/marketplace/list", {
    method: "POST",
    body: {
      walletId,
      nftId,
      priceInMatic,
      expirationDays,
      chain,
    },
  });

  return {
    data: response?.data || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

/**
 * Purchases an NFT from the marketplace.
 * @param {Object} params
 * @param {string} params.walletId - The user's wallet ID (buyer).
 * @param {string} params.orderId - The OpenSea order hash.
 * @param {string} [params.chain] - The blockchain network.
 * @returns {Promise<Object>} The normalized response with order data.
 */
export async function buyNft({ walletId, orderId, chain }) {
  const response = await apiRequest("/nft/marketplace/buy", {
    method: "POST",
    body: {
      walletId,
      orderId,
      chain,
    },
  });

  return {
    data: response?.data || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}

/**
 * Cancels an active NFT listing.
 * @param {Object} params
 * @param {string} params.walletId - The user's wallet ID (owner).
 * @param {string} params.listingId - The ID of the local listing document.
 * @returns {Promise<Object>} The normalized response.
 */
export async function cancelListing({ walletId, listingId }) {
  const response = await apiRequest(`/nft/marketplace/listings/${listingId}`, {
    method: "DELETE",
    body: {
      walletId,
    },
  });

  return {
    data: response?.data || null,
    message: response?.message || "",
    success: Boolean(response?.success),
  };
}
