const Wallet = require("../Modules/wallet/model");
const { syncUtxoWallet } = require("../Modules/chainAdapters/utxo/runtimeSync.service");
const { buildWalletVisibilityFilter } = require("../common/utils/walletState");
const logger = require("../common/utils/logger");

const BATCH_SIZE = Math.max(Number(process.env.UTXO_WALLET_SYNC_BATCH_SIZE || 10), 1);
const RATE_LIMIT_DELAY_MS = Math.max(
  Number(process.env.UTXO_WALLET_SYNC_BATCH_DELAY_MS || 2000),
  0,
);
const MAX_WALLETS_PER_RUN = Math.max(
  Number(process.env.UTXO_WALLET_SYNC_MAX_WALLETS || 50),
  1,
);

module.exports = async function utxoWalletSyncJob() {
  try {
    const wallets = await Wallet.find({
      chain: "ada",
      ...buildWalletVisibilityFilter({ includeHidden: true }),
    })
      .select("_id userId chain network address metadata")
      .sort({
        "metadata.utxoRuntime.lastFullSyncAt": 1,
        "metadata.balance.lastSyncedAt": 1,
        createdAt: 1,
      })
      .limit(MAX_WALLETS_PER_RUN)
      .lean();

    if (!wallets.length) {
      logger.info("No ADA UTXO wallets found for background sync", {
        event: "utxo_wallet_sync_job_empty",
      });
      return {
        job: "utxoWalletSync",
        status: "completed",
        walletsProcessed: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
      };
    }

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (let index = 0; index < wallets.length; index += BATCH_SIZE) {
      const batch = wallets.slice(index, index + BATCH_SIZE);

      for (const wallet of batch) {
        const result = await syncUtxoWallet(String(wallet._id), {
          trigger: "background_job",
          reason: "scheduled_wallet_maintenance",
        });

        if (result.status === "completed") {
          synced += 1;
        } else if (result.status === "skipped") {
          skipped += 1;
        } else {
          failed += 1;
        }
      }

      if (index + BATCH_SIZE < wallets.length && RATE_LIMIT_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }
    }

    logger.info("Completed ADA UTXO wallet background sync job", {
      event: "utxo_wallet_sync_job_completed",
      walletsProcessed: wallets.length,
      synced,
      skipped,
      failed,
    });

    return {
      job: "utxoWalletSync",
      status: "completed",
      walletsProcessed: wallets.length,
      synced,
      skipped,
      failed,
    };
  } catch (error) {
    logger.error("ADA UTXO wallet background sync job failed", {
      event: "utxo_wallet_sync_job_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      job: "utxoWalletSync",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
