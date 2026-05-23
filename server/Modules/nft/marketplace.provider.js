const axios = require("axios");
const { ethers } = require("ethers");
const { Alchemy, Network } = require("alchemy-sdk");
const { AppError } = require("../../helpers/errors");
const logger = require("../../common/utils/logger");
const {
  getChainConfig,
  getOpenSeaChainName,
} = require("./marketplace.chainConfig");

/**
 * Fetches listings from OpenSea for a specific contract.
 * @param {Object} options - Options for the request.
 * @param {string} options.contractAddress - The smart contract address.
 * @param {string} options.chainName - The chain identifier (e.g., 'polygon').
 * @param {number} [options.limit=20] - Number of items to return.
 * @param {string} [options.sortBy='eth_price'] - Sort parameter ('eth_price' or 'created_date').
 * @param {string} [options.sortDirection='asc'] - Sort direction ('asc' or 'desc').
 * @returns {Promise<Array<Object>>} - Array of mapped listing objects.
 */
const fetchListings = async ({
  contractAddress,
  chainName,
  limit = 20,
  sortBy = "newest",
}) => {
  try {
    const chainConfig = getChainConfig(chainName);
    const baseUrl =
      process.env.OPENSEA_BASE_URL || "https://api.opensea.io/api/v2";

    // Step 1 — contract address se collection slug nikalo
    const contractResp = await axios.get(
      `${baseUrl}/chain/${getOpenSeaChainName(chainName)}/contract/${contractAddress}`,
      {
        headers: { "x-api-key": process.env.OPENSEA_API_KEY },
        timeout: 10000,
      },
    );
    const slug = contractResp.data?.collection;
    if (!slug) throw new Error("Collection slug not found for this contract");

    // Step 2 — slug se listings fetch karo
    const listingsResp = await axios.get(
      `${baseUrl}/listings/collection/${slug}/all`,
      {
        headers: { "x-api-key": process.env.OPENSEA_API_KEY },
        params: { limit },
        timeout: 10000,
      },
    );

    const listings = listingsResp.data?.listings || [];

    return listings.map((listing) => {
      const parameters = listing.protocol_data?.parameters;
      const offer = parameters?.offer?.[0];
      return {
        orderId: listing.order_hash,
        priceInWei: listing.price?.current?.value || "0",
        currency: chainConfig.nativeCurrency.symbol,
        seller: listing.maker?.address || parameters?.offerer,
        expiresAt: new Date(
          (listing.expiration_time || parameters?.endTime) * 1000,
        ),
        source: "opensea",
        token: {
          contractAddress: offer?.token || contractAddress,
          tokenId: offer?.identifierOrCriteria || null,
        },
        rawOrderData: listing.protocol_data,
      };
    });
  } catch (error) {
    logger.warn("OpenSea listings fetch failed, no fallback available", {
      event: "opensea_fetch_listings_failed",
      error: error.message,
    });
    throw AppError.internal("Failed to fetch marketplace listings");
  }
};

/**
 * Fetches the floor price of a collection. Prioritizes OpenSea, falls back to Alchemy.
 * @param {Object} options - Options for the request.
 * @param {string} options.contractAddress - The smart contract address.
 * @param {string} options.chainName - The chain identifier.
 * @returns {Promise<Object|null>} - Floor price details or null if both APIs fail.
 */
const fetchFloorPrice = async ({ contractAddress, chainName }) => {
  const chainConfig = getChainConfig(chainName);
  const openSeaChain = getOpenSeaChainName(chainName);
  const baseUrl =
    process.env.OPENSEA_BASE_URL || "https://api.opensea.io/api/v2";

  try {
    // Step A: Get Collection Slug
    const contractResponse = await axios.get(
      `${baseUrl}/chain/${openSeaChain}/contract/${contractAddress}`,
      {
        headers: { "x-api-key": process.env.OPENSEA_API_KEY },
        timeout: 10000,
      },
    );

    const slug = contractResponse.data?.collection;
    if (!slug) {
      throw new Error("No collection slug found in OpenSea response");
    }

    // Step B: Get Collection Stats
    const statsResponse = await axios.get(
      `${baseUrl}/collections/${slug}/stats`,
      {
        headers: { "x-api-key": process.env.OPENSEA_API_KEY },
        timeout: 10000,
      },
    );

    const floorPrice = statsResponse.data?.total?.floor_price;
    if (floorPrice !== undefined && floorPrice !== null) {
      return {
        floorPriceMatic: String(floorPrice),
        floorPriceInWei: ethers.parseEther(String(floorPrice)).toString(),
        currency: chainConfig.nativeCurrency.symbol,
        source: "opensea",
      };
    }
    throw new Error("Floor price not found in OpenSea stats");
  } catch (error) {
    logger.warn("OpenSea floor price failed, trying Alchemy fallback", {
      event: "opensea_floor_price_failed",
      error: error.message,
    });

    try {
      const alchemy = new Alchemy({
        apiKey: process.env.ALCHEMY_API_KEY,
        network: chainConfig.alchemyNetwork,
      });
      const resp = await alchemy.nft.getFloorPrice(contractAddress);

      const floorPrice = resp?.openSea?.floorPrice;
      if (floorPrice !== undefined && floorPrice !== null && floorPrice > 0) {
        return {
          floorPriceMatic: String(floorPrice),
          floorPriceInWei: ethers.parseEther(String(floorPrice)).toString(),
          currency: chainConfig.nativeCurrency.symbol,
          source: "alchemy",
        };
      }
    } catch (alchemyError) {
      logger.warn("Alchemy floor price fallback failed", {
        event: "alchemy_floor_price_failed",
        error: alchemyError.message,
      });
    }
  }

  return null; // Return null if both paths failed
};

