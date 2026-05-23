const transaction = require("./transaction");
const DestinationTagService = require("../../destinationTag/service");
const logger = require("../../../common/utils/logger");

async function watchDeposits(input) {
  const entries = await transaction.fetchHistory({
    network: input.network,
    address: input.address,
    limit: input.limit || 50,
  });

  const mapper = require("./mapper");
  const mappedEntries = entries
    .map(entry => mapper.mapTransaction(entry, input.address))
    .filter(Boolean);

  return mappedEntries.map(mapped => ({
    ...mapped,
    // Provide raw entry for matchDepositToWallet fallback
    tx_json: mapped.tx,
    tx: mapped.tx
  }));
}

async function matchDepositToWallet(depositEntry, network = "mainnet") {
  const tx = depositEntry.tx_json && typeof depositEntry.tx_json === "object" ? depositEntry.tx_json : depositEntry.tx;
  
  if (!tx || tx.TransactionType !== "Payment") {
    return null;
  }

  const destinationAddress = tx.Destination;
  const destinationTag = tx.DestinationTag;

  // Try to match by destination tag first (primary method)
  if (destinationTag !== undefined && destinationTag !== null) {
    try {
      const tagRecord = await DestinationTagService.getTagByValue("xrp", network, destinationTag);
      if (tagRecord && tagRecord.walletId) {
        // Update last used timestamp
        await DestinationTagService.updateLastUsed(tagRecord._id);
        
        return {
          walletId: tagRecord.walletId._id || tagRecord.walletId,
          accountId: tagRecord.accountId,
          userId: tagRecord.userId,
          matchedBy: "destinationTag",
          destinationTag,
          destinationAddress,
        };
      }
    } catch (error) {
      // Log error but continue to address-only matching
      logger.warn("Failed to match deposit by destination tag", {
        event: "xrp_deposit_destination_tag_match_failed",
        error: error.message,
      });
    }
  }

  // Fallback: address-only matching (backward compatibility)
  if (destinationAddress) {
    const Wallet = require("../../wallet/model");
    const wallet = await Wallet.findOne({
      address: destinationAddress,
      chain: "xrp",
      network,
    }).lean();

    if (wallet) {
      return {
        walletId: wallet._id,
        accountId: wallet.accountId,
        userId: wallet.userId,
        matchedBy: "address",
        destinationTag: null,
        destinationAddress,
      };
    }
  }

  return null;
}

module.exports = {
  watchDeposits,
  matchDepositToWallet,
};
