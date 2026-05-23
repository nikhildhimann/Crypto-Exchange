const Transaction = require("./model");
const Deposit = require("../deposit/model");
const Withdrawal = require("../withdrawal/model");
const withdrawalRiskService = require("../withdrawal/risk.service");
const logger = require("../../common/utils/logger");
const securityConfig = require("../../config/security");
const socket = require("../../lib/socket");
const atomicityService = require("../../services/atomicity.service");

class TransactionService {
  async loadWithdrawalInitiationResult(transactionId, withdrawalId) {
    const [transaction, withdrawal] = await Promise.all([
      transactionId ? Transaction.findById(transactionId) : Promise.resolve(null),
      withdrawalId ? Withdrawal.findById(withdrawalId) : Promise.resolve(null),
    ]);

    return {
      transaction,
      withdrawal,
    };
  }

  /**
   * Safely handles deposit processing, ensuring no duplicates and consistency.
   * @param {Object} data Transaction data from blockchain or webhook
   */
  async handleDeposit(data) {
    const { txHash, chain, userId, walletId, amount, block_time } = data;

    if (!txHash || !chain) {
      logger.error("Missing txHash or chain for handleDeposit", { data });
      return null;
    }

    return atomicityService.withLock(
      {
        scope: "chain_event_deposit",
        identity: atomicityService.buildChainEventIdentity({
          chain,
          txHash,
          address: data.toAddress,
          walletId,
        }),
        ttlMs: atomicityService.DEFAULT_EVENT_LOCK_TTL_MS,
        busyMessage: "Deposit event is already being processed",
        logContext: {
          chain,
          txHash,
        },
        onBusy: async () => {
          logger.info("Duplicate deposit event ignored while another worker holds the claim", {
            chain,
            txHash,
          });

          const [transaction, deposit] = await Promise.all([
            Transaction.findOne({ txHash, chain }),
            Deposit.findOne({ txHash, chain }),
          ]);

          return { transaction, deposit, duplicate: true };
        },
      },
      async () => {
        try {
          // 1. Check if transaction already exists (Idempotency)
          let transaction = await Transaction.findOne({ txHash, chain });
          let transactionCreated = false;

          if (transaction) {
            const existingDeposit = await Deposit.findOne({ txHash, chain });
            if (
              existingDeposit &&
              existingDeposit.transactionId &&
              transaction.status === (data.status || "success")
            ) {
              logger.info("Deposit already finalized, skipping duplicate processing", {
                txHash,
                chain,
                transactionId: String(transaction._id),
                depositId: String(existingDeposit._id),
              });

              return {
                transaction,
                deposit: existingDeposit,
                duplicate: true,
              };
            }

            logger.info("Transaction already exists, skipping insert", { txHash, chain });
            if (transaction.visibleInSuperadmin !== true) {
              await Transaction.updateOne(
                { _id: transaction._id },
                { $set: { visibleInSuperadmin: true } },
              );
              transaction = await Transaction.findById(transaction._id);
            }
          } else {
            try {
              // 2. Create Transaction record with block_time
              transaction = await Transaction.create({
                ...data,
                transactionType: "external",
                direction: "incoming",
                status: data.status || "success",
                block_time: block_time || new Date(),
                confirmed_at: block_time || new Date(),
                visibleInSuperadmin: true,
              });
              transactionCreated = true;
              logger.info("Created new deposit transaction", { txHash, chain, id: transaction._id });
            } catch (dbError) {
              if (dbError.code === 11000) {
                logger.info("Race condition: Duplicate transaction detected during insert, fetching existing", { txHash, chain });
                transaction = await Transaction.findOne({ txHash, chain });
              } else {
                throw dbError;
              }
            }
          }

          // 3. Sync with Deposit model (idempotent)
          let deposit = await Deposit.findOne({ txHash, chain });
          let depositCreated = false;
          if (!deposit) {
            try {
              deposit = await Deposit.create({
                userId: userId || transaction.userId,
                walletId: walletId || transaction.walletId,
                chain,
                network: data.network || "mainnet",
                asset: data.asset || data.currency,
                address: data.toAddress,
                txHash,
                amount,
                status: "confirmed",
                transactionId: transaction._id,
                block_time: transaction.block_time,
                confirmed_at: transaction.confirmed_at,
                metadata: data.metadata || {},
              });
              depositCreated = true;
              logger.info("Created new deposit record", { txHash, chain, id: deposit._id });
            } catch (dbError) {
              if (dbError.code === 11000) {
                logger.info("Race condition: Duplicate deposit detected during insert, fetching existing", { txHash, chain });
                deposit = await Deposit.findOne({ txHash, chain });
              } else {
                throw dbError;
              }
            }
          } else if (!deposit.transactionId) {
            await Deposit.updateOne({ _id: deposit._id }, { $set: { transactionId: transaction._id } });
          }

          // 4. Emit Real-time event
          if (transactionCreated || depositCreated) {
            socket.emitTransactionNew(transaction);
          }

          return { transaction, deposit };
        } catch (error) {
          logger.error("Error handling deposit", { error: error.message, txHash, chain });
          throw error;
        }
      },
    );
  }

