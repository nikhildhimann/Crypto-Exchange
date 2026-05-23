const Transaction = require("../transaction/model");
const logger = require("../../common/utils/logger");
const {
  buildNftHistoryTransactionPayload,
  hasRealNftTxHash,
  isPendingNftHistoryUniqueKey,
  normalizeNftHistoryIdentity,
} = require("./history.utils");

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findExistingNftHistoryTransaction({ wallet, mapped }) {
  const identity = normalizeNftHistoryIdentity(mapped);

  let existing = await Transaction.findOne({
    walletId: wallet._id,
    chain: wallet.chain,
    historyUniqueKey: identity.canonicalHistoryUniqueKey,
  })
    .select({ _id: 1 })
    .lean();

  if (!existing) {
    existing = await Transaction.findOne({
      walletId: wallet._id,
      chain: wallet.chain,
      assetType: "nft",
      txHash: identity.txHash,
      contractAddress: {
        $regex: `^${escapeRegex(identity.contractAddress)}$`,
        $options: "i",
      },
      standard: {
        $in: identity.standardQueryVariants,
      },
      direction: identity.direction,
      "metadata.nft.tokenId": {
        $in: identity.tokenIdQueryVariants,
      },
    })
      .select({ _id: 1 })
      .lean();
  }

  return existing;
}

async function backfillWalletNftHistory({ wallet, context, limit = 100, dryRun = false }) {
  const summary = {
    scannedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };

  logger.info("Starting NFT history backfill", {
    event: "nft-backfill-start",
    walletId: String(wallet._id),
    chain: wallet.chain,
    address: wallet.address,
    limit,
    dryRun,
  });

  try {
    const rawHistory = await context.adapter.nft.fetchTransferHistory({
      address: wallet.address,
      network: wallet.network,
      limit,
    });

    summary.scannedCount = rawHistory.length;
    const BATCH_SIZE = 50;

    for (let i = 0; i < rawHistory.length; i += BATCH_SIZE) {
      const chunk = rawHistory.slice(i, i + BATCH_SIZE);
      const operations = [];

      for (const rawEvent of chunk) {
        try {
          const mapped = context.adapter.mapper.mapNftTransaction(rawEvent, wallet.address);

          if (!mapped || !mapped.txHash || !mapped.historyUniqueKey || !mapped.contractAddress || !mapped.metadata?.nft?.tokenId || !mapped.direction) {
            summary.skippedCount++;
            continue;
          }

          const payload = buildNftHistoryTransactionPayload({
            wallet,
            mapped,
            rawResponse: mapped.rawResponse || { event: rawEvent },
          });
          const existingTransaction = await findExistingNftHistoryTransaction({
            wallet,
            mapped: payload,
          });

          if (dryRun) {
            if (existingTransaction) {
              summary.updatedCount++;
            } else {
              summary.createdCount++;
            }
            continue;
          }

          if (existingTransaction) {
            operations.push({
              updateOne: {
                filter: { _id: existingTransaction._id },
                update: { $set: payload },
              },
            });
          } else {
            operations.push({
              insertOne: {
                document: payload,
              },
            });
          }

        } catch (error) {
          summary.failedCount++;
          logger.error("Failed to map NFT transaction during backfill", {
            event: "nft-backfill-error",
            walletId: String(wallet._id),
            txHash: rawEvent?.txHash || rawEvent?.hash,
            error: error.message,
          });
        }
      }

      if (!dryRun && operations.length > 0) {
        try {
          const bulkResult = await Transaction.bulkWrite(operations, { ordered: false });
          summary.createdCount += bulkResult.insertedCount || 0;
          summary.updatedCount += bulkResult.modifiedCount || 0;
          const matchedNoEdit =
            (bulkResult.matchedCount || 0) - (bulkResult.modifiedCount || 0);
          summary.skippedCount += matchedNoEdit;
        } catch (error) {
          if (error.result) {
            summary.createdCount += error.result.nInserted || 0;
            summary.updatedCount += error.result.nModified || 0;
            const matchedNoEdit = (error.result.nMatched || 0) - (error.result.nModified || 0);
            summary.skippedCount += matchedNoEdit;
            
            const numFailed =
              operations.length -
              ((error.result.nInserted || 0) + (error.result.nMatched || 0));
            summary.failedCount += numFailed;
          } else {
            summary.failedCount += operations.length;
          }
          logger.error("Partial failure executing bulkWrite batch", { 
            error: error.message,
            walletId: String(wallet._id)
          });
        }
      }
    }

    if (!dryRun) {
      const Wallet = require("../wallet/model");
      const nftHistorySync = {
        lastAttemptAt: new Date(),
        lastSyncedAt: summary.failedCount === 0 ? new Date() : (wallet.metadata?.nftHistorySync?.lastSyncedAt || null),
        scannedCount: summary.scannedCount,
        createdCount: summary.createdCount,
        updatedCount: summary.updatedCount,
        error: null,
      };

      await Wallet.updateOne(
        { _id: wallet._id },
        { $set: { "metadata.nftHistorySync": nftHistorySync } }
      );
    }

    logger.info("Completed NFT history backfill", {
      event: "nft-backfill-complete",
      walletId: String(wallet._id),
      summary,
    });

  } catch (error) {
    if (!dryRun) {
      const Wallet = require("../wallet/model");
      const nftHistorySync = {
        lastAttemptAt: new Date(),
        lastSyncedAt: wallet.metadata?.nftHistorySync?.lastSyncedAt || null,
        error: error.message,
      };

      await Wallet.updateOne(
        { _id: wallet._id },
        { $set: { "metadata.nftHistorySync": nftHistorySync } }
      );
    }

    logger.error("Error fetching NFT history for backfill", {
      event: "nft-backfill-error",
      walletId: String(wallet._id),
      error: error.message,
    });
    // Do not throw, return summary with fail info if the outer flow wants to handle it softly
    // Or throw if instructed. Instructor rule: "Return summary object". 
  }

  return summary;
}

