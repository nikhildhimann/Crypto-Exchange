const NftListing = require("../Modules/nft/nftListing.model");
const NftOffer = require("../Modules/nft/nftOffer.model");
const logger = require("../common/utils/logger");
const { withJobLock } = require("./index");

/**
 * Job to mark expired NFT listings and offers as 'expired'.
 * Runs periodically to ensure marketplace state is clean.
 */
module.exports = async function runNftListingExpiryCleanup() {
  return withJobLock("nft-listing-expiry", async () => {
    try {
      const now = new Date();

      // 1. Mark expired listings
      const listingResult = await NftListing.updateMany(
        {
          status: "active",
          expiresAt: { $lte: now },
        },
        {
          $set: { status: "expired" },
        },
      );

      if (listingResult.modifiedCount > 0) {
        logger.info("Expired NFT listings cleaned", {
          event: "nft_listing_expiry",
          count: listingResult.modifiedCount,
        });
      }

      // 2. Mark expired offers
      const offerResult = await NftOffer.updateMany(
        {
          status: "pending",
          expiresAt: { $lte: now },
        },
        {
          $set: { status: "expired" },
        },
      );

      if (offerResult.modifiedCount > 0) {
        logger.info("Expired NFT offers cleaned", {
          event: "nft_offer_expiry",
          count: offerResult.modifiedCount,
        });
      }

      return {
        job: "nftListingExpiryCleanup",
        status: "success",
        listingsExpired: listingResult.modifiedCount,
        offersExpired: offerResult.modifiedCount,
      };
    } catch (error) {
      logger.error("NFT listing expiry cleanup job failed", {
        event: "nft_expiry_cleanup_failed",
        error: error.message,
      });
      throw error;
    }
  });
};