  /**
   * Safely handles withdrawal processing, ensuring no duplicates and consistency.
   * @param {Object} data Withdrawal data from system or blockchain
   */
  async handleWithdrawal(data) {
    const { txHash, chain, userId, walletId, amount, block_time } = data;

    if (!txHash || !chain) {
      logger.error("Missing txHash or chain for handleWithdrawal", { data });
      return null;
    }

    return atomicityService.withLock(
      {
        scope: "chain_event_withdrawal",
        identity: atomicityService.buildChainEventIdentity({
          chain,
          txHash,
          address: data.toAddress || data.destinationAddress,
          walletId,
        }),
        ttlMs: atomicityService.DEFAULT_EVENT_LOCK_TTL_MS,
        busyMessage: "Withdrawal confirmation is already being processed",
        logContext: {
          chain,
          txHash,
        },
        onBusy: async () => {
          logger.info("Duplicate withdrawal confirmation ignored while another worker holds the claim", {
            chain,
            txHash,
          });

          const [transaction, withdrawal] = await Promise.all([
            Transaction.findOne({ txHash, chain }),
            Withdrawal.findOne({ txHash, chain }),
          ]);

          return { transaction, withdrawal, duplicate: true };
        },
      },
      async () => {
        try {
          // 1. Check if transaction already exists
          let transaction = await Transaction.findOne({ txHash, chain });
          let transactionChanged = false;

          if (transaction) {
            const existingWithdrawal = await Withdrawal.findOne({
              $or: [{ txHash, chain }, { transactionId: transaction._id }],
            });
            if (
              existingWithdrawal &&
              String(existingWithdrawal.status || "").toLowerCase() === "completed" &&
              transaction.status === "success"
            ) {
              logger.info("Withdrawal confirmation already finalized, skipping duplicate processing", {
                txHash,
                chain,
                transactionId: String(transaction._id),
                withdrawalId: String(existingWithdrawal._id),
              });

              return {
                transaction,
                withdrawal: existingWithdrawal,
                duplicate: true,
              };
            }

            logger.info("Transaction already exists, updating status", { txHash, chain });
            await Transaction.updateOne(
              { _id: transaction._id },
              {
                $set: {
                  status: "success",
                  block_time: block_time || transaction.block_time || new Date(),
                  confirmed_at: block_time || transaction.confirmed_at || new Date(),
                  visibleInSuperadmin: true,
                },
              },
            );
            transaction = await Transaction.findById(transaction._id);
            transactionChanged = true;
          } else {
            try {
              // 2. Create Transaction record with block_time
              transaction = await Transaction.create({
                ...data,
                transactionType: "external",
                direction: "outgoing",
                status: "success",
                block_time: block_time || new Date(),
                confirmed_at: block_time || new Date(),
                visibleInSuperadmin: true,
              });
              transactionChanged = true;
              logger.info("Created new withdrawal transaction from blockchain sync", { txHash, chain, id: transaction._id });
            } catch (dbError) {
              if (dbError.code === 11000) {
                transaction = await Transaction.findOne({ txHash, chain });
              } else {
                throw dbError;
              }
            }
          }

          // 3. Sync with Withdrawal model (idempotent)
          let withdrawal = await Withdrawal.findOne({ txHash, chain });
          let withdrawalChanged = false;
          if (!withdrawal) {
            // Find by transactionId if txHash was just updated on an existing pending record
            withdrawal = await Withdrawal.findOne({ transactionId: transaction._id });
          }

          if (!withdrawal) {
            withdrawal = await Withdrawal.create({
              userId: userId || transaction.userId,
              walletId: walletId || transaction.walletId,
              chain,
              network: data.network || "mainnet",
              asset: data.asset || data.currency,
              amount,
              destinationAddress: data.toAddress || data.destinationAddress,
              txHash,
              status: "completed",
              reference: data.reference || `ext-${txHash}`,
              transactionId: transaction._id,
              block_time: transaction.block_time,
              confirmed_at: transaction.confirmed_at,
              metadata: data.metadata || {},
            });
            withdrawalChanged = true;
          } else {
            await Withdrawal.updateOne(
              { _id: withdrawal._id },
              {
                $set: {
                  status: "completed",
                  transactionId: transaction._id,
                  block_time: transaction.block_time,
                  confirmed_at: transaction.confirmed_at,
                  txHash,
                },
              },
            );
            withdrawalChanged = true;
          }

          // 4. Emit Real-time success
          if (transactionChanged || withdrawalChanged) {
            socket.emitTransactionUpdate(transaction);
          }

          return { transaction, withdrawal };
        } catch (error) {
          logger.error("Error handling withdrawal confirmation", { error: error.message, txHash, chain });
          throw error;
        }
      },
    );
  }