async function repairWalletNftHistoryUniqueKeys({
  wallet,
  dryRun = false,
} = {}) {
  const summary = {
    scannedCount: 0,
    alreadyCanonicalCount: 0,
    repairedCount: 0,
    conflictCount: 0,
    skippedPendingCount: 0,
    malformedCount: 0,
    failedCount: 0,
  };

  logger.info("Starting NFT history key repair", {
    event: "nft-history-key-repair-start",
    walletId: String(wallet?._id || ""),
    chain: wallet?.chain,
    dryRun,
  });

  const cursor = Transaction.find({
    walletId: wallet._id,
    chain: wallet.chain,
    assetType: "nft",
  })
    .sort({ _id: 1 })
    .cursor();

  for await (const transaction of cursor) {
    summary.scannedCount += 1;

    if (
      !hasRealNftTxHash(transaction?.txHash) ||
      isPendingNftHistoryUniqueKey(transaction?.historyUniqueKey)
    ) {
      summary.skippedPendingCount += 1;
      continue;
    }

    try {
      const identity = normalizeNftHistoryIdentity(transaction);
      const currentHistoryUniqueKey = String(transaction.historyUniqueKey || "").trim();

      if (currentHistoryUniqueKey === identity.canonicalHistoryUniqueKey) {
        summary.alreadyCanonicalCount += 1;
        continue;
      }

      const conflict = await Transaction.findOne({
        walletId: wallet._id,
        chain: wallet.chain,
        historyUniqueKey: identity.canonicalHistoryUniqueKey,
        _id: { $ne: transaction._id },
      })
        .select({ _id: 1, txHash: 1, status: 1, direction: 1 })
        .lean();

      if (conflict) {
        summary.conflictCount += 1;
        logger.warn("Skipped NFT history key repair due to canonical conflict", {
          event: "nft-history-key-repair-conflict",
          walletId: String(wallet._id),
          transactionId: String(transaction._id),
          conflictingTransactionId: String(conflict._id),
          currentHistoryUniqueKey: currentHistoryUniqueKey || null,
          canonicalHistoryUniqueKey: identity.canonicalHistoryUniqueKey,
        });
        continue;
      }

      if (!dryRun) {
        await Transaction.updateOne(
          { _id: transaction._id },
          {
            $set: {
              historyUniqueKey: identity.canonicalHistoryUniqueKey,
              txHash: identity.txHash,
              standard: identity.standard,
              contractAddress: identity.contractAddress,
              "metadata.nft.contractAddress": identity.contractAddress,
              "metadata.nft.tokenId": identity.tokenId,
              "metadata.nft.standard": identity.standard,
            },
          },
        );

        logger.info("Repaired NFT history unique key", {
          event: "nft-history-key-repaired",
          walletId: String(wallet._id),
          transactionId: String(transaction._id),
          oldHistoryUniqueKey: currentHistoryUniqueKey || null,
          newHistoryUniqueKey: identity.canonicalHistoryUniqueKey,
        });
      }

      summary.repairedCount += 1;
    } catch (error) {
      summary.malformedCount += 1;
      summary.failedCount += 1;
      logger.warn("Skipped malformed NFT history row during key repair", {
        event: "nft-history-key-repair-malformed",
        walletId: String(wallet._id),
        transactionId: String(transaction?._id || ""),
        txHash: String(transaction?.txHash || "").trim() || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("Completed NFT history key repair", {
    event: "nft-history-key-repair-complete",
    walletId: String(wallet?._id || ""),
    summary,
    dryRun,
  });

  return summary;
}

module.exports = {
  backfillWalletNftHistory,
  repairWalletNftHistoryUniqueKeys,
};
