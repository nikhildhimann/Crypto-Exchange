const Withdrawal = require("../Modules/withdrawal/model");
const Transaction = require("../Modules/transaction/model");
const Wallet = require("../Modules/wallet/model");
const consistencyService = require("../Modules/transaction/consistency.service");
const { getChainContext } = require("../common/utils/chain");
const logger = require("../common/utils/logger");
const { withJobLock } = require("./index");
const socket = require("../lib/socket");

// Configuration
const BATCH_SIZE = 20;
const RATE_LIMIT_DELAY = 2000; // 2 seconds between batches
const ACTIVE_WITHDRAWAL_STATUSES = Object.freeze([
  "created",
  "pending",
  "queued",
  "broadcasted",
  "processing",
]);
const EXCLUDED_SYSTEM_STATUSES = Object.freeze([
  "risk_review_required",
]);

function computeBtcConfirmations(transaction = {}, tipHeight = 0) {
  if (transaction?.status?.confirmed !== true) {
    return 0;
  }

  const blockHeight = Number(transaction?.status?.block_height || 0);
  if (!Number.isFinite(blockHeight) || blockHeight <= 0 || !Number.isFinite(tipHeight) || tipHeight <= 0) {
    return 1;
  }

  return Math.max(tipHeight - blockHeight + 1, 1);
}

