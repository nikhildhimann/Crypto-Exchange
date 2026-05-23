const Wallet = require("../Modules/wallet/model");
const { getChainContext } = require("../common/utils/chain");
const logger = require("../common/utils/logger");
const { withJobLock } = require("./index");

// Configuration
const BATCH_SIZE = 15;
const RATE_LIMIT_DELAY = 5000; // 5 seconds between batches

module.exports = async function balanceSyncJob() {
  return withJobLock("balanceSync", async () => {
    try {
      logger.info("Starting balance sync job");
      
      // Get all active wallets across runtime-enabled networks
      const wallets = await Wallet.find({})
      .select("_id chain network address userId accountId metadata")
      .sort({ createdAt: 1 }) // Oldest first
      .limit(50) // Process in reasonable batches
      .lean();

      if (wallets.length === 0) {
        logger.info("No wallets found for balance sync");
        return { 
          job: "balanceSync", 
          status: "completed", 
          walletsProcessed: 0,
          updated: 0,
          errors: 0
        };
      }

      let updated = 0;
      let errors = 0;

      // Process wallets in batches
      for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
        const batch = wallets.slice(i, i + BATCH_SIZE);
        
        logger.info(`Processing balance sync batch`, {
          batch: Math.floor(i / BATCH_SIZE) + 1,
          totalBatches: Math.ceil(wallets.length / BATCH_SIZE),
          walletCount: batch.length
        });

        // Process each wallet in the batch
        for (const wallet of batch) {
          try {
            const result = await syncWalletBalance(wallet);
            if (result.updated) {
              updated++;
            }
            
            if (result.error) {
              errors++;
              logger.warn(`Error syncing wallet ${wallet._id}`, { 
                error: result.error 
              });
            }
          } catch (error) {
            errors++;
            logger.error(`Unexpected error syncing wallet ${wallet._id}`, { 
              error: error.message,
              stack: error.stack
            });
          }
        }

        // Rate limiting between batches
        if (i + BATCH_SIZE < wallets.length) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      }

      logger.info("Balance sync job completed", {
        walletsProcessed: wallets.length,
        updated,
        errors,
        batches: Math.ceil(wallets.length / BATCH_SIZE)
      });

      return { 
        job: "balanceSync", 
        status: "completed", 
        walletsProcessed: wallets.length,
        updated,
        errors,
        batches: Math.ceil(wallets.length / BATCH_SIZE)
      };
    } catch (error) {
      logger.error("Balance sync job failed", { error: error.message });
      return { 
        job: "balanceSync", 
        status: "failed", 
        error: error.message 
      };
    }
  });
};

// Helper function to sync individual wallet balance
async function syncWalletBalance(wallet) {
  try {
    const context = getChainContext(wallet.chain);
    if (!context) {
      return { 
        updated: false, 
        walletId: wallet._id,
        error: `Unsupported chain: ${wallet.chain}` 
      };
    }

    // Check if chain adapter has balance fetching capability
    if (!context.adapter.balance || !context.adapter.balance.fetchBalance) {
      return { 
        updated: false, 
        walletId: wallet._id,
        error: `Chain ${wallet.chain} does not support balance fetching` 
      };
    }

    // Fetch current balance from chain
    let balanceData = null;
    try {
      balanceData = await context.adapter.balance.fetchBalance({
        address: wallet.address,
        network: wallet.network
      });
    } catch (chainError) {
      logger.warn(`Failed to fetch balance from chain for wallet ${wallet._id}`, {
        address: wallet.address,
        chain: wallet.chain,
        network: wallet.network,
        error: chainError.message
      });
      
      return { 
        updated: false, 
        walletId: wallet._id,
        error: `Chain fetch failed: ${chainError.message}` 
      };
    }

    if (!balanceData) {
      return { 
        updated: false, 
        walletId: wallet._id,
        error: "No balance data returned from chain" 
      };
    }

    // Update wallet with balance information
    const updateData = {
      metadata: {
        ...wallet.metadata,
        balanceSync: {
          syncedAt: new Date(),
          balance: balanceData,
          source: "automated_sync"
        }
      }
    };

    // Update wallet record
    await Wallet.findByIdAndUpdate(wallet._id, updateData);

    logger.info(`Wallet balance synced`, {
      walletId: wallet._id,
      chain: wallet.chain,
      network: wallet.network,
      address: wallet.address,
      balance: balanceData
    });

    return { 
      updated: true, 
      walletId: wallet._id,
      balanceData 
    };
  } catch (error) {
    return { 
      updated: false, 
      walletId: wallet._id,
      error: error.message 
    };
  }
}
