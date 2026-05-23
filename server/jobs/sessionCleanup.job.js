const WalletCreationSession = require("../Modules/security/walletCreationSession.model");
const logger = require("../common/utils/logger");
const { withJobLock } = require("./index");

// Configuration
const SESSION_EXPIRY_HOURS = 24; // Clean sessions older than 24 hours
const BATCH_SIZE = 100;

module.exports = async function sessionCleanupJob() {
  return withJobLock("sessionCleanup", async () => {
    try {
      logger.info("Starting session cleanup job");
      
      const cutoffTime = new Date(Date.now() - (SESSION_EXPIRY_HOURS * 60 * 60 * 1000));
      
      // Find expired sessions
      const expiredSessions = await WalletCreationSession.find({
        status: "pending",
        expiresAt: { $lt: cutoffTime }
      })
      .lean();

      if (expiredSessions.length === 0) {
        logger.info("No expired sessions found for cleanup");
        return { 
          job: "sessionCleanup", 
          status: "completed", 
          sessionsProcessed: 0,
          cleaned: 0,
          errors: 0
        };
      }

      let cleaned = 0;
      let errors = 0;

      // Process expired sessions in batches
      for (let i = 0; i < expiredSessions.length; i += BATCH_SIZE) {
        const batch = expiredSessions.slice(i, i + BATCH_SIZE);
        
        logger.info(`Processing session cleanup batch`, {
          batch: Math.floor(i / BATCH_SIZE) + 1,
          totalBatches: Math.ceil(expiredSessions.length / BATCH_SIZE),
          sessionCount: batch.length
        });

        // Process each expired session in the batch
        for (const session of batch) {
          try {
            // Mark session as expired instead of deleting to maintain audit trail
            await WalletCreationSession.findByIdAndUpdate(session._id, {
              status: "expired",
              metadata: {
                ...session.metadata,
                expiredAt: new Date(),
                cleanupReason: "auto_cleanup",
                originalExpiresAt: session.expiresAt
              }
            });

            cleaned++;
            
            logger.debug(`Expired session`, {
              sessionId: session._id,
              userId: session.userId,
              chain: session.chain,
              network: session.network,
              expiredAt: session.expiresAt,
              age: Math.floor((Date.now() - session.createdAt) / (1000 * 60)) // age in minutes
            });
          } catch (error) {
            errors++;
            logger.error(`Error cleaning up session ${session._id}`, { 
              error: error.message,
              stack: error.stack
            });
          }
        }
      }

      logger.info("Session cleanup job completed", {
        sessionsProcessed: expiredSessions.length,
        cleaned,
        errors,
        batches: Math.ceil(expiredSessions.length / BATCH_SIZE)
      });

      return { 
        job: "sessionCleanup", 
        status: "completed", 
        sessionsProcessed: expiredSessions.length,
        cleaned,
        errors,
        batches: Math.ceil(expiredSessions.length / BATCH_SIZE)
      };
    } catch (error) {
      logger.error("Session cleanup job failed", { error: error.message });
      return { 
        job: "sessionCleanup", 
        status: "failed", 
        error: error.message 
      };
    }
  });
};
