const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const minimist = require("minimist");
const Wallet = require("../Modules/wallet/model");
const {
  backfillWalletNftHistory,
  repairWalletNftHistoryUniqueKeys,
} = require("../Modules/nft/historyBackfill.service");
const { getChainContext } = require("../common/utils/chain");
const logger = require("../common/utils/logger");

async function parseArgs() {
  return minimist(process.argv.slice(2), {
    string: ["walletId", "userId", "limit"],
    boolean: ["dryRun", "repairKeys", "skipBackfill"],
    default: {
      limit: "500",
      dryRun: false,
      repairKeys: false,
      skipBackfill: false,
    },
  });
}

async function run() {
  const args = await parseArgs();
  const mongoUri = process.env.MONGODB_URI || process.env.DB_URI;
  
  if (!mongoUri) {
    logger.error("MONGODB_URI or DB_URI is not set in process.env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  logger.info("Connected to MongoDB for backfill script.", { event: "script-start", args });

  const limit = parseInt(args.limit, 10) || 500;
  const dryRun = args.dryRun === true || args.dryRun === "true";
  const repairKeys = args.repairKeys === true || args.repairKeys === "true";
  const skipBackfill =
    args.skipBackfill === true || args.skipBackfill === "true";
  
  const query = { chain: "polygon" };
  if (args.walletId) {
    query._id = args.walletId;
  }
  if (args.userId) {
    query.userId = args.userId;
  }

  const wallets = await Wallet.find(query).lean();
  logger.info(`Found ${wallets.length} Polygon wallets to backfill.`);

  let totalScanned = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalRepaired = 0;
  let totalRepairConflicts = 0;
  let totalRepairSkippedPending = 0;
  let totalRepairMalformed = 0;

  for (const wallet of wallets) {
    try {
      if (!skipBackfill) {
        const context = getChainContext(wallet.chain);
        if (!context) {
          logger.warn("Skipping unknown chain", { chain: wallet.chain });
          continue;
        }
        
        const summary = await backfillWalletNftHistory({
          wallet: wallet,
          context,
          limit,
          dryRun
        });

        totalScanned += summary.scannedCount;
        totalCreated += summary.createdCount;
        totalUpdated += summary.updatedCount;
        totalSkipped += summary.skippedCount;
        totalFailed += summary.failedCount;
      }

      if (repairKeys) {
        const repairSummary = await repairWalletNftHistoryUniqueKeys({
          wallet,
          dryRun,
        });

        totalScanned += repairSummary.scannedCount;
        totalRepaired += repairSummary.repairedCount;
        totalRepairConflicts += repairSummary.conflictCount;
        totalRepairSkippedPending += repairSummary.skippedPendingCount || 0;
        totalRepairMalformed += repairSummary.malformedCount;
        totalFailed += repairSummary.failedCount;
      }

    } catch (err) {
      logger.error("Failed backfill for wallet", { walletId: String(wallet._id), error: err.message });
      totalFailed += 1;
    }
  }

  logger.info("Backfill complete.", {
    event: "script-complete",
    totalWallets: wallets.length,
    totalScanned,
    totalCreated,
    totalUpdated,
    totalSkipped,
    totalFailed,
    totalRepaired,
    totalRepairConflicts,
    totalRepairSkippedPending,
    totalRepairMalformed,
    dryRun,
    repairKeys,
    skipBackfill,
  });

  process.exit(0);
}

run().catch((err) => {
  logger.error("Fatal error running backfill", { error: err.stack });
  process.exit(1);
});