  /**
   * Initiates a withdrawal, creating a pending transaction and emitting events.
   * @param {Object} data 
   */
  async initiateWithdrawal(data) {
    const { userId, walletId, amount, chain, toAddress, asset } = data;

    return atomicityService.withIdempotentOperation(
      {
        scope: "withdrawal_request",
        identity: atomicityService.buildWithdrawalOperationIdentity({
          ...data,
          userId,
          walletId,
          chain,
          destinationAddress: toAddress,
          asset,
        }),
        ttlMs: atomicityService.DEFAULT_OPERATION_LOCK_TTL_MS,
        completedTtlMs: securityConfig.idempotencyTtlMs,
        busyMessage: "A matching withdrawal request is already being processed",
        logContext: {
          userId: String(userId || ""),
          walletId: String(walletId || ""),
          chain,
        },
        loadResult: ({ transactionId, withdrawalId }) =>
          this.loadWithdrawalInitiationResult(transactionId, withdrawalId),
        storeResult(result = {}) {
          return {
            transactionId: result.transaction?._id ? String(result.transaction._id) : "",
            withdrawalId: result.withdrawal?._id ? String(result.withdrawal._id) : "",
          };
        },
      },
      async () => {
        return atomicityService.withLock(
          {
            scope: "withdrawal_risk_scope",
            identity: {
              userId,
              chain,
            },
            ttlMs: atomicityService.DEFAULT_OPERATION_LOCK_TTL_MS,
            busyMessage: "Another withdrawal request is already being processed for this user",
            logContext: {
              userId: String(userId || ""),
              walletId: String(walletId || ""),
              chain,
            },
          },
          async () => {
            try {
              // 0. Get wallet address
              const wallet = await (require("../wallet/model")).findOne({ _id: walletId, userId }).lean();
              if (!wallet) throw new Error("Wallet not found");

              const riskEvaluation = await withdrawalRiskService.evaluate({
                userId,
                wallet,
                chain,
                network: data.network || wallet.network || "mainnet",
                amount,
                asset,
                destinationAddress: toAddress,
                executionParams: data.executionParams || {},
              });

              withdrawalRiskService.assertAllowed(riskEvaluation);

              const normalizedAmount = riskEvaluation.requestedAmount;
              const normalizedDestinationAddress = riskEvaluation.destinationAddress;
              const normalizedAsset = riskEvaluation.assetDescriptor.asset;

              const existingPendingWithdrawal = await Withdrawal.findOne({
                userId,
                walletId,
                chain,
                destinationAddress: normalizedDestinationAddress,
                amount: normalizedAmount,
                asset: normalizedAsset,
                status: { $in: ["created", "pending", "processing"] },
                createdAt: {
                  $gte: new Date(Date.now() - securityConfig.idempotencyTtlMs),
                },
              })
                .sort({ createdAt: -1 })
                .lean();

              if (existingPendingWithdrawal?._id) {
                logger.info("Duplicate withdrawal request resolved to existing pending withdrawal", {
                  userId: String(userId || ""),
                  walletId: String(walletId || ""),
                  withdrawalId: String(existingPendingWithdrawal._id),
                  chain,
                  systemStatus: existingPendingWithdrawal.systemStatus || "",
                });

                return this.loadWithdrawalInitiationResult(
                  existingPendingWithdrawal.transactionId
                    ? String(existingPendingWithdrawal.transactionId)
                    : "",
                  String(existingPendingWithdrawal._id),
                );
              }

              const riskMetadata = withdrawalRiskService.buildPersistedRiskMetadata(
                riskEvaluation,
              );
              const requiresReview = riskEvaluation.decision === "requires_review";
              const systemStatus = requiresReview ? riskEvaluation.systemStatus : "";
              const network = data.network || wallet.network || "mainnet";

              // 1. Create pending transaction
              const transaction = await Transaction.create({
                userId,
                accountId: wallet.accountId || undefined,
                walletId,
                chain,
                amount: normalizedAmount,
                amountBaseUnits: riskEvaluation.requestedAmountBaseUnits,
                fromAddress: wallet.address,
                toAddress: normalizedDestinationAddress,
                executionParams: riskEvaluation.executionParams || {},
                asset: normalizedAsset,
                currency: riskEvaluation.assetDescriptor.symbol,
                assetType: riskEvaluation.assetDescriptor.assetType,
                standard: riskEvaluation.assetDescriptor.standard,
                contractAddress: riskEvaluation.assetDescriptor.contractAddress,
                direction: "outgoing",
                transactionType: "external",
                status: "pending",
                chainStatus: "not_submitted",
                systemStatus: systemStatus || "created",
                network,
                visibleInSuperadmin: true,
                metadata: {
                  risk: riskMetadata,
                },
              });

              // 2. Create withdrawal record
              const withdrawal = await Withdrawal.create({
                userId,
                accountId: wallet.accountId || undefined,
                walletId,
                chain,
                amount: normalizedAmount,
                destinationAddress: normalizedDestinationAddress,
                executionParams: riskEvaluation.executionParams || {},
                asset: normalizedAsset,
                status: "pending",
                reference: `WD-${Date.now()}`,
                transactionId: transaction._id,
                network,
                systemStatus,
                metadata: {
                  risk: riskMetadata,
                },
              });

              if (requiresReview) {
                logger.warn("Withdrawal request persisted in review-required state", {
                  userId: String(userId || ""),
                  walletId: String(walletId || ""),
                  transactionId: String(transaction._id),
                  withdrawalId: String(withdrawal._id),
                  chain,
                  reasons: riskEvaluation.reasons,
                });
              }

              // 3. Emit pending event
              this.notifyPending(transaction);

              return { transaction, withdrawal };
            } catch (error) {
              logger.error("Error initiating withdrawal", {
                userId: String(userId || ""),
                walletId: String(walletId || ""),
                chain,
                error: error.message,
              });
              throw error;
            }
          },
        );
      },
    );
  }

  /**
   * Emits a pending event for a newly initiated transaction
   * @param {Object} transaction 
   */
  async notifyPending(transaction) {
    socket.emitTransactionNew(transaction);
  }
}

module.exports = new TransactionService();
