const Transaction = require("../Modules/transaction/model");
const transactionService = require("../Modules/transaction/service");
const logger = require("../common/utils/logger");
const { withJobLock } = require("./index");

const MAX_WALLETS_PER_RUN = 100;
const MAX_TRANSACTION_AGE_DAYS = 7;
const PENDING_STATUS_REFRESH_DELAY_MS = 15 * 1000;

function getPendingCutoffDate() {
  return new Date(Date.now() - PENDING_STATUS_REFRESH_DELAY_MS);
}

function getOldestAllowedCreatedAt() {
  return new Date(Date.now() - MAX_TRANSACTION_AGE_DAYS * 24 * 60 * 60 * 1000);
}

module.exports = async function transactionStatusJob() {
  return withJobLock("transactionStatus", async () => {
    try {
      logger.info("Starting transaction status job");

      const walletsNeedingRefresh = await Transaction.aggregate([
        {
          $match: {
            status: "pending",
            transactionType: "external",
            updatedAt: { $lte: getPendingCutoffDate() },
            createdAt: { $gte: getOldestAllowedCreatedAt() },
          },
        },
        {
          $group: {
            _id: {
              userId: "$userId",
              walletId: "$walletId",
            },
            pendingCount: { $sum: 1 },
            oldestUpdatedAt: { $min: "$updatedAt" },
          },
        },
        {
          $sort: {
            oldestUpdatedAt: 1,
          },
        },
        {
          $limit: MAX_WALLETS_PER_RUN,
        },
      ]);

      if (!walletsNeedingRefresh.length) {
        logger.info("No pending transaction wallets found for reconciliation");
        return {
          job: "transactionStatus",
          status: "completed",
          walletsProcessed: 0,
          refreshed: 0,
          errors: 0,
        };
      }

      let refreshed = 0;
      let errors = 0;

      for (const entry of walletsNeedingRefresh) {
        const userId = String(entry?._id?.userId || "").trim();
        const walletId = String(entry?._id?.walletId || "").trim();

        if (!userId || !walletId) {
          continue;
        }

        try {
          await transactionService.syncWalletTransactions(userId, walletId, {
            trigger: "transaction_status_job",
          });
          refreshed += 1;
        } catch (error) {
          errors += 1;
          logger.warn("Failed to reconcile pending wallet transactions", {
            job: "transactionStatus",
            userId,
            walletId,
            pendingCount: Number(entry?.pendingCount || 0),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        job: "transactionStatus",
        status: "completed",
        walletsProcessed: walletsNeedingRefresh.length,
        refreshed,
        errors,
      };
    } catch (error) {
      logger.error("Transaction status job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        job: "transactionStatus",
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
};