/**
 * Fetches a specific order by its order hash from OpenSea.
 * @param {Object} options - Options for the request.
 * @param {string} options.orderId - The OpenSea order hash.
 * @param {string} options.chainName - The chain identifier.
 * @returns {Promise<Object>} - The raw order object from OpenSea.
 * @throws {AppError} - If the order is not found.
 */
const fetchOrderByHash = async ({ orderId, chainName }) => {
  const openSeaChain = getOpenSeaChainName(chainName);
  const baseUrl =
    process.env.OPENSEA_BASE_URL || "https://api.opensea.io/api/v2";

  try {
    const response = await axios.get(
      `${baseUrl}/orders/${openSeaChain}/seaport/listings`,
      {
        headers: { "x-api-key": process.env.OPENSEA_API_KEY },
        params: { order_hash: orderId },
        timeout: 10000,
      },
    );

    const orders = response.data.orders || [];
    if (orders.length === 0) {
      throw AppError.notFound("Listing is no longer available");
    }

    return orders[0];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.warn("Failed to fetch order by hash", {
      event: "opensea_fetch_order_missing",
      orderId,
      error: error.message,
    });
    throw AppError.notFound("Listing is no longer available");
  }
};

/**
 * Publishes a signed Seaport listing to OpenSea.
 * @param {Object} options - Options for the request.
 * @param {Object} options.parameters - The Seaport order parameters.
 * @param {string} options.signature - The cryptographic signature.
 * @param {string} options.chainName - The chain identifier.
 * @returns {Promise<Object>} - The full response data from OpenSea.
 * @throws {AppError} - If publishing fails.
 */
const postSignedListing = async ({ parameters, signature, chainName }) => {
  const openSeaChain = getOpenSeaChainName(chainName);
  const baseUrl =
    process.env.OPENSEA_BASE_URL || "https://api.opensea.io/api/v2";

  try {
    const response = await axios.post(
      `${baseUrl}/orders/${openSeaChain}/seaport/listings`,
      { parameters, signature },
      {
        headers: {
          "x-api-key": process.env.OPENSEA_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    return response.data;
  } catch (error) {
    logger.warn("Failed to publish listing to marketplace", {
      event: "opensea_post_listing_failed",
      error: error.response?.data || error.message,
    });
    throw AppError.internal("Failed to publish listing to marketplace");
  }
};

/**
 * Fetches fulfillment data from OpenSea for a specific listing.
 * Used to get the transaction parameters for purchasing.
 * @param {Object} options - Options for the request.
 * @param {string} options.orderHash - The OpenSea order hash.
 * @param {string} options.fulfillerAddress - The wallet address that will buy the NFT.
 * @param {string} options.chainName - The chain identifier.
 * @returns {Promise<Object>} - Fulfillment data (transaction parameters).
 */
const fetchFulfillmentData = async ({
  orderHash,
  fulfillerAddress,
  chainName,
}) => {
  const openSeaChain = getOpenSeaChainName(chainName);
  const baseUrl =
    process.env.OPENSEA_BASE_URL || "https://api.opensea.io/api/v2";

  try {
    const response = await axios.post(
      `${baseUrl}/listings/fulfillment_data`,
      {
        listing: {
          hash: orderHash,
          chain: openSeaChain,
        },
        fulfiller: {
          address: fulfillerAddress,
        },
      },
      {
        headers: {
          "x-api-key": process.env.OPENSEA_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    return response.data.fulfillment_data;
  } catch (error) {
    logger.warn("Failed to fetch fulfillment data from OpenSea", {
      event: "opensea_fetch_fulfillment_failed",
      orderHash,
      error: error.response?.data || error.message,
    });
    throw AppError.internal("Failed to prepare purchase transaction");
  }
};

/**
 * Cancels an order off-chain via OpenSea's API.
 * @param {Object} options - Options for the request.
 * @param {string} options.orderHash - The OpenSea order hash.
 * @param {string} options.chainName - The chain identifier.
 * @returns {Promise<boolean>} - True if request sent.
 */
const offChainCancelListing = async ({ orderHash, chainName }) => {
  const openSeaChain = getOpenSeaChainName(chainName);
  const baseUrl =
    process.env.OPENSEA_BASE_URL || "https://api.opensea.io/api/v2";

  try {
    await axios.delete(`${baseUrl}/orders/${openSeaChain}/seaport/listings`, {
      headers: {
        "x-api-key": process.env.OPENSEA_API_KEY,
        "Content-Type": "application/json",
      },
      data: { order_hash: orderHash },
      timeout: 10000,
    });
    return true;
  } catch (error) {
    logger.warn("Off-chain cancellation request failed", {
      event: "opensea_offchain_cancel_failed",
      orderHash,
      error: error.response?.data || error.message,
    });
    return false;
  }
};

module.exports = {
  fetchListings,
  fetchFloorPrice,
  fetchOrderByHash,
  postSignedListing,
  fetchFulfillmentData,
  offChainCancelListing,
};
