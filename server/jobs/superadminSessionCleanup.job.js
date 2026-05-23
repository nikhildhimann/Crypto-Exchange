/**
 * Superadmin Session Cleanup Job
 * Removes expired and revoked sessions periodically
 */

const scheduleJob = require('node-schedule');
const SuperadminSession = require('../superadmin/session.model');
const logger = require('../../common/utils/logger');

const JOB_PATTERN = '0 */6 * * *'; // Every 6 hours
const BATCH_SIZE = 1000;

/**
 * Clean up expired superadmin sessions
 */
async function cleanupExpiredSuperadminSessions() {
  try {
    const now = new Date();
    
    // Find and remove expired sessions (older than 7 days + some buffer)
    const cutoffDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000));
    
    const result = await SuperadminSession.deleteMany({
      $or: [
        { 
          status: 'expired',
          expiresAt: { $lt: cutoffDate }
        },
        {
          status: 'revoked',
          revokedAt: { $lt: cutoffDate }
        }
      ]
    });

    if (result.deletedCount > 0) {
      logger.info(`Cleaned up ${result.deletedCount} expired superadmin sessions`);
    }
  } catch (error) {
    logger.error('Failed to cleanup superadmin sessions', { error: error.message });
  }
}

/**
 * Enforce max concurrent sessions per superadmin
 */
async function enforceMaxConcurrentSessions(maxSessions = 5) {
  try {
    const securityConfig = require('../../config/security');
    const limit = securityConfig.superadminMaxConcurrentSessions || maxSessions;

    // Get all superadmins with their active session counts
    const sessions = await SuperadminSession.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $group: {
          _id: '$superadminId',
          count: { $sum: 1 },
          sessions: { $push: '$$ROOT' }
        }
      },
      {
        $match: { count: { $gt: limit } }
      }
    ]);

    let revokedCount = 0;

    for (const group of sessions) {
      const { count, sessions: sessionsList } = group;
      const toRevoke = count - limit;
      
      // Sort by lastUsedAt ascending (revoke oldest sessions first)
      const sorted = sessionsList.sort((a, b) => 
        (a.lastUsedAt?.getTime() || 0) - (b.lastUsedAt?.getTime() || 0)
      );

      // Revoke oldest sessions
      for (let i = 0; i < toRevoke && i < sorted.length; i++) {
        await SuperadminSession.updateOne(
          { _id: sorted[i]._id },
          {
            status: 'revoked',
            revokedAt: new Date(),
            revokedReason: 'max_concurrent_sessions_exceeded'
          }
        );
        revokedCount++;
      }
    }

    if (revokedCount > 0) {
      logger.info(`Revoked ${revokedCount} sessions due to concurrent session limit`);
    }
  } catch (error) {
    logger.error('Failed to enforce max concurrent sessions', { error: error.message });
  }
}

/**
 * Mark stale sessions as inactive
 */
async function markStaleSessionsAsInactive(inactivityMs = 30 * 60 * 1000) {
  try {
    const securityConfig = require('../../config/security');
    const timeout = securityConfig.sessionInactivityTimeoutMs || inactivityMs;
    const staleThreshold = new Date(Date.now() - timeout);

    const result = await SuperadminSession.updateMany(
      {
        status: 'active',
        lastUsedAt: { $lt: staleThreshold }
      },
      {
        status: 'expired',
        revokedAt: new Date(),
        revokedReason: 'inactivity_timeout'
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Marked ${result.modifiedCount} sessions as stale`);
    }
  } catch (error) {
    logger.error('Failed to mark stale sessions', { error: error.message });
  }
}

/**
 * Initialize session cleanup jobs
 */
function initializeSessionCleanupJobs() {
  try {
    // Main cleanup job (every 6 hours)
    scheduleJob(JOB_PATTERN, async () => {
      logger.debug('Running superadmin session cleanup job');
      await Promise.all([
        cleanupExpiredSuperadminSessions(),
        enforceMaxConcurrentSessions(),
        markStaleSessionsAsInactive()
      ]);
    });

    logger.info('Superadmin session cleanup jobs initialized');
  } catch (error) {
    logger.error('Failed to initialize session cleanup jobs', { error: error.message });
  }
}

module.exports = {
  cleanupExpiredSuperadminSessions,
  enforceMaxConcurrentSessions,
  markStaleSessionsAsInactive,
  initializeSessionCleanupJobs,
};
