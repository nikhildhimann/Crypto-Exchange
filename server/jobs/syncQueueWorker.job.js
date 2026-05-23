const TransactionSyncJob = require("../Modules/transaction/syncJob.model");
const transactionService = require("../Modules/transaction/service");
const logger = require("../common/utils/logger");
const stats = require("../common/utils/stats");
const { withJobLock } = require("./index");
const Wallet = require("../Modules/wallet/model");

const operationsConfig = require("../config/operations");

const BATCH_SIZE = operationsConfig.sync.syncQueueWorkerBatchSize;
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function getWalletModel() {
  return require("../Modules/wallet/model");
}

/**
 * Background worker that processes enqueued transaction sync tasks.
 * Ensures that heavy indexing work happens outside the HTTP request lifecycle.
 */
module.exports = async function syncQueueWorkerJob() {
  return withJobLock("syncQueueWorker", async () => {
    try {
      // 1. Recover stale "processing" jobs that might have crashed.
      const staleCutoff = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
      const recovered = await TransactionSyncJob.updateMany(
        { 
          status: "processing", 
          updatedAt: { $lt: staleCutoff } 
        },
        { 
          $set: { status: "pending", lastError: "Stale job timeout recovered" },
          $inc: { attemptCount: 1 } 
        }
      );
      
      const auditNow = Date.now();

      if (recovered.modifiedCount > 0) {
        stats.increment("sync_job_recovered", recovered.modifiedCount);
        logger.warn("Recovered stale transaction sync jobs", {
          event: "sync_job_recovery",
          count: recovered.modifiedCount,
        });
      }

      // 1.1 Consistency Audit: Log "Zombie" provisional wallets stuck in pending state too long.
      const recoveryMaxAgeMs = operationsConfig.observability.recoveryMaxAgeMs;
      const zombieCutoff = new Date(auditNow - recoveryMaxAgeMs);
      try {
        const WalletModel = getWalletModel();
        const zombieWallets = await WalletModel.find({
          "metadata.provisioning.status": { $in: ["pending_recovery", "pending_discovery"] },
          "metadata.provisioning.lastAttemptAt": { $lt: zombieCutoff }
        }).select("_id chain network userId metadata.provisioning.status").lean();

        if (zombieWallets.length > 0) {
          logger.warn(`Detected ${zombieWallets.length} zombie provisional wallets`, {
            event: "consistency_audit_zombie_provisional",
            zombieCount: zombieWallets.length,
            samples: zombieWallets.slice(0, 10).map(w => ({
              id: w._id,
              chain: w.chain,
              status: w.metadata.provisioning.status
            }))
          });
          stats.setGauge("zombie_wallets", zombieWallets.length);
        }
      } catch (auditError) {
        logger.warn("Skipped zombie provisional wallet audit in sync queue worker", {
          event: "consistency_audit_zombie_provisional_skipped",
          error: auditError instanceof Error ? auditError.message : String(auditError),
        });
      }

      // 2. Fetch pending jobs ordered by priority and age.
      const jobs = await TransactionSyncJob.find({ status: "pending" })
        .sort({ priority: -1, scheduledAt: 1 })
        .limit(BATCH_SIZE)
        .lean();

      const pendingCount = await TransactionSyncJob.countDocuments({ status: "pending" });
      stats.setGauge("sync_queue_depth", pendingCount);

      if (!jobs.length) {
        // Heartbeat stats flush when idle.
        stats.flush("sync_worker");
        return { status: "completed", message: "No pending sync jobs found" };
      }

      logger.info(`Processing ${jobs.length} transaction sync jobs from queue`, {
        event: "sync_job_batch_started",
        batchSize: jobs.length,
        totalPending: pendingCount,
      });

      const batchStart = Date.now();
      let completed = 0;
      let failed = 0;

      for (const job of jobs) {
        // Mark as processing with an atomic update to prevent double-processing.
        const activeJob = await TransactionSyncJob.findOneAndUpdate(
          { _id: job._id, status: "pending" },
          { 
            $set: { 
              status: "processing", 
              startedAt: new Date(),
              updatedAt: new Date()
            } 
          },
          { new: true }
        );

        if (!activeJob) continue;

        try {
          // Execute the actual sync. We pass 'workerContext: true' to ensure the service
          // actually performs the work rather than re-queueing it.
          await transactionService.syncWalletTransactions(
            String(activeJob.userId),
            String(activeJob.walletId),
            {
              ...activeJob.metadata,
              trigger: activeJob.trigger || "background_worker",
              workerContext: true,
            }
          );

          await TransactionSyncJob.updateOne(
            { _id: activeJob._id },
            { 
              $set: { 
                status: "completed", 
                completedAt: new Date(),
                lastError: null
              } 
            }
          );
          completed += 1;
        } catch (error) {
          failed += 1;
          logger.error("Transaction sync job failed in background", {
            event: "sync_job_execution_failed",
            jobId: String(activeJob._id),
            walletId: String(activeJob.walletId),
            error: error.message,
          });

          await TransactionSyncJob.updateOne(
            { _id: activeJob._id },
            { 
              $set: { 
                status: "failed", 
                lastError: error.message,
                completedAt: new Date()
              },
              $inc: { attemptCount: 1 }
            }
          );
        }
      }

      const batchDuration = Date.now() - batchStart;
      stats.increment("sync_job_completed", completed);
      stats.increment("sync_job_failed", failed);
      stats.setGauge("sync_last_batch_duration_ms", batchDuration);

      // Periodically flush system stats to logs.
      const statsReportIntervalMs = operationsConfig.observability.statsReportIntervalMs;
      if (Date.now() - stats.lastReportedAt > statsReportIntervalMs) {
        stats.flush("sync_worker");
      }

      return {
        status: "completed",
        processed: jobs.length,
        completed,
        failed,
      };
    } catch (error) {
      logger.error("Sync queue worker job encountered a critical error", {
        event: "sync_job_worker_error",
        error: error.message,
      });
      throw error;
    }
  });
};
