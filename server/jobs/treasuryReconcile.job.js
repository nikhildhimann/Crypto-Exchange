const Wallet = require("../Modules/wallet/model");
const Transaction = require("../Modules/transaction/model");
const Deposit = require("../Modules/deposit/model");
const Withdrawal = require("../Modules/withdrawal/model");
const { getChainContext } = require("../common/utils/chain");
const logger = require("../common/utils/logger");
const { withJobLock } = require("./index");

// Configuration
const BATCH_SIZE = 20;
const RATE_LIMIT_DELAY = 3000; // 3 seconds between batches

// Treasury wallet addresses (should be configured via env in production)
const TREASURY_ADDRESSES = process.env.TREASURY_ADDRESSES 
  ? process.env.TREASURY_ADDRESSES.split(',').map(addr => addr.trim())
  : [];

module.exports = async function treasuryReconcileJob() {
  return withJobLock("treasuryReconcile", async () => {
    try {
      logger.info("Starting treasury reconcile job");
      
      if (TREASURY_ADDRESSES.length === 0) {
        logger.warn("No treasury addresses configured, using sample addresses");
      }

      // Get all treasury wallets (or sample wallets if no treasury configured)
      const treasuryWallets = await Wallet.find({
        $or: [
          ...(TREASURY_ADDRESSES.length > 0 ? [
            { address: { $in: TREASURY_ADDRESSES } }
          ] : [
            { chain: "xrp", network: "mainnet" } // Sample: first 5 XRP wallets
          ])
        ]
      })
      .select("_id chain network address userId accountId")
      .sort({ createdAt: 1 })
      .limit(TREASURY_ADDRESSES.length > 0 ? 100 : 5)
      .lean();

      if (treasuryWallets.length === 0) {
        logger.info("No treasury wallets found for reconciliation");
        return { 
          job: "treasuryReconcile", 
          status: "completed", 
          walletsProcessed: 0,
          reconciled: 0,
          mismatches: 0,
          errors: 0
        };
      }

      let reconciled = 0;
      let mismatches = 0;
      let errors = 0;
      const reconciliationReport = [];

      // Process wallets in batches
      for (let i = 0; i < treasuryWallets.length; i += BATCH_SIZE) {
        const batch = treasuryWallets.slice(i, i + BATCH_SIZE);
        
        logger.info(`Processing treasury reconciliation batch`, {
          batch: Math.floor(i / BATCH_SIZE) + 1,
          totalBatches: Math.ceil(treasuryWallets.length / BATCH_SIZE),
          walletCount: batch.length
        });

        // Process each wallet in the batch
        for (const wallet of batch) {
          try {
            const result = await reconcileWallet(wallet);
            reconciled++;
            
            if (result.mismatch) {
              mismatches++;
            }
            
            if (result.error) {
              errors++;
              logger.warn(`Error reconciling wallet ${wallet._id}`, { 
                error: result.error 
              });
            }

            reconciliationReport.push(result);
          } catch (error) {
            errors++;
            logger.error(`Unexpected error reconciling wallet ${wallet._id}`, { 
              error: error.message,
              stack: error.stack
            });
          }
        }

        // Rate limiting between batches
        if (i + BATCH_SIZE < treasuryWallets.length) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      }

      // Generate summary report
      const summary = {
        timestamp: new Date(),
        totalWallets: treasuryWallets.length,
        reconciled,
        mismatches,
        errors,
        mismatchDetails: reconciliationReport.filter(r => r.mismatch),
        config: {
          treasuryAddresses: TREASURY_ADDRESSES,
          batchSize: BATCH_SIZE
        }
      };

      logger.info("Treasury reconciliation job completed", {
        walletsProcessed: treasuryWallets.length,
        reconciled,
        mismatches,
        errors,
        batches: Math.ceil(treasuryWallets.length / BATCH_SIZE)
      });

      logger.info("Treasury reconciliation summary", summary);

      return { 
        job: "treasuryReconcile", 
        status: "completed", 
        walletsProcessed: treasuryWallets.length,
        reconciled,
        mismatches,
        errors,
        batches: Math.ceil(treasuryWallets.length / BATCH_SIZE),
        summary
      };
    } catch (error) {
      logger.error("Treasury reconcile job failed", { error: error.message });
      return { 
        job: "treasuryReconcile", 
        status: "failed", 
        error: error.message 
      };
    }
  });
};

// Helper function to reconcile individual wallet
async function reconcileWallet(wallet) {
  try {
    const context = getChainContext(wallet.chain);
    if (!context) {
      return { 
        walletId: wallet._id,
        mismatch: false, 
        error: `Unsupported chain: ${wallet.chain}` 
      };
    }

    // Get on-chain balance
    let onChainBalance = null;
    try {
      if (context.adapter.balance && context.adapter.balance.fetchBalance) {
        onChainBalance = await context.adapter.balance.fetchBalance({
          address: wallet.address,
          network: wallet.network
        });
      }
    } catch (chainError) {
      logger.warn(`Failed to fetch on-chain balance for wallet ${wallet._id}`, {
        address: wallet.address,
        chain: wallet.chain,
        error: chainError.message
      });
    }

    // Get internal tracked amounts
    const [totalDeposits, totalWithdrawals] = await Promise.all([
      getTotalDeposits(wallet._id),
      getTotalWithdrawals(wallet._id)
    ]);

    const netInternalAmount = parseFloat(totalDeposits || '0') - parseFloat(totalWithdrawals || '0');

    // Calculate expected balance (on-chain + pending withdrawals)
    const pendingWithdrawals = await getPendingWithdrawals(wallet._id);
    const expectedBalance = parseFloat(onChainBalance?.balance || '0') + parseFloat(pendingWithdrawals || '0');

    // Check for mismatches
    const mismatch = Math.abs(netInternalAmount - parseFloat(onChainBalance?.balance || '0')) > 0.000001; // Small tolerance for floating point

    const result = {
      walletId: wallet._id,
      address: wallet.address,
      chain: wallet.chain,
      network: wallet.network,
      onChainBalance: onChainBalance?.balance || '0',
      totalDeposits,
      totalWithdrawals,
      pendingWithdrawals,
      netInternalAmount,
      expectedBalance,
      mismatch,
      difference: Math.abs(netInternalAmount - parseFloat(onChainBalance?.balance || '0')),
      error: null
    };

    if (mismatch) {
      logger.warn("Treasury balance mismatch detected", {
        walletId: wallet._id,
        address: wallet.address,
        chain: wallet.chain,
        onChain: result.onChainBalance,
        internal: result.netInternalAmount,
        difference: result.difference
      });
    }

    return result;
  } catch (error) {
    return { 
      walletId: wallet._id,
      mismatch: false, 
      error: error.message 
    };
  }
}

// Helper functions for internal calculations
async function getTotalDeposits(walletId) {
  const result = await Deposit.aggregate([
    { $match: { walletId, status: "completed" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  return result.length > 0 ? result[0].total : "0";
}

async function getTotalWithdrawals(walletId) {
  const result = await Withdrawal.aggregate([
    { $match: { walletId, status: "completed" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  return result.length > 0 ? result[0].total : "0";
}

async function getPendingWithdrawals(walletId) {
  const result = await Withdrawal.aggregate([
    { $match: { walletId, status: { $in: ["created", "processing"] } } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  return result.length > 0 ? result[0].total : "0";
}
