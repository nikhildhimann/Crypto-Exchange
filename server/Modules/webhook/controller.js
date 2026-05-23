const transactionService = require("../transaction/transaction.service");
const Transaction = require("../transaction/model");
const logger = require("../../common/utils/logger");
const { success, error } = require("../../common/utils/apiResponse");
const { normalizeAmount } = require("../../common/utils/amount");
const { normalizeTxHash } = require("../../common/utils/txHash");

class WebhookController {
  async handleTron(req, res) {
    return this.processWebhook(req, res, "tron");
  }

  async handleBtc(req, res) {
    return this.processWebhook(req, res, "btc");
  }

  /**
   * Main webhook processor.
   * Logic:
   * 1. Check if txHash exists as a pending withdrawal (outgoing).
   * 2. If yes, call handleWithdrawal (confirming it).
   * 3. If no, call handleDeposit (new incoming funds).
   */
  normalizePayload(data = {}) {
    const txHash = normalizeTxHash(data.txHash);
    const address = String(data.address || "").trim();
    const rawAmount = String(data.amount ?? "").trim();

    if (!txHash || !address || !rawAmount) {
      return null;
    }

    let amount = null;
    try {
      amount = normalizeAmount(rawAmount);
    } catch (_error) {
      return null;
    }

    if (amount === "0") {
      return null;
    }

    return {
      ...data,
      txHash,
      amount,
      address,
      asset: typeof data.asset === "string" ? data.asset.trim() : data.asset,
      network: typeof data.network === "string" ? data.network.trim() : data.network,
      userId: typeof data.userId === "string" ? data.userId.trim() : data.userId,
      walletId: typeof data.walletId === "string" ? data.walletId.trim() : data.walletId,
    };
  }

  async processWebhook(req, res, chain) {
    const data = req.body && typeof req.body === "object" ? req.body : {};
    const normalizedPayload = this.normalizePayload(data);

    logger.info(`Received ${chain} webhook`, {
      chain,
      requestId: req.requestId,
      txHash: normalizedPayload?.txHash || normalizeTxHash(data.txHash),
      hasUserId: Boolean(data.userId),
      hasWalletId: Boolean(data.walletId),
    });

    try {
      if (!normalizedPayload) {
        return error(res, {
          message: "Invalid webhook data",
          errorCode: "VALIDATION_ERROR",
          statusCode: 400,
        });
      }

      // 1. Basic validation
      const { txHash, amount, address, block_time } = normalizedPayload;

      // 2. Identify transaction type
      // Check if it's a known outgoing transaction waiting for confirmation
      const existingTx = await Transaction.findOne({
        txHash,
        chain,
        direction: "outgoing",
      });

      if (existingTx) {
        logger.info("Matched webhook to existing outgoing transaction", { txHash, chain });
        await transactionService.handleWithdrawal({
          txHash,
          chain,
          amount,
          toAddress: address,
          block_time: block_time ? new Date(block_time) : new Date(),
          status: "success"
        });
      } else {
        logger.info("No matching outgoing transaction, processing as deposit", { txHash, chain });
        await transactionService.handleDeposit({
          txHash,
          chain,
          amount,
          toAddress: address,
          block_time: block_time ? new Date(block_time) : new Date(),
          userId: normalizedPayload.userId, // Optionally provided by some webhooks
          walletId: normalizedPayload.walletId,
          asset: normalizedPayload.asset,
          network: normalizedPayload.network || "mainnet",
        });
      }

      return success(res, { message: "Webhook processed successfully" });
    } catch (err) {
      if (err.code === 11000) {
        logger.info("Webhook handled (duplicate prevented)", {
          txHash: normalizeTxHash(req.body?.txHash),
          chain,
        });
        return success(res, { message: "Already processed" });
      }
      logger.error(`Error processing ${chain} webhook`, { error: err.message, stack: err.stack });
      return error(res, {
        message: "Internal server error during webhook processing",
        statusCode: 500,
      });
    }
  }
}

module.exports = new WebhookController();
