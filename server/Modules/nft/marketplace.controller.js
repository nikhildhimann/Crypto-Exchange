const marketplaceService = require("./marketplace.service");
const { success } = require("../../common/utils/apiResponse");

async function getListings(req, res, next) {
  try {
    const result = await marketplaceService.getMarketplaceListings({
      ...req.query,
    });
    return success(res, {
      message: "Marketplace listings fetched successfully",
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getUserListings(req, res, next) {
  try {
    const result = await marketplaceService.getUserListings({
      userId: req.user._id,
      ...req.query,
    });
    return success(res, {
      message: "Your listings fetched successfully",
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function listForSale(req, res, next) {
  try {
    const data = await marketplaceService.listNFTForSale({
      userId: req.user._id,
      ...req.body,
    });
    return success(res, {
      statusCode: 201,
      message: "NFT listed for sale successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function buyNFT(req, res, next) {
  try {
    const data = await marketplaceService.buyNFT({
      userId: req.user._id,
      ...req.body,
    });
    return success(res, {
      message: "NFT purchase submitted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function cancelListing(req, res, next) {
  try {
    const data = await marketplaceService.cancelListing({
      userId: req.user._id,
      walletId: req.body.walletId,
      listingId: req.body.listingId,
    });
    return success(res, {
      message: "Listing cancelled successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function getFloorPrice(req, res, next) {
  try {
    const data = await marketplaceService.getFloorPrice({
      ...req.query,
    });
    return success(res, {
      message: "Floor price fetched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function getOrders(req, res, next) {
  try {
    const result = await marketplaceService.getUserNftOrders({
      userId: req.user._id,
      ...req.query,
    });
    return success(res, {
      message: "Order history fetched successfully",
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getListings,
  getUserListings,
  listForSale,
  buyNFT,
  cancelListing,
  getOrders,
  getFloorPrice,
};