function normalizeLowerString(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeOptionalDate(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function buildMappedTxStatus(mapped = {}) {
  const mappedStatus = normalizeLowerString(mapped.status);
  const mappedChainStatus = normalizeLowerString(mapped.chainStatus);
  const confirmations = Number(mapped.confirmations || 0) || 0;
  const failed =
    mappedStatus === "failed" ||
    ["failed", "error", "rejected", "cancelled", "dropped", "aborted"].some((token) =>
      mappedChainStatus.includes(token),
    );
  const confirmed =
    !failed &&
    (
      mappedStatus === "success" ||
      confirmations > 0 ||
      Boolean(mapped.confirmedAt) ||
      ["confirmed", "validated", "completed", "success", "finalized", "settled"].includes(
        mappedChainStatus,
      )
    );

  return {
    confirmed,
    confirmations,
    final: confirmed || failed,
    success: failed ? false : confirmed,
    chainStatus:
      mapped.chainStatus ||
      (failed ? "failed" : confirmed ? "confirmed" : "pending"),
    confirmedAt: normalizeOptionalDate(mapped.confirmedAt || mapped.chainTimestamp),
  };
}

async function lookupStatusFromHistory(context, withdrawal, wallet) {
  if (
    !context?.adapter?.transaction?.fetchHistory ||
    !context?.adapter?.mapper?.mapTransaction ||
    !wallet?.address
  ) {
    return null;
  }

  const entries = await context.adapter.transaction.fetchHistory({
    network: withdrawal.network || wallet.network || "mainnet",
    address: wallet.address,
    limit: 100,
  });
  const targetHash = consistencyService.normalizeTxHash(withdrawal.txHash);

  for (const entry of Array.isArray(entries) ? entries : []) {
    const mapped = context.adapter.mapper.mapTransaction(entry, wallet.address);
    if (!mapped) {
      continue;
    }

    if (normalizeLowerString(mapped.direction) !== "outgoing") {
      continue;
    }

    const mappedHash = consistencyService.normalizeTxHash(mapped.txHash);
    if (!mappedHash || mappedHash !== targetHash) {
      continue;
    }

    return buildMappedTxStatus(mapped);
  }

  return null;
}

module.exports = async function withdrawalStatusJob() {
  return withJobLock("withdrawalStatus", async () => {
    try {
      logger.info("Starting withdrawal status job");
      
      // Get pending withdrawals that need status updates
      const pendingWithdrawals = await Withdrawal.find({
        status: { $in: ACTIVE_WITHDRAWAL_STATUSES },
        systemStatus: { $nin: EXCLUDED_SYSTEM_STATUSES },
      })
      .populate('walletId')
      .sort({ createdAt: 1 }) // Oldest first
      .limit(100) // Process in reasonable batches
      .lean();

      if (pendingWithdrawals.length === 0) {
        logger.info("No pending withdrawals found for status checking");
        return { 
          job: "withdrawalStatus", 
          status: "completed", 
          withdrawalsProcessed: 0,
          updated: 0,
          errors: 0
        };
      }

      let updated = 0;
      let errors = 0;

      // Process withdrawals in batches
      for (let i = 0; i < pendingWithdrawals.length; i += BATCH_SIZE) {
        const batch = pendingWithdrawals.slice(i, i + BATCH_SIZE);
        
        logger.info(`Processing withdrawal status batch`, {
          batch: Math.floor(i / BATCH_SIZE) + 1,
          totalBatches: Math.ceil(pendingWithdrawals.length / BATCH_SIZE),
          withdrawalCount: batch.length
        });

        // Process each withdrawal in the batch
        for (const withdrawal of batch) {
          try {
            const result = await processWithdrawalStatus(withdrawal);
            if (result.updated) {
              updated++;
            }
            
            if (result.error) {
              errors++;
              logger.warn(`Error processing withdrawal status ${withdrawal._id}`, { 
                error: result.error 
              });
            }
          } catch (error) {
            errors++;
            logger.error(`Unexpected error processing withdrawal ${withdrawal._id}`, { 
              error: error.message,
              stack: error.stack
            });
          }
        }

        // Rate limiting between batches
        if (i + BATCH_SIZE < pendingWithdrawals.length) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      }

      logger.info("Withdrawal status job completed", {
        withdrawalsProcessed: pendingWithdrawals.length,
        updated,
        errors,
        batches: Math.ceil(pendingWithdrawals.length / BATCH_SIZE)
      });

      return { 
        job: "withdrawalStatus", 
        status: "completed", 
        withdrawalsProcessed: pendingWithdrawals.length,
        updated,
        errors,
        batches: Math.ceil(pendingWithdrawals.length / BATCH_SIZE)
      };
    } catch (error) {
      logger.error("Withdrawal status job failed", { error: error.message });
      return { 
        job: "withdrawalStatus", 
        status: "failed", 
        error: error.message 
      };
    }
  });
};

// Helper function to process individual withdrawal status
async function processWithdrawalStatus(withdrawal) {
  try {
    let relatedTransaction = null;
    if (withdrawal.transactionId) {
      relatedTransaction = await Transaction.findById(withdrawal.transactionId).lean();
    }

    let effectiveWithdrawal = withdrawal;
    if (!effectiveWithdrawal.txHash && relatedTransaction?.txHash) {
      await consistencyService.upsertWithdrawalFromTransaction(relatedTransaction, {
        source: "withdrawal_status",
      });
      effectiveWithdrawal = {
        ...effectiveWithdrawal,
        txHash: relatedTransaction.txHash,
        network: effectiveWithdrawal.network || relatedTransaction.network,
      };
    }

    if (!effectiveWithdrawal.txHash) {
      return { updated: false, error: "No transaction hash" };
    }

    const wallet = effectiveWithdrawal.walletId;
    if (!wallet) {
      return { updated: false, error: "Associated wallet not found" };
    }

    const context = getChainContext(effectiveWithdrawal.chain);
    if (!context) {
      return { updated: false, error: `Unsupported chain: ${effectiveWithdrawal.chain}` };
    }

    // Get transaction status from chain
    let txStatus = null;
    
    try {
      if (effectiveWithdrawal.chain === "xrp") {
        // XRP transaction status checking
        const xrplClient = await require("../Modules/chainAdapters/xrp/client").getClient(
          effectiveWithdrawal.network,
        );
        const txResult = await xrplClient.request({
          command: "tx",
          transaction: effectiveWithdrawal.txHash,
          binary: false
        });

        if (txResult.result) {
          const tx = txResult.result;
          txStatus = {
            validated: tx.validated,
            ledgerIndex: tx.ledger_index,
            confirmations: tx.validated ? 1 : 0,
            final: tx.validated,
            success: tx.meta?.TransactionResult === "tesSUCCESS"
          };
        }
      } else if (effectiveWithdrawal.chain === "solana") {
        // Solana transaction status checking
        const connection = require("../Modules/chainAdapters/solana/client").getConnection(effectiveWithdrawal.network);
        const txResult = await connection.getSignatureStatus(effectiveWithdrawal.txHash);
        
        if (txResult.value) {
          txStatus = {
            confirmed: txResult.value.confirmationStatus === "confirmed",
            confirmations: txResult.value.confirmations || 0,
            final: txResult.value.confirmationStatus === "confirmed",
            success: txResult.value.err === null
          };
        }
      } else if (effectiveWithdrawal.chain === "btc") {
        const btcClient = require("../Modules/chainAdapters/btc/client").getClient(
          effectiveWithdrawal.network,
        );
        const [txResult, tipHeight] = await Promise.all([
          btcClient.fetchTransaction(effectiveWithdrawal.txHash),
          btcClient.fetchTipHeight().catch(() => 0),
        ]);

        if (txResult) {
          const confirmations = computeBtcConfirmations(txResult, tipHeight);
          txStatus = {
            confirmed: txResult.status?.confirmed === true,
            confirmations,
            final: txResult.status?.confirmed === true,
            success: true,
            blockHeight: txResult.status?.block_height,
          };
        } else {
          txStatus = {
            confirmed: false,
            confirmations: 0,
            final: false,
            success: true,
          };
        }
      } else if (effectiveWithdrawal.chain === "hbar") {
        const hbarClient = require("../Modules/chainAdapters/hbar/client").getClient(
          effectiveWithdrawal.network,
        );
        const txResult = await hbarClient.fetchTransaction(effectiveWithdrawal.txHash, {
          allowNotFound: true,
        });

        if (txResult) {
          const result = String(txResult.result || "UNKNOWN").trim().toUpperCase();
          const consensusTimestamp = String(txResult.consensus_timestamp || "").trim();
          txStatus = {
            confirmed: Boolean(consensusTimestamp),
            confirmations: consensusTimestamp ? 1 : 0,
            final: Boolean(consensusTimestamp),
            success: result === "SUCCESS",
            chainStatus: result,
            consensusTimestamp,
          };
        } else {
          txStatus = {
            confirmed: false,
            confirmations: 0,
            final: false,
            success: true,
            chainStatus: "PENDING",
          };
        }
      } else {
        txStatus = await lookupStatusFromHistory(context, effectiveWithdrawal, wallet);
      }
    } catch (chainError) {
      logger.warn(`Failed to check transaction status for ${effectiveWithdrawal.txHash}`, {
        chain: effectiveWithdrawal.chain,
        error: chainError.message
      });

      try {
        txStatus = await lookupStatusFromHistory(context, effectiveWithdrawal, wallet);
      } catch (historyError) {
        logger.warn(`Failed history fallback for withdrawal ${effectiveWithdrawal._id}`, {
          chain: effectiveWithdrawal.chain,
          error: historyError.message,
        });
      }
    }

    if (!txStatus) {
      return {
        updated: false,
        error: `Failed to get transaction status for chain ${effectiveWithdrawal.chain}`,
      };
    }

    // Determine new withdrawal status
    let newStatus = effectiveWithdrawal.status;
    let updateData = {};
    
    if (txStatus.final || txStatus.confirmed) {
      if (txStatus.success) {
        newStatus = "completed";
        updateData = {
          status: newStatus,
          txHash: effectiveWithdrawal.txHash,
          transactionId: effectiveWithdrawal.transactionId || relatedTransaction?._id || undefined,
          network: effectiveWithdrawal.network || relatedTransaction?.network || "",
          chainStatus: txStatus.chainStatus || effectiveWithdrawal.chainStatus || "",
          confirmedAt:
            txStatus.confirmedAt ||
            effectiveWithdrawal.confirmedAt ||
            relatedTransaction?.confirmedAt ||
            new Date(),
          metadata: {
            ...effectiveWithdrawal.metadata,
            chainStatus: txStatus,
            checkedAt: new Date()
          }
        };
      } else {
        newStatus = "failed";
        updateData = {
          status: newStatus,
          txHash: effectiveWithdrawal.txHash,
          transactionId: effectiveWithdrawal.transactionId || relatedTransaction?._id || undefined,
          network: effectiveWithdrawal.network || relatedTransaction?.network || "",
          chainStatus: txStatus.chainStatus || effectiveWithdrawal.chainStatus || "",
          failedAt: effectiveWithdrawal.failedAt || new Date(),
          metadata: {
            ...effectiveWithdrawal.metadata,
            chainStatus: txStatus,
            checkedAt: new Date(),
            failureReason: txStatus.success === false ? "chain_rejected" : "unknown"
          }
        };
      }
    } else {
      newStatus = "processing";
      updateData = {
        status: newStatus,
        txHash: effectiveWithdrawal.txHash,
        transactionId: effectiveWithdrawal.transactionId || relatedTransaction?._id || undefined,
        network: effectiveWithdrawal.network || relatedTransaction?.network || "",
        chainStatus: txStatus.chainStatus || effectiveWithdrawal.chainStatus || "",
        metadata: {
          ...effectiveWithdrawal.metadata,
          chainStatus: txStatus,
          checkedAt: new Date(),
          confirmations: txStatus.confirmations || 0
        }
      };
    }

    // Update withdrawal record
    await Withdrawal.findByIdAndUpdate(effectiveWithdrawal._id, updateData);

    // Also update related transaction record if exists
    try {
      const relatedTx = relatedTransaction || await Transaction.findOne({
        txHash: effectiveWithdrawal.txHash,
        walletId: wallet._id || wallet
      }).lean();

      if (relatedTx) {
        const txUpdateData = {
          systemStatus:
            txStatus.final || txStatus.confirmed
              ? txStatus.success
                ? "completed"
                : "external_failed"
              : "processing",
          status:
            txStatus.final || txStatus.confirmed
              ? txStatus.success ? "success" : "failed"
              : "pending",
          confirmedAt:
            txStatus.final || txStatus.confirmed
              ? txStatus.success
                ? (txStatus.confirmedAt || relatedTx.confirmedAt || new Date())
                : undefined
              : undefined,
          ...(txStatus.chainStatus ? { chainStatus: txStatus.chainStatus } : {}),
          ...(txStatus.confirmations !== undefined && { confirmations: txStatus.confirmations }),
          ...(txStatus.success === false
            ? { errorMessage: relatedTx.errorMessage || `Chain returned ${txStatus.chainStatus || "failed"}` }
            : {}),
          metadata: {
            ...(relatedTx.metadata || {}),
            chainStatus: txStatus,
            checkedAt: new Date()
          }
        };

        await Transaction.findByIdAndUpdate(relatedTx._id, txUpdateData);
        const updatedTx = await Transaction.findById(relatedTx._id).lean();
        socket.emitTransactionUpdate(updatedTx);
      }
    } catch (txError) {
      logger.warn(`Failed to update related transaction for withdrawal ${effectiveWithdrawal._id}`, {
        txHash: effectiveWithdrawal.txHash,
        error: txError.message
      });
    }

    return { 
      updated: newStatus !== effectiveWithdrawal.status,
      withdrawalId: effectiveWithdrawal._id,
      oldStatus: effectiveWithdrawal.status,
      newStatus,
      chainStatus: txStatus
    };
  } catch (error) {
    return { 
      updated: false, 
      withdrawalId: withdrawal._id,
      error: error.message 
    };
  }
}
