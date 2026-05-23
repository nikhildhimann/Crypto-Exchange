const TransactionSyncJob = require("../../Modules/transaction/syncJob.model");
const logger = require("../../common/utils/logger");

/**
 * Persistently enqueues a transaction history sync task for a specific wallet.
 * Multi-request deduplication is handled at the database level via a unique partial index.
 */
async function enqueue(userId, walletId, options = {}) {
  try {
    const job = await TransactionSyncJob.create({
      userId,
      walletId,
      trigger: options.trigger || "manual",
      priority: options.priority || 0,
      metadata: options.metadata || {},
    });

    logger.info("Enqueued transaction sync job", {
      event: "transaction_sync_enqueued",
      jobId: String(job._id),
      userId: String(userId),
      walletId: String(walletId),
      trigger: options.trigger,
    });

    return job;
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate job already exists (pending or processing)
      logger.debug("Transaction sync job already enqueued or in progress, skipping", {
        event: "transaction_sync_enqueue_skipped",
        userId: String(userId),
        walletId: String(walletId),
      });
      return null;
    }

    logger.error("Failed to enqueue transaction sync job", {
      event: "transaction_sync_enqueue_failed",
      userId: String(userId),
      walletId: String(walletId),
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  enqueue,
};
