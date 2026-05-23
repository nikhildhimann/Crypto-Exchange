/**
 * Database Index Recommendations & Setup
 * Ensures optimal query performance for superadmin operations
 */

const logger = require('../../common/utils/logger');

/**
 * Define recommended indexes for superadmin functionality
 */
const RECOMMENDED_INDEXES = {
  User: [
    { fields: { status: 1, createdAt: -1 }, name: 'idx_user_status_created' },
    { fields: { role: 1, createdAt: -1 }, name: 'idx_user_role_created' },
    { fields: { primaryChain: 1, status: 1 }, name: 'idx_user_chain_status' },
    { fields: { lastAccessAt: -1 }, name: 'idx_user_lastAccess' },
  ],
  Account: [
    { fields: { userId: 1, status: 1 }, name: 'idx_account_user_status' },
    { fields: { status: 1, createdAt: -1 }, name: 'idx_account_status_created' },
    { fields: { type: 1, status: 1 }, name: 'idx_account_type_status' },
  ],
  Wallet: [
    { fields: { accountId: 1, status: 1 }, name: 'idx_wallet_account_status' },
    { fields: { userId: 1, chain: 1 }, name: 'idx_wallet_user_chain' },
    { fields: { chain: 1, network: 1, status: 1 }, name: 'idx_wallet_chain_network_status' },
    { fields: { createdAt: -1 }, name: 'idx_wallet_created' },
  ],
  Transaction: [
    { fields: { accountId: 1, status: 1 }, name: 'idx_transaction_account_status' },
    { fields: { userId: 1, createdAt: -1 }, name: 'idx_transaction_user_created' },
    { fields: { status: 1, chainStatus: 1 }, name: 'idx_transaction_status_chain' },
    { fields: { chain: 1, network: 1, createdAt: -1 }, name: 'idx_transaction_chain_network_created' },
    { fields: { createdAt: -1 }, name: 'idx_transaction_created' },
  ],
  Deposit: [
    { fields: { userId: 1, status: 1 }, name: 'idx_deposit_user_status' },
    { fields: { accountId: 1, status: 1 }, name: 'idx_deposit_account_status' },
    { fields: { status: 1, createdAt: -1 }, name: 'idx_deposit_status_created' },
    { fields: { chain: 1, createdAt: -1 }, name: 'idx_deposit_chain_created' },
  ],
  Withdrawal: [
    { fields: { userId: 1, status: 1 }, name: 'idx_withdrawal_user_status' },
    { fields: { accountId: 1, status: 1 }, name: 'idx_withdrawal_account_status' },
    { fields: { status: 1, createdAt: -1 }, name: 'idx_withdrawal_status_created' },
    { fields: { chain: 1, createdAt: -1 }, name: 'idx_withdrawal_chain_created' },
  ],
  SuperadminSession: [
    { fields: { superadminId: 1, status: 1 }, name: 'idx_supersession_admin_status' },
    { fields: { status: 1, expiresAt: -1 }, name: 'idx_supersession_status_expires' },
    { fields: { createdAt: -1 }, name: 'idx_supersession_created' },
    { fields: { lastUsedAt: -1 }, name: 'idx_supersession_lastUsed' },
  ],
  SecurityAudit: [
    { fields: { superadminId: 1, createdAt: -1 }, name: 'idx_audit_admin_created' },
    { fields: { action: 1, createdAt: -1 }, name: 'idx_audit_action_created' },
    { fields: { resourceType: 1, createdAt: -1 }, name: 'idx_audit_resource_created' },
    { fields: { createdAt: -1 }, name: 'idx_audit_created' },
  ],
};

/**
 * Create recommended indexes
 * @param {object} models - Mongoose models object
 */
async function createRecommendedIndexes(models) {
  try {
    for (const [modelName, indexes] of Object.entries(RECOMMENDED_INDEXES)) {
      const model = models[modelName];
      
      if (!model) {
        logger.warn(`Model ${modelName} not found for index creation`);
        continue;
      }

      for (const { fields, name } of indexes) {
        try {
          // createIndex will create the collection if it doesn't exist
          await model.collection.createIndex(fields, { name, background: true });
          logger.debug(`Created index ${name} on ${modelName}`);
        } catch (error) {
          if (error.code === 85) {
            // Index already exists with different options - this is okay
            logger.debug(`Index ${name} already exists on ${modelName}`);
          } else {
            logger.warn(`Failed to create index ${name} on ${modelName}`, { error: error.message });
          }
        }
      }
    }

    logger.info('Database index creation completed');
  } catch (error) {
    logger.error('Failed to create recommended indexes', { error: error.message });
  }
}

/**
 * Generate index creation script for manual execution
 * @returns {string} MongoDB aggregation pipeline
 */
function generateIndexCreationScript() {
  const lines = [];
  
  for (const [modelName, indexes] of Object.entries(RECOMMENDED_INDEXES)) {
    lines.push(`\n// Collection: ${modelName}`);
    
    for (const { fields, name } of indexes) {
      const fieldsStr = JSON.stringify(fields);
      lines.push(`db.${modelName.toLowerCase()}s.createIndex(${fieldsStr}, { name: "${name}" })`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  RECOMMENDED_INDEXES,
  createRecommendedIndexes,
  generateIndexCreationScript,
};
