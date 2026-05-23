const Wallet = require("../Modules/wallet/model");
const transactionService = require("../Modules/transaction/service");
const logger = require("../common/utils/logger");

const BATCH_SIZE = 50;
const INTERVAL_MS = 5 * 60 * 1000;
const ENABLED =
  String(process.env.NFT_HISTORY_SYNC_ENABLED || "false").trim().toLowerCase() ===
  "true";

let intervalHandle = null;
let isRunning = false;

async function runNftHistorySync() {
  if (isRunning) {
    logger.warn("Skipping NFT history sync worker run because a previous run is still active", {
      event: "nft_cron_sync_skipped",
      batchSize: BATCH_SIZE,
    });
    return {
      skipped: true,
      reason: "already_running",
    };
  }

  isRunning = true;
  const startedAt = Date.now();
  let total = 0;
  let succeeded = 0;
  let failed = 0;

  logger.info("Starting Polygon NFT history sync worker run", {
    event: "nft_cron_sync_started",
    batchSize: BATCH_SIZE,
  });

  try {
    const processedWalletIds = new Set();
    let lastSeenSyncedAt;
    let lastSeenId;

    while (true) {
      const query = {
        chain: "polygon",
      };

      if (lastSeenId) {
        query.$or = [
          {
            "metadata.nftHistorySync.lastSyncedAt": { $gt: lastSeenSyncedAt },
          },
          {
            "metadata.nftHistorySync.lastSyncedAt": lastSeenSyncedAt,
            _id: { $gt: lastSeenId },
          },
        ];
      }

      const wallets = await Wallet.find(query)
        .sort({
          "metadata.nftHistorySync.lastSyncedAt": 1,
          _id: 1,
        })
        .limit(BATCH_SIZE)
        .select({ _id: 1, userId: 1, "metadata.nftHistorySync.lastSyncedAt": 1 })
        .lean();

      if (wallets.length === 0) {
        break;
      }

      const lastWallet = wallets[wallets.length - 1];
      lastSeenSyncedAt =
        lastWallet?.metadata?.nftHistorySync?.lastSyncedAt ?? null;
      lastSeenId = lastWallet?._id || null;

      for (const wallet of wallets) {
        const walletId = String(wallet._id);
        if (processedWalletIds.has(walletId)) {
          continue;
        }

        processedWalletIds.add(walletId);
        total += 1;

        try {
          await transactionService.syncWalletTransactions(
            String(wallet.userId),
            walletId,
            {
              trigger: "cron_nft_delta_sync",
              workerContext: true,
              background: false,
            },
          );
          succeeded += 1;
        } catch (error) {
          failed += 1;
          logger.warn("Polygon NFT history sync failed for wallet", {
            event: "nft_cron_sync_wallet_failed",
            walletId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    logger.info("Completed Polygon NFT history sync worker run", {
      event: "nft_cron_sync_completed",
      total,
      succeeded,
      failed,
      durationMs,
    });

    return {
      total,
      succeeded,
      failed,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error("Polygon NFT history sync worker run failed", {
      event: "nft_cron_sync_completed",
      total,
      succeeded,
      failed,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      total,
      succeeded,
      failed,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    isRunning = false;
  }
}

function start() {
  if (!ENABLED) {
    logger.info("NFT history sync worker disabled by configuration", {
      event: "nft_cron_worker_disabled",
      enabled: false,
      enabledSource: "NFT_HISTORY_SYNC_ENABLED",
    });
    return {
      started: false,
      disabled: true,
      intervalMs: INTERVAL_MS,
      batchSize: BATCH_SIZE,
    };
  }

  if (intervalHandle) {
    return {
      started: true,
      alreadyStarted: true,
      intervalMs: INTERVAL_MS,
      batchSize: BATCH_SIZE,
    };
  }

  intervalHandle = setInterval(() => {
    void runNftHistorySync();
  }, INTERVAL_MS);

  if (typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }

  return {
    started: true,
    alreadyStarted: false,
    intervalMs: INTERVAL_MS,
    batchSize: BATCH_SIZE,
  };
}

function stop() {
  if (!intervalHandle) {
    return;
  }

  clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports.start = start;
module.exports.stop = stop;
module.exports.runOnce = runNftHistorySync;
