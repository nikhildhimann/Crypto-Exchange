const express = require("express");

const controller = require("./controller");
const validator = require("./validator");
const marketplaceController = require("./marketplace.controller");
const marketplaceValidator = require("./marketplace.validator");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");
const { AppError } = require("../../helpers/errors");

const router = express.Router();

function isMarketplaceEnabled() {
  return String(process.env.NFT_MARKETPLACE_ENABLED || "false").trim().toLowerCase() === "true";
}

function requireMarketplaceEnabled(_req, _res, next) {
  if (isMarketplaceEnabled()) {
    next();
    return;
  }

  next(
    new AppError("NFT marketplace is disabled for this deployment", {
      status: 503,
      code: "NFT_MARKETPLACE_DISABLED",
    }),
  );
}

router.get(
  "/",
  verifyToken,
  validateRequest(validator.listRules),
  controller.list,
);
router.post(
  "/sync",
  verifyToken,
  validateRequest(validator.syncRules),
  controller.sync,
);
router.post(
  "/refresh",
  verifyToken,
  validateRequest(validator.refreshRules),
  controller.refresh,
);
router.post(
  "/hide",
  verifyToken,
  validateRequest(validator.hideRules),
  controller.hide,
);
router.post(
  "/estimate-fee",
  verifyToken,
  validateRequest(validator.estimateFeeRules),
  controller.estimateFee,
);
router.post(
  "/transfer",
  verifyToken,
  validateRequest(validator.transferRules),
  controller.transfer,
);
router.get(
  "/collections",
  verifyToken,
  validateRequest(validator.collectionsRules),
  controller.collections,
);
router.get(
  "/collections/detail",
  verifyToken,
  validateRequest(validator.collectionDetailRules),
  controller.collectionDetail,
);
router.get(
  "/wallets/:walletId/sync-status",
  verifyToken,
  validateRequest(validator.syncStatusRules),
  controller.getSyncStatus,
);
router.get(
  "/:id/activity",
  verifyToken,
  validateRequest(validator.activityFeedRules),
  controller.activityFeed,
);
router.get(
  "/:id",
  verifyToken,
  validateRequest(validator.detailRules),
  controller.detail,
);

// ── NFT Marketplace routes ───────────────────────────────────────
router.use("/marketplace", requireMarketplaceEnabled);

router.get(
  "/marketplace/listings",
  verifyToken,
  validateRequest(marketplaceValidator.getListingsRules),
  marketplaceController.getListings
);

router.get(
  "/marketplace/user-listings",
  verifyToken,
  validateRequest(marketplaceValidator.getUserListingsRules),
  marketplaceController.getUserListings
);

router.post(
  "/marketplace/list-for-sale",
  verifyToken,
  validateRequest(marketplaceValidator.listForSaleRules),
  marketplaceController.listForSale
);

router.post(
  "/marketplace/buy-nft",
  verifyToken,
  validateRequest(marketplaceValidator.buyNFTRules),
  marketplaceController.buyNFT
);

router.post(
  "/marketplace/cancel-listing",
  verifyToken,
  validateRequest(marketplaceValidator.cancelListingRules),
  marketplaceController.cancelListing
);

router.get(
  "/marketplace/floor-price",
  verifyToken,
  validateRequest(marketplaceValidator.getFloorPriceRules),
  marketplaceController.getFloorPrice
);

router.get(
  "/marketplace/orders",
  verifyToken,
  validateRequest(marketplaceValidator.getListingsRules), // Reusing similar rules or check for specific ones
  marketplaceController.getOrders
);

// ── NFT Marketplace ────────────────────────────────
router.get("/marketplace/listings",
  verifyToken,
  validateRequest(marketplaceValidator.getListingsRules),
  marketplaceController.getListings
);
router.get("/marketplace/my-listings",
  verifyToken,
  validateRequest(marketplaceValidator.getUserListingsRules),
  marketplaceController.getUserListings
);
router.get("/marketplace/orders",
  verifyToken,
  validateRequest(marketplaceValidator.getOrdersRules),
  marketplaceController.getOrders
);
router.post("/marketplace/list",
  verifyToken,
  validateRequest(marketplaceValidator.listForSaleRules),
  marketplaceController.listForSale
);
router.post("/marketplace/buy",
  verifyToken,
  validateRequest(marketplaceValidator.buyNFTRules),
  marketplaceController.buyNFT
);
router.delete("/marketplace/listings/:listingId",
  verifyToken,
  validateRequest(marketplaceValidator.cancelListingRules),
  marketplaceController.cancelListing
);

module.exports = router;
