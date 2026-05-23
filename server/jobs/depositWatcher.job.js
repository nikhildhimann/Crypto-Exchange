const Deposit = require("../Modules/deposit/model");
const Wallet = require("../Modules/wallet/model");
const Transaction = require("../Modules/transaction/model");
const transactionService = require("../Modules/transaction/service");
const consistencyService = require("../Modules/transaction/consistency.service");
const { getChainContext } = require("../common/utils/chain");
const { withRuntimeChainNetworkFilter } = require("../common/utils/chain");
const logger = require("../common/utils/logger");
const notificationService = require("../services/notifications/service");
const atomicityService = require("../services/atomicity.service");
const { withJobLock } = require("./index");
const socket = require("../lib/socket");

const BATCH_SIZE = 10;
const RATE_LIMIT_DELAY = 1000;
const RIPPLE_EPOCH_OFFSET_MS = 946684800000;
const LEGACY_TXHASH_INDEX = "walletId_1_txHash_1";
const PARTIAL_TXHASH_INDEX = "walletId_txHash_unique_without_vout";
const PARTIAL_TXHASH_VOUT_INDEX = "walletId_txHash_vout_unique";
const COMPAT_TXHASH_VOUT_INDEX = "walletId_txHash_vout_unique_compat";

function normalizeOptionalTimestamp(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function resolveXrpTimestamp(entry = {}) {
  const tx = entry.tx_json && typeof entry.tx_json === "object" ? entry.tx_json : entry.tx;
  const rippleDate =
    typeof tx?.date === "number"
      ? tx.date
      : typeof entry.date === "number"
        ? entry.date
        : null;

  return (
    normalizeOptionalTimestamp(entry.chainTimestamp) ||
    normalizeOptionalTimestamp(entry.close_time_iso) ||
    (typeof rippleDate === "number"
      ? new Date(RIPPLE_EPOCH_OFFSET_MS + rippleDate * 1000)
      : null)
  );
}

function resolveDepositEventTimestamp(wallet, entry = {}) {
  if (wallet?.chain === "xrp") {
    return resolveXrpTimestamp(entry);
  }

  return normalizeOptionalTimestamp(
    entry.chainTimestamp ||
    entry.timestamp ||
    entry.blockTimestamp ||
    null,
  );
}

function resolveNotificationAmount(context, wallet, entry = {}, fallbackAmount = "0") {
  if (wallet?.chain === "xrp") {
    const amountBaseUnits = String(entry.Amount || entry.amountBaseUnits || entry.amount || "0");

    if (/^\d+$/.test(amountBaseUnits)) {
      return context.adapter.amount.fromBaseUnits(amountBaseUnits);
    }
  }

  return String(fallbackAmount || "0");
}

async function createNotificationSafely(payload, logContext = {}, options = {}) {
  try {
    return await notificationService.createAndEmitNotification(payload, options);
  } catch (error) {
    logger.warn("Failed to create deposit notification", {
      ...logContext,
      error: error.message,
    });
    return null;
  }
}

async function ensureDepositIndexes() {
  let indexes = [];
  try {
    indexes = await Deposit.collection.indexes();
  } catch (error) {
    if (
      !error.message.includes("ns does not exist") &&
      !error.message.includes("ns not found") &&
      error.codeName !== "NamespaceNotFound" &&
      error.code !== 26
    ) {
      throw error;
    }
  }
  const staleIndexNames = [PARTIAL_TXHASH_INDEX, PARTIAL_TXHASH_VOUT_INDEX, "txHash_1_chain_1"];
  const hasLegacyUniqueIndex = indexes.some(
    (index) =>
      index.name === LEGACY_TXHASH_INDEX &&
      index.unique === true &&
      !index.partialFilterExpression,
  );
  const hasCompatTxHashLookupIndex = indexes.some(
    (index) =>
      JSON.stringify(index.key) === JSON.stringify({ walletId: 1, txHash: 1 }),
  );
  const hasCompatUniqueTxHashVoutIndex = indexes.some(
    (index) =>
      index.unique === true &&
      JSON.stringify(index.key) === JSON.stringify({ walletId: 1, txHash: 1, vout: 1 }),
  );

  for (const staleIndexName of staleIndexNames) {
    if (indexes.some((index) => index.name === staleIndexName)) {
      await Deposit.collection.dropIndex(staleIndexName);
      logger.info("Dropped incompatible deposit index", {
        indexName: staleIndexName,
      });
    }
  }

  if (!hasCompatTxHashLookupIndex) {
    logger.info("Ensuring deposit lookup index", {
      indexName: "walletId_1_txHash_1_lookup",
    });
    await Deposit.collection.createIndex(
      { walletId: 1, txHash: 1 },
      {
        name: "walletId_1_txHash_1_lookup",
        background: true,
      },
    );
  }

  if (!hasCompatUniqueTxHashVoutIndex) {
    logger.info("Ensuring deposit uniqueness index", {
      indexName: COMPAT_TXHASH_VOUT_INDEX,
    });
    await Deposit.collection.createIndex(
      { walletId: 1, txHash: 1, vout: 1 },
      {
        name: COMPAT_TXHASH_VOUT_INDEX,
        unique: true,
        background: true,
      },
    );
  }

  if (hasLegacyUniqueIndex) {
    logger.info("Running deposit index migration for output-entry-safe txHash+vout dedupe", {
      legacyIndex: LEGACY_TXHASH_INDEX,
      newBtcIndex: COMPAT_TXHASH_VOUT_INDEX,
      fallbackIndex: "walletId_1_txHash_1_lookup",
    });

    await Deposit.collection.dropIndex(LEGACY_TXHASH_INDEX);
    logger.info("Dropped legacy deposit uniqueness index", {
      indexName: LEGACY_TXHASH_INDEX,
    });
  }
}

function extractTxHash(entry = {}) {
  const candidates = [
    entry.txHash,
    entry.hash,
    entry.tx_hash,
    entry.transaction_id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function extractOutputIndex(entry = {}) {
  const candidates = [entry.vout, entry.outputIndex];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function buildDepositIdentityFilter(walletId, txHash, vout) {
  return Number.isInteger(vout)
    ? { walletId, txHash, vout }
    : { walletId, txHash };
}

function resolveDepositAmountBaseUnits(entry = {}) {
  return String(entry.amountBaseUnits || entry.Amount || entry.amount || "0");
}

function resolveDepositStatus(confirmations, entry = {}) {
  if (entry.validated === true || confirmations > 0) {
    return "confirmed";
  }

  return "pending";
}

async function upsertDepositRecord({
  context,
  wallet,
  matchResult,
  entry,
}) {
  const txHash = extractTxHash(entry);
  const vout = extractOutputIndex(entry);
  const filter = buildDepositIdentityFilter(matchResult.walletId, txHash, vout);
  const existingDeposit = await Deposit.findOne(filter).lean();
  const depositAmountBaseUnits = resolveDepositAmountBaseUnits(entry);
  const depositAmount =
    entry.amount ||
    (/^\d+$/.test(depositAmountBaseUnits)
      ? context.adapter.amount.fromBaseUnits(depositAmountBaseUnits)
      : "0");
  const confirmations = Number(entry.confirmations || 0);
  const payload = {
    userId: matchResult.userId,
    accountId: matchResult.accountId,
    walletId: matchResult.walletId,
    chain: wallet.chain,
    network: wallet.network || "mainnet",
    asset: wallet.asset || context.assetSymbol,
    address: matchResult.destinationAddress,
    txHash,
    amount: depositAmount,
    confirmations,
    status: resolveDepositStatus(confirmations, entry),
    chainStatus: entry.chainStatus || (confirmations > 0 ? "confirmed" : "pending"),
    confirmedAt:
      entry.chainTimestamp && (entry.validated === true || confirmations > 0)
        ? new Date(entry.chainTimestamp)
        : undefined,
    metadata: {
      source: "deposit_watcher",
      matchedBy: matchResult.matchedBy || "address",
      destinationTag: matchResult.destinationTag ?? null,
    },
    ...(Number.isInteger(vout) ? { vout } : {}),
  };

  if (existingDeposit) {
    const newStatus = resolveDepositStatus(confirmations, entry);
    const newChainStatus = entry.chainStatus || (confirmations > 0 ? "confirmed" : "pending");
    const isUnchanged =
      existingDeposit.confirmations === confirmations &&
      existingDeposit.status === newStatus &&
      existingDeposit.chainStatus === newChainStatus;

    if (!isUnchanged) {
      await Deposit.updateOne({ _id: existingDeposit._id }, { $set: payload });
    }

    return {
      created: false,
      updated: !isUnchanged,
      depositId: String(existingDeposit._id),
      txHash,
      vout,
      depositAmount,
      depositAmountBaseUnits,
      confirmations,
    };
  }

  const deposit = await Deposit.create(payload);
  return {
    created: true,
    depositId: String(deposit._id),
    txHash,
    vout,
    depositAmount,
    depositAmountBaseUnits,
    confirmations,
  };
}

async function resolveTransactionAggregate({
  context,
  walletId,
  txHash,
  fallbackAmountBaseUnits,
}) {
  const deposits = await Deposit.find({ walletId, txHash })
    .select("amount confirmations")
    .lean();

  if (!deposits.length) {
    return {
      amountBaseUnits: String(fallbackAmountBaseUnits || "0"),
      confirmations: 0,
    };
  }

  const amountBaseUnits = deposits.reduce((total, deposit) => {
    try {
      return total + BigInt(context.adapter.amount.toBaseUnits(deposit.amount || "0"));
    } catch (_error) {
      return total;
    }
  }, 0n);
  const confirmations = deposits.reduce(
    (max, deposit) => Math.max(max, Number(deposit.confirmations || 0)),
    0,
  );

  return {
    amountBaseUnits: amountBaseUnits.toString(),
    confirmations,
  };
}

async function upsertDepositTransaction({
  context,
  wallet,
  matchResult,
  entry,
  txHash,
  depositAmountBaseUnits,
  confirmations,
}) {
  const existingTransaction = await Transaction.findOne({
    walletId: matchResult.walletId,
    txHash,
  }).lean();
  const aggregate =
    Number.isInteger(extractOutputIndex(entry))
      ? await resolveTransactionAggregate({
          context,
          walletId: matchResult.walletId,
          txHash,
          fallbackAmountBaseUnits: depositAmountBaseUnits,
        })
      : {
          amountBaseUnits: depositAmountBaseUnits,
          confirmations,
        };
  const amountBaseUnits = String(aggregate.amountBaseUnits || depositAmountBaseUnits || "0");
  const depositAmount = context.adapter.amount.fromBaseUnits(amountBaseUnits);
  const effectiveConfirmations = Number(aggregate.confirmations || confirmations || 0);
  const validated = entry.validated === true || effectiveConfirmations > 0;
  const payload = {
    userId: matchResult.userId,
    accountId: matchResult.accountId,
    walletId: matchResult.walletId,
    chain: wallet.chain,
    fromAddress: entry.fromAddress || entry.Account || "",
    toAddress: matchResult.destinationAddress || entry.toAddress || wallet.address,
    amount: depositAmount,
    amountBaseUnits,
    currency: wallet.asset || context.assetSymbol,
    asset: wallet.asset || context.assetSymbol,
    network: wallet.network || "mainnet",
    transactionType: "external",
    direction: "incoming",
    type: "deposit",
    networkFee: "0",
    networkFeeBaseUnits: "0",
    platformFee: "0",
    platformFeeBaseUnits: "0",
    totalDebit: "0",
    totalDebitBaseUnits: "0",
    recipientGets: depositAmount,
    recipientGetsBaseUnits: amountBaseUnits,
    txHash,
    confirmations: effectiveConfirmations,
    chainStatus: entry.chainStatus || (validated ? "confirmed" : "pending"),
    systemStatus: validated ? "deposit_confirmed" : "deposit_pending",
    status: validated ? "success" : "pending",
    isSystemManaged: true,
    visibleInSuperadmin: true,
    rawRequest: { entry },
    rawResponse: { entry },
    metadata: {
      source: "deposit_watcher",
      matchedBy: matchResult.matchedBy || "address",
      destinationTag: matchResult.destinationTag ?? null,
    },
    ...(entry.chainTimestamp ? { chainTimestamp: new Date(entry.chainTimestamp) } : {}),
    ...(entry.chainTimestamp && validated
      ? { confirmedAt: new Date(entry.chainTimestamp) }
      : {}),
  };

  if (existingTransaction) {
    const isUnchanged =
      existingTransaction.confirmations === effectiveConfirmations &&
      existingTransaction.status === (validated ? "success" : "pending");

    if (!isUnchanged) {
      await Transaction.updateOne({ _id: existingTransaction._id }, { $set: payload });
      const updatedTransaction = await Transaction.findById(existingTransaction._id).lean();
      socket.emitTransactionUpdate(updatedTransaction);
    }
    return {
      created: false,
      updated: !isUnchanged,
      transactionId: String(existingTransaction._id),
      amount: depositAmount,
    };
  }

  const transaction = await Transaction.create(payload);
  socket.emitTransactionNew(transaction);
  return {
    created: true,
    transactionId: String(transaction._id),
    amount: depositAmount,
  };
}

async function processWalletDeposits(wallet) {
  try {
    const context = getChainContext(wallet.chain);
    let entries = [];
    let watcherError = null;
    try {
      entries = await context.adapter.deposit.watchDeposits({
        network: wallet.network || "mainnet",
        address: wallet.address,
        limit: 50,
      });
    } catch (error) {
      watcherError = error;
      logger.warn("Deposit watcher adapter failed for wallet", {
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network || "mainnet",
        error: error.message,
      });
    }

    let totalEntries = Array.isArray(entries) ? entries.length : 0;
    let newDeposits = 0;

    for (const entry of Array.isArray(entries) ? entries : []) {
      try {
        const txHash = extractTxHash(entry);
        if (!txHash) {
          continue;
        }

        const matchResult =
          typeof context.adapter.deposit.matchDepositToWallet === "function"
            ? await context.adapter.deposit.matchDepositToWallet(
                entry,
                wallet.network || "mainnet",
              )
            : {
                walletId: wallet._id,
                accountId: wallet.accountId,
                userId: wallet.userId,
                matchedBy: "address",
                destinationAddress: wallet.address,
              };

        if (!matchResult || String(matchResult.walletId) !== String(wallet._id)) {
          continue;
        }

        const processingResult = await atomicityService.withLock(
          {
            scope: "chain_event_deposit",
            identity: atomicityService.buildChainEventIdentity({
              chain: wallet.chain,
              txHash,
              address: matchResult.destinationAddress || entry.toAddress || wallet.address,
              walletId: matchResult.walletId,
            }),
            ttlMs: atomicityService.DEFAULT_EVENT_LOCK_TTL_MS,
            logContext: {
              chain: wallet.chain,
              txHash,
              walletId: String(matchResult.walletId || wallet._id),
            },
            onBusy: () => {
              logger.info("Deposit watcher skipped duplicate event because a processing claim already exists", {
                chain: wallet.chain,
                txHash,
                walletId: String(matchResult.walletId || wallet._id),
              });
              return null;
            },
          },
          async () => {
            const depositResult = await upsertDepositRecord({
              context,
              wallet,
              matchResult,
              entry,
            });

            if (depositResult.created || depositResult.updated) {
              logger.info("Deposit detected and matched", {
                userId: String(matchResult.userId),
                walletId: String(matchResult.walletId),
                accountId: matchResult.accountId ? String(matchResult.accountId) : null,
                chain: wallet.chain,
                txHash,
                vout: depositResult.vout,
                amount: depositResult.depositAmount,
                matchedBy: matchResult.matchedBy,
                destinationTag: matchResult.destinationTag,
              });
            }

            const transactionResult = await upsertDepositTransaction({
              context,
              wallet,
              matchResult,
              entry,
              txHash,
              depositAmountBaseUnits: depositResult.depositAmountBaseUnits,
              confirmations: depositResult.confirmations,
            });
            if (depositResult.depositId && transactionResult.transactionId) {
              await Deposit.updateOne(
                { _id: depositResult.depositId },
                { $set: { transactionId: transactionResult.transactionId } },
              );
            }

            if (depositResult.created && transactionResult.created) {
              const eventTimestamp = resolveDepositEventTimestamp(wallet, entry);
              const notificationAmount = resolveNotificationAmount(
                context,
                wallet,
                entry,
                transactionResult.amount,
              );

              await createNotificationSafely({
                userId: String(matchResult.userId),
                type: "PLATFORM_TRANSFER_RECEIVED",
                title: "Payment received",
                message: `You received ${transactionResult.amount} ${wallet.asset || context.assetSymbol}`,
                metadata: {
                  transactionId: transactionResult.transactionId,
                  walletId: String(matchResult.walletId),
                  chain: wallet.chain,
                  network: wallet.network || "mainnet",
                  asset: wallet.asset || context.assetSymbol,
                  amount: transactionResult.amount,
                  direction: "incoming",
                  fromAddress: entry.fromAddress || entry.Account || "",
                  toAddress: matchResult.destinationAddress || entry.toAddress || wallet.address,
                  txHash,
                },
              }, {
                transactionId: transactionResult.transactionId,
                walletId: String(matchResult.walletId),
                source: "depositWatcher",
              }, {
                source: "deposit_watcher",
                eventTimestamp,
                asset: wallet.asset || context.assetSymbol,
                amount: notificationAmount,
              });
            }

            return {
              depositResult,
              transactionResult,
            };
          },
        );

        if (processingResult?.depositResult?.created) {
          newDeposits += 1;
        }
      } catch (entryError) {
        logger.warn("Error processing deposit entry", {
          txHash: extractTxHash(entry),
          walletId: String(wallet._id),
          error: entryError.message,
        });
      }
    }

    if (consistencyService.shouldBackfillDepositFromHistory(wallet.chain)) {
      const depositsBefore = await Deposit.countDocuments({ walletId: wallet._id });

      try {
        const syncResult = await transactionService.syncWalletTransactions(
          wallet.userId,
          wallet._id,
        );
        const depositsAfter = await Deposit.countDocuments({ walletId: wallet._id });
        totalEntries = Math.max(totalEntries, Number(syncResult?.scanned || 0));
        newDeposits = Math.max(newDeposits, Math.max(depositsAfter - depositsBefore, 0));
        watcherError = null;
      } catch (error) {
        watcherError = error;
      }
    }

    return {
      walletId: wallet._id,
      totalEntries,
      newDeposits,
      error: watcherError ? watcherError.message : null,
    };
  } catch (error) {
    return {
      walletId: wallet._id,
      totalEntries: 0,
      newDeposits: 0,
      error: error.message,
    };
  }
}

module.exports = async function depositWatcherJob() {
  return withJobLock("depositWatcher", async () => {
    try {
      logger.info("Starting deposit watcher job");
      await ensureDepositIndexes();

      const watchedWallets = await Wallet.find(withRuntimeChainNetworkFilter({}))
        .select("_id address userId accountId chain asset network")
        .lean();

      if (watchedWallets.length === 0) {
        logger.info("No supported wallets found for deposit watching");
        return {
          job: "depositWatcher",
          status: "completed",
          walletsProcessed: 0,
          totalEntries: 0,
          newDeposits: 0,
        };
      }

      let totalDeposits = 0;
      let newDeposits = 0;
      let errors = 0;

      for (let index = 0; index < watchedWallets.length; index += BATCH_SIZE) {
        const batch = watchedWallets.slice(index, index + BATCH_SIZE);

        logger.info("Processing deposit batch", {
          batch: Math.floor(index / BATCH_SIZE) + 1,
          totalBatches: Math.ceil(watchedWallets.length / BATCH_SIZE),
          walletCount: batch.length,
        });

        for (const watchedWallet of batch) {
          try {
            const walletResult = await processWalletDeposits(watchedWallet);
            totalDeposits += walletResult.totalEntries;
            newDeposits += walletResult.newDeposits;

            if (walletResult.error) {
              errors += 1;
              logger.warn(`Error processing wallet ${watchedWallet._id}`, {
                error: walletResult.error,
              });
            }
          } catch (error) {
            errors += 1;
            logger.error(`Unexpected error processing wallet ${watchedWallet._id}`, {
              error: error.message,
              stack: error.stack,
            });
          }
        }

        if (index + BATCH_SIZE < watchedWallets.length) {
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      }

      logger.info("Deposit watcher job completed", {
        walletsProcessed: watchedWallets.length,
        totalEntries: totalDeposits,
        newDeposits,
        errors,
        batches: Math.ceil(watchedWallets.length / BATCH_SIZE),
      });

      return {
        job: "depositWatcher",
        status: "completed",
        walletsProcessed: watchedWallets.length,
        totalEntries: totalDeposits,
        newDeposits,
        errors,
        batches: Math.ceil(watchedWallets.length / BATCH_SIZE),
      };
    } catch (error) {
      logger.error("Deposit watcher job failed", { error: error.message });
      return {
        job: "depositWatcher",
        status: "failed",
        error: error.message,
      };
    }
  });
};
