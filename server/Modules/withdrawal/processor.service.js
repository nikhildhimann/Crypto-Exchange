const transactionService = require("../transaction/transaction.service");
const logger = require("../../common/utils/logger");

/**
 * Processes a withdrawal request.
 * Logic:
 * 1. Initialize pending state via centralized transaction service
 * 2. Return the created records
 * 
 * Note: Blockchain broadcast is handled separately or by observers
 */
async function processWithdrawal(payload) {
  logger.info("Processing withdrawal request", { 
    userId: payload.userId, 
    amount: payload.amount, 
    chain: payload.chain 
  });

  const result = await transactionService.initiateWithdrawal({
    userId: payload.userId,
    walletId: payload.walletId,
    amount: payload.amount,
    chain: payload.chain,
    toAddress: payload.destinationAddress,
    asset: payload.asset,
    network: payload.network,
    executionParams: payload.executionParams,
    idempotencyKey: payload.idempotencyKey,
  });

  return result;
}

module.exports = {
  processWithdrawal,
};
