const Wallet = require("../wallet/model");
const Transaction = require("./model");
const TransactionSyncJob = require("./syncJob.model");
const transactionQueue = require("../../services/queue/transaction.queue");
const accountService = require("../accounts/service");
const ledgerService = require("./ledger.service");
const appConfig = require("../../config/app");
const securityConfig = require("../../config/security");
const balanceService = require("../balance/service");
const signingService = require("../security/signing.service");
const notificationService = require("../../services/notifications/service");
const transactionConfig = require("../../config/transactions");
const feeService = require("./fee.service");
const internalTransferService = require("./internalTransfer.service");
const consistencyService = require("./consistency.service");
const socket = require("../../lib/socket");
const {
  assertChainFeature,
  assertSupportedChainNetwork,
  getChainAssetSymbol,
  getChainContext,
  withRuntimeChainNetworkFilter,
} = require("../../common/utils/chain");
const {
  buildNativeAssetDescriptor,
  fromAssetBaseUnits,
  normalizeAssetAmount,
  resolveSupportedAsset,
  toAssetBaseUnits,
} = require("../../common/utils/assets");
const errorCodes = require("../../common/constants/errorCodes");
const { redactObject } = require("../../helpers/redact");
const { AppError } = require("../../helpers/errors");
const logger = require("../../common/utils/logger");
const { addBaseUnits, isBaseUnitsGte } = require("../../common/utils/amount");
const {
  normalizeExecutionParamsObject,
} = require("../../common/utils/executionParams");
const {
  buildWalletVisibilityFilter,
  isWalletArchived,
} = require("../../common/utils/walletState");
const { normalizeTxHash } = require("../../common/utils/txHash");
const {
  reconcilePendingTransactionsForWallet,
} = require("../chainAdapters/utxo/pendingReconciliation.service");
const {
  buildXrpAccountNotActivatedError,
} = require("../chainAdapters/xrp/errors");
const atomicityService = require("../../services/atomicity.service");
const {
  buildNftHistoryTransactionPayload,
  getNftStandardStorageVariants,
  normalizeNftDirection,
  normalizeNftHistoryIdentity,
} = require("../nft/history.utils");

function buildSafeTransaction(value) {
  return redactObject(value);
}

async function detectAndGroupSwapTransactions(userId, transactions) {
  const Swap = require("../swap/model");
  const logger = require("../../common/utils/logger");
  
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return transactions;
  }

  try {
    // Extract potential swap-related transactions
    const potentialSwapTxs = transactions.filter(tx => 
      tx.metadata?.swap || 
      tx.transactionType === "send" || 
      tx.transactionType === "receive"
    );

    if (potentialSwapTxs.length === 0) {
      return transactions;
    }

    // Get all swaps for this user
    const userSwaps = await Swap.find({ userId }).lean();
    if (userSwaps.length === 0) {
      return transactions;
    }

    // Create maps for efficient lookup
    const swapBySwapId = new Map();
    const swapBySourceTxHash = new Map();
    const swapByPayoutTxHash = new Map();
    const swapByConversionId = new Map();

    userSwaps.forEach(swap => {
      if (swap.swapId) swapBySwapId.set(swap.swapId, swap);
      if (swap.conversionId) swapByConversionId.set(swap.conversionId, swap);
      if (swap.sourceTxHash) swapBySourceTxHash.set(swap.sourceTxHash, swap);
      if (swap.payoutTxHash) swapByPayoutTxHash.set(swap.payoutTxHash, swap);
    });

    // Group transactions by swap
    const groupedSwaps = new Map();
    const nonSwapTransactions = [];
    const processedTxIds = new Set();

    transactions.forEach(tx => {
      let matchedSwap = null;
      let matchReason = null;

      // Check for direct swap metadata
      if (tx.metadata?.swap?.swapId) {
        matchedSwap = swapBySwapId.get(tx.metadata.swap.swapId);
        matchReason = "metadata_swapId";
      }
      
      // Check by conversionId
      if (!matchedSwap && tx.metadata?.swap?.conversionId) {
        matchedSwap = swapByConversionId.get(tx.metadata.swap.conversionId);
        matchReason = "metadata_conversionId";
      }

      // Check by transaction hash
      if (!matchedSwap && tx.txHash) {
        matchedSwap = swapBySourceTxHash.get(tx.txHash) || swapByPayoutTxHash.get(tx.txHash);
        matchReason = matchedSwap ? "txHash_match" : null;
      }

      // Check by amount and timestamp window if still no match
      if (!matchedSwap && (tx.transactionType === "send" || tx.transactionType === "receive")) {
        const txTimestamp = tx.chainTimestamp || tx.confirmedAt || tx.createdAt;
        if (txTimestamp) {
          for (const swap of userSwaps) {
            const swapTimestamp = swap.createdAt;
            const timeDiff = Math.abs(new Date(txTimestamp) - new Date(swapTimestamp));
            
            // Within 30 minute window
            if (timeDiff <= 30 * 60 * 1000) {
              // Check amount and asset match
              const txAmount = tx.amountBaseUnits || "0";
              const swapAmount = tx.transactionType === "send" 
                ? swap.sourceAmountBaseUnits 
                : (
                    swap.finalReceiveAmountBaseUnits ||
                    swap.estimatedReceiveAmountBaseUnits
                  );
              
              if (txAmount === swapAmount) {
                matchedSwap = swap;
                matchReason = "amount_timestamp_match";
                break;
              }
            }
          }
        }
      }

      if (matchedSwap) {
        const swapKey = matchedSwap.swapId || matchedSwap._id.toString();
        
        if (!groupedSwaps.has(swapKey)) {
          groupedSwaps.set(swapKey, {
            swap: matchedSwap,
            transactions: [],
            matchReasons: new Set()
          });
        }
        
        const group = groupedSwaps.get(swapKey);
        group.transactions.push(tx);
        group.matchReasons.add(matchReason);
        processedTxIds.add(tx._id.toString());
      } else if (!processedTxIds.has(tx._id.toString())) {
        nonSwapTransactions.push(tx);
      }
    });

    // Convert grouped swaps to normalized transaction records
    const normalizedSwapTransactions = Array.from(groupedSwaps.values()).map(group => {
      const swap = group.swap;
      const transactions = group.transactions;
      const sourceAmount = swap.sourceAmount || "0";
      const destinationAmount =
        swap.finalReceiveAmount || swap.estimatedReceiveAmount || "0";
      const sourceTxHash = swap.sourceTxHash || "";
      const payoutTxHash = swap.payoutTxHash || "";
      const sourceAmountBaseUnits = swap.sourceAmountBaseUnits || "0";
      const destinationAmountBaseUnits =
        swap.finalReceiveAmountBaseUnits ||
        swap.estimatedReceiveAmountBaseUnits ||
        "0";
      const swapMetadata = {
        swapId: swap.swapId || swap._id.toString(),
        conversionId: swap.conversionId || null,
        role: "source_transfer",
        sourceAmount,
        sourceAmountBaseUnits,
        estimatedReceiveAmount: swap.estimatedReceiveAmount || "0",
        estimatedReceiveAmountBaseUnits:
          swap.estimatedReceiveAmountBaseUnits || "0",
        finalReceiveAmount: swap.finalReceiveAmount || null,
        finalReceiveAmountBaseUnits: swap.finalReceiveAmountBaseUnits || null,
        sourceAsset: swap.fromAsset,
        destinationAsset: swap.toAsset,
        sourceChain: swap.fromChain,
        sourceNetwork: swap.fromNetwork,
        destinationChain: swap.toChain,
        destinationNetwork: swap.toNetwork,
        sourceTxHash,
        payoutTxHash,
        sourceNetworkFee: swap.sourceNetworkFee || "0",
        sourceNetworkFeeBaseUnits: swap.sourceNetworkFeeBaseUnits || "0",
        payoutNetworkFee:
          swap.payoutNetworkFee || swap.payoutNetworkFeeEstimate || "0",
        payoutNetworkFeeBaseUnits:
          swap.payoutNetworkFeeBaseUnits ||
          swap.payoutNetworkFeeEstimateBaseUnits ||
          "0",
        systemFeeAmount: swap.systemFeeAmount || "0",
        systemFeeAmountBaseUnits: swap.systemFeeAmountBaseUnits || "0",
        status: swap.status,
      };
      
      return {
        id: swap.swapId || swap._id.toString(),
        type: "swap",
        transactionType: "swap",
        direction: "swap",
        isSwap: true,
        isNft: false,
        nft: null,
        swapId: swap.swapId,
        conversionId: swap.conversionId,
        fromAsset: swap.fromAsset,
        toAsset: swap.toAsset,
        fromAmount: sourceAmount,
        toAmount: destinationAmount,
        sourceAmount,
        sourceAmountBaseUnits,
        destinationAmount,
        destinationAmountBaseUnits,
        estimatedReceiveAmount: swap.estimatedReceiveAmount || "0",
        estimatedReceiveAmountBaseUnits:
          swap.estimatedReceiveAmountBaseUnits || "0",
        finalReceiveAmount: swap.finalReceiveAmount || null,
        finalReceiveAmountBaseUnits: swap.finalReceiveAmountBaseUnits || null,
        status: swap.status,
        succeeded: swap.status === "completed",
        validated: ["completed", "failed", "payout_failed", "manual_review", "expired"].includes(swap.status),
        chainStatus: swap.status,
        createdAt: swap.createdAt,
        updatedAt: swap.updatedAt,
        displayTimestamp: swap.createdAt,
        dateTimeLabel: swap.createdAt ? new Date(swap.createdAt).toLocaleDateString() : "Date unavailable",
        sourceChain: swap.fromChain,
        destinationChain: swap.toChain,
        sourceNetwork: swap.fromNetwork,
        destinationNetwork: swap.toNetwork,
        failureReason: swap.failureReason,
        // Include original transaction data for compatibility
        _id: swap._id,
        userId: swap.userId,
        walletId: transactions[0]?.walletId, // Use first transaction's walletId
        // Include metadata for transaction details
        metadata: {
          ...(swap.metadata && typeof swap.metadata === "object" && !Array.isArray(swap.metadata)
            ? swap.metadata
            : {}),
          swap: swapMetadata,
          originalTransactions: transactions.map(tx => ({
            id: tx._id,
            txHash: tx.txHash,
            transactionType: tx.transactionType,
            amount: tx.amount,
            asset: tx.asset,
            role: tx.metadata?.swap?.role
          })),
          matchReasons: Array.from(group.matchReasons),
          isImportedSwapGroup: true
        },
        swap: swapMetadata,
        // Preserve transaction structure for compatibility
        amount: destinationAmount,
        asset: swap.toAsset,
        symbol: swap.toAsset,
        currency: swap.toAsset,
        amountBaseUnits: destinationAmountBaseUnits,
        sourceTxHash,
        payoutTxHash,
        sourceNetworkFee: swap.sourceNetworkFee || "0",
        sourceNetworkFeeBaseUnits: swap.sourceNetworkFeeBaseUnits || "0",
        payoutNetworkFee:
          swap.payoutNetworkFee || swap.payoutNetworkFeeEstimate || "0",
        payoutNetworkFeeBaseUnits:
          swap.payoutNetworkFeeBaseUnits ||
          swap.payoutNetworkFeeEstimateBaseUnits ||
          "0",
        systemFeeAmount: swap.systemFeeAmount || "0",
        toAddress: transactions[0]?.toAddress,
        fromAddress: transactions[0]?.fromAddress,
        network: swap.fromNetwork,
        chain: swap.fromChain
      };
    });

    // Combine normalized swaps with non-swap transactions
    const allTransactions = [...normalizedSwapTransactions, ...nonSwapTransactions];
    
    // Sort by timestamp (most recent first)
    allTransactions.sort((a, b) => {
      const aTime = new Date(a.displayTimestamp || a.createdAt || 0);
      const bTime = new Date(b.displayTimestamp || b.createdAt || 0);
      return bTime - aTime;
    });

    logger.info("Detected and grouped old swap transactions", {
      userId,
      totalTransactions: transactions.length,
      groupedSwaps: groupedSwaps.size,
      normalizedSwapTransactions: normalizedSwapTransactions.length,
      nonSwapTransactions: nonSwapTransactions.length
    });

    return allTransactions;
  } catch (error) {
    logger.error("Failed to detect and group swap transactions", {
      userId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    // Return original transactions if grouping fails
    return transactions;
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAddress(address) {
  return String(address).trim();
}

function buildPreviewValidationContext(error) {
  if (!error?.errors || typeof error.errors !== "object" || Array.isArray(error.errors)) {
    return null;
  }

  return { ...error.errors };
}

const operationsConfig = require("../../config/operations");

const HISTORY_PENDING_RECONCILIATION_WINDOW_MS =
  operationsConfig.sync.historyPendingReconciliationWindowMs;
const PENDING_DETAIL_REFRESH_INTERVAL_MS =
  operationsConfig.sync.historyPendingDetailRefreshMs;
const HISTORY_BOOTSTRAP_RECENT_PROVISIONING_WINDOW_MS =
  operationsConfig.sync.historyBootstrapRecentProvisioningWindowMs;
const USER_HISTORY_BOOTSTRAP_WALLET_LIMIT =
  operationsConfig.sync.historyBootstrapWalletLimit;
const HISTORY_SYNC_COOLDOWN_MS = operationsConfig.sync.historyCooldownMs;
// Pending rows older than this window are skipped during semantic reconciliation.
// A row this old cannot be the counterpart of a fresh chain-sync event.
// Sourced from config with a safe 7-day default; does not affect confirmed or failed rows.
const PENDING_STALE_THRESHOLD_MS =
  operationsConfig.sync.pendingStaleThresholdMs;
// How often a wallet-level pending sweep can re-fire per wallet.
// Prevents concurrent transaction detail/list reads from each triggering a full sync.
const PENDING_SWEEP_COOLDOWN_MS = operationsConfig.sync.pendingSweepCooldownMs;
const historySyncInFlight = new Map();
// Tracks the last time a wallet-level pending sweep completed, keyed by walletId.
// Used to gate re-sweeps within PENDING_SWEEP_COOLDOWN_MS.
const pendingSweepLastRan = new Map();

function isRuntimeVisibleNetwork(chain, network) {
  try {
    assertSupportedChainNetwork(chain, network);
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeTimestampValue(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function shouldRefreshPendingTransactionDetails(transaction = {}) {
  if (!transaction || transaction.status !== "pending") {
    return false;
  }

  if (
    String(transaction.transactionType || "")
      .trim()
      .toLowerCase() !== "external"
  ) {
    return false;
  }

  const lastUpdatedAt = normalizeTimestampValue(
    transaction.updatedAt || transaction.createdAt,
  );
  if (!lastUpdatedAt) {
    return true;
  }

  return (
    Date.now() - lastUpdatedAt.getTime() >= PENDING_DETAIL_REFRESH_INTERVAL_MS
  );
}

function wasRecentlyProvisioned(wallet = {}) {
  const createdAt = normalizeTimestampValue(wallet?.createdAt);
  if (!createdAt) {
    return false;
  }

  return (
    Date.now() - createdAt.getTime() <=
    HISTORY_BOOTSTRAP_RECENT_PROVISIONING_WINDOW_MS
  );
}

function isWalletPendingRecovery(wallet = {}) {
  return (
    String(wallet?.metadata?.provisioning?.status || "")
      .trim()
      .toLowerCase() === "pending_recovery" ||
    wallet?.metadata?.provisioning?.recoveryPending === true ||
    wallet?.metadata?.provisioning?.discoveryPending === true
  );
}

function shouldBootstrapWalletHistory(wallet = {}, transactionCount = 0) {
  const hasCompletedHistorySync = Boolean(
    wallet?.metadata?.historySync?.completedAt,
  );
  const sourceType = String(wallet?.sourceType || "")
    .trim()
    .toLowerCase();
  const isProvisionedWallet =
    sourceType === "imported" || sourceType === "created";

  return (
    isWalletPendingRecovery(wallet) ||
    !hasCompletedHistorySync ||
    transactionCount === 0 ||
    (isProvisionedWallet && wasRecentlyProvisioned(wallet))
  );
}

function isForcedHistorySync(options = {}) {
  return (
    options.force === true ||
    options.forceSync === true ||
    options.forceRefresh === true
  );
}

function getHistorySyncKey(userId, walletId) {
  return `${String(userId || "").trim()}:${String(walletId || "").trim()}`;
}

async function withHistorySyncDedup(userId, walletId, callback) {
  const key = getHistorySyncKey(userId, walletId);
  const inFlight = historySyncInFlight.get(key);

  if (inFlight) {
    return inFlight;
  }

  const request = Promise.resolve()
    .then(callback)
    .finally(() => {
      historySyncInFlight.delete(key);
    });

  historySyncInFlight.set(key, request);
  return request;
}

function shouldSkipRecentHistorySync(wallet = {}, options = {}) {
  if (isForcedHistorySync(options) || isWalletPendingRecovery(wallet)) {
    return false;
  }

  if (!wallet?.metadata?.historySync?.completedAt) {
    return false;
  }

  const lastSyncedAt = normalizeTimestampValue(
    wallet?.metadata?.historySync?.lastSyncedAt,
  );
  if (!lastSyncedAt) {
    return false;
  }

  return Date.now() - lastSyncedAt.getTime() < HISTORY_SYNC_COOLDOWN_MS;
}

function getExecutionStatus(result) {
  const normalizedChainStatus = String(result?.chainStatus || "")
    .trim()
    .toLowerCase();

  if (result.succeeded) {
    return "success";
  }

  if (
    normalizedChainStatus === "failed" ||
    normalizedChainStatus === "rejected" ||
    normalizedChainStatus === "submit_failed" ||
    normalizedChainStatus === "error"
  ) {
    return "failed";
  }

  return result.validated ? "failed" : "pending";
}

function isAcceptedPendingSubmission(result = {}) {
  if (result.succeeded || result.validated) {
    return false;
  }

  const normalizedChainStatus = String(result.chainStatus || "")
    .trim()
    .toLowerCase();
  return (
    normalizedChainStatus === "submitted" || normalizedChainStatus === "pending"
  );
}

async function createNotificationSafely(
  payload,
  logContext = {},
  options = {},
) {
  try {
    return await notificationService.createAndEmitNotification(
      payload,
      options,
    );
  } catch (error) {
    logger.warn("Failed to create notification", {
      ...logContext,
      error: error.message,
    });
    return null;
  }
}

function emitSocketEventSafely(methodName, payload, logContext = {}) {
  try {
    const socketMethod = socket?.[methodName];
    if (typeof socketMethod === "function") {
      socketMethod(payload);
    }
  } catch (error) {
    logger.warn("Failed to emit transaction socket event", {
      ...logContext,
      methodName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function forceWalletBalanceRefreshSafely(
  userId,
  walletId,
  options = {},
) {
  if (!userId || !walletId) {
    return null;
  }

  try {
    await balanceService.invalidateBalanceReadState(String(userId), {
      clearPortfolioSnapshot: true,
    });

    return await balanceService.getWalletBalance(
      String(userId),
      String(walletId),
      {
        force: true,
        trigger: options.trigger || "transaction_post_submit",
      },
    );
  } catch (error) {
    logger.warn("Failed to force wallet balance refresh", {
      ...options.logContext,
      userId: String(userId),
      walletId: String(walletId),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

class TransactionService {
  constructor() {
    this.systemWalletCache = new Map();
  }

  buildSensitiveOperationContext(input = {}) {
    return {
      requestId: input.requestId || null,
      userId: input.userId ? String(input.userId) : null,
      walletId: input.walletId ? String(input.walletId) : null,
      transactionId: input.transactionId ? String(input.transactionId) : null,
      chain: String(input.chain || "").trim(),
      network: String(input.network || "").trim(),
      operation: String(input.operation || "").trim(),
      source: String(input.source || "transaction_service").trim(),
    };
  }

  logSensitiveOperation(level, message, input = {}, extra = {}) {
    logger[level](message, {
      ...this.buildSensitiveOperationContext(input),
      ...extra,
    });
  }

  createDeferredMnemonicProvider(input = {}) {
    let mnemonicPromise = null;

    return async () => {
      if (!mnemonicPromise) {
        mnemonicPromise = signingService.getWalletMnemonic(
          input.walletId,
          input.userId,
          {
            operation: input.operation || "transaction_signing",
            source: input.source || "transaction_service",
            requestId: input.requestId || null,
            transactionId: input.transactionId || null,
          },
        ).catch((error) => {
          mnemonicPromise = null;
          throw error;
        });
      }

      return mnemonicPromise;
    };
  }

  isPlatformFeeEnabled() {
    return Boolean(
      appConfig.systemFee?.enabled && appConfig.platformFee?.enabled,
    );
  }

  getContext(chain) {
    return getChainContext(chain);
  }

  getPlatformTransferSettlementMode() {
    return transactionConfig.platformTransferSettlementMode;
  }

  shouldUseLocalInternalSettlement(recipientResolution) {
    return Boolean(
      recipientResolution?.isSamePlatform &&
      transactionConfig.useLocalInternalSettlement(),
    );
  }

  resolvePlatformTransferSettlementMode(recipientResolution) {
    if (!recipientResolution?.isSamePlatform) {
      return "onchain";
    }

    return this.shouldUseLocalInternalSettlement(recipientResolution)
      ? "local_internal"
      : transactionConfig.platformTransferSettlementMode;
  }

  toBaseUnits(context, amount) {
    return context.adapter.amount.toBaseUnits(amount);
  }

  fromBaseUnits(context, amountBaseUnits) {
    return context.adapter.amount.fromBaseUnits(amountBaseUnits);
  }

  normalizeAmount(context, amount) {
    return context.adapter.amount.normalizeDisplayAmount(amount);
  }

  normalizeTransferAmount(assetDescriptor, amount) {
    return normalizeAssetAmount(assetDescriptor, amount);
  }

  toTransferBaseUnits(assetDescriptor, amount) {
    return toAssetBaseUnits(assetDescriptor, amount);
  }

  fromTransferBaseUnits(assetDescriptor, amountBaseUnits) {
    return fromAssetBaseUnits(assetDescriptor, amountBaseUnits);
  }

  getConfiguredMaxTransferAmount(assetDescriptor) {
    const configuredLimit = String(
      securityConfig.withdrawalRisk?.maxPerTx || "",
    ).trim();

    if (!configuredLimit) {
      return null;
    }

    const amount = this.normalizeTransferAmount(assetDescriptor, configuredLimit);
    const baseUnits = this.toTransferBaseUnits(assetDescriptor, amount);

    return BigInt(baseUnits) > 0n ? { amount, baseUnits } : null;
  }

  assertRequestedTransferAmount({
    input,
    destination,
    assetDescriptor,
    balance,
  }) {
    if (this.isSendMaxRequested(input)) {
      return;
    }

    const normalizedAmount = this.normalizeTransferAmount(
      assetDescriptor,
      input.amount,
    );
    const amountBaseUnits = this.toTransferBaseUnits(
      assetDescriptor,
      normalizedAmount,
    );

    if (BigInt(amountBaseUnits) <= 0n) {
      throw AppError.validation("Amount must be greater than zero");
    }

    const availableBalanceBaseUnits = this.getAssetBalanceBaseUnits(
      balance,
      assetDescriptor,
    );
    if (!isBaseUnitsGte(availableBalanceBaseUnits, amountBaseUnits)) {
      throw AppError.validation("Insufficient balance");
    }

    if (!destination?.isInternal) {
      const configuredMax = this.getConfiguredMaxTransferAmount(assetDescriptor);
      if (
        configuredMax &&
        BigInt(amountBaseUnits) > BigInt(configuredMax.baseUnits)
      ) {
        throw AppError.validation(
          "Amount exceeds the maximum allowed per transaction",
        );
      }
    }
  }

  resolveTransferAsset(wallet, requestedAsset) {
    return resolveSupportedAsset(wallet.chain, wallet.network, requestedAsset);
  }

  getAsset(wallet, context) {
    return getChainAssetSymbol(wallet, context.chain);
  }

  getFeeAsset(context, network) {
    return buildNativeAssetDescriptor(context.chain, network);
  }

  getAssetBalanceBaseUnits(balance, assetDescriptor) {
    if (!assetDescriptor || assetDescriptor.assetType !== "token") {
      return this.getAvailableBalanceBaseUnits(
        this.getContext(balance.chain),
        balance,
      );
    }

    const tokenBalances = Array.isArray(balance?.tokenBalances)
      ? balance.tokenBalances
      : [];
    const tokenBalance = tokenBalances.find(
      (entry) =>
        String(entry.asset || "").toUpperCase() === assetDescriptor.asset,
    );

    if (!tokenBalance) {
      return "0";
    }

    return String(
      tokenBalance.availableBaseUnits || tokenBalance.baseUnitBalance || "0",
    );
  }

  getChainStatusFields(context, chainStatus) {
    return { chainStatus };
  }

  getLedgerAmountFields(amount, amountBaseUnits) {
    return {
      amount,
      amountBaseUnits,
    };
  }

  buildTransactionTimeFields(source = {}, existing = null) {
    const nextChainTimestamp = normalizeTimestampValue(
      source.chainTimestamp || source.confirmedAt,
    );
    const persistedChainTimestamp = normalizeTimestampValue(
      existing?.chainTimestamp,
    );
    const persistedConfirmedAt = normalizeTimestampValue(existing?.confirmedAt);

    const chainTimestamp = nextChainTimestamp || persistedChainTimestamp;
    const confirmedAt = source.validated
      ? normalizeTimestampValue(source.confirmedAt) ||
      chainTimestamp ||
      persistedConfirmedAt ||
      persistedChainTimestamp
      : persistedConfirmedAt;

    return {
      ...(chainTimestamp ? { chainTimestamp } : {}),
      ...(confirmedAt ? { confirmedAt } : {}),
    };
  }

  async findExistingHistoryTransaction(wallet, mapped = {}, options = {}) {
    const normalizedTxHash = normalizeTxHash(mapped?.txHash);
    const walletId = wallet?._id || null;
    const assetType = String(mapped?.assetType || "native")
      .trim()
      .toLowerCase();

    if (!walletId) {
      return null;
    }

    if (assetType === "nft") {
      let nftIdentity = null;

      try {
        nftIdentity = normalizeNftHistoryIdentity({
          ...mapped,
          txHash: normalizedTxHash,
        });
      } catch (error) {
        logger.warn("Failed to normalize NFT history identity for matching", {
          source: "findExistingHistoryTransaction",
          walletId: String(walletId),
          userId: String(wallet?.userId || ""),
          chain: wallet?.chain,
          network: wallet?.network,
          txHash: normalizedTxHash || null,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (nftIdentity?.canonicalHistoryUniqueKey) {
        const exactByHistoryKey = await Transaction.findOne({
          walletId,
          chain: wallet.chain,
          historyUniqueKey: nftIdentity.canonicalHistoryUniqueKey,
        });

        if (exactByHistoryKey) {
          return exactByHistoryKey;
        }
      }



      if (
        normalizedTxHash &&
        nftIdentity?.contractAddress &&
        nftIdentity?.tokenId &&
        nftIdentity?.direction
      ) {
        const exactByNftIdentity = await Transaction.findOne({
          walletId,
          chain: wallet.chain,
          network: wallet.network,
          assetType: "nft",
          txHash: normalizedTxHash,
          contractAddress: {
            $regex: `^${escapeRegex(nftIdentity.contractAddress)}$`,
            $options: "i",
          },
          standard: {
            $in: getNftStandardStorageVariants(nftIdentity.standard),
          },
          direction: normalizeNftDirection(nftIdentity.direction),
          "metadata.nft.tokenId": {
            $in: nftIdentity.tokenIdQueryVariants,
          },
        });

        if (exactByNftIdentity) {
          return exactByNftIdentity;
        }
      }
    }

    // --- Phase 1: exact txHash match (highest confidence) ---
    if (normalizedTxHash && assetType !== "nft") {
      const exactByHash = await Transaction.findOne({
        walletId,
        chain: wallet.chain,
        network: wallet.network,
        txHash: normalizedTxHash,
      });

      if (exactByHash) {
        return exactByHash;
      }
      // Exact-hash lookup failed. Fall through to semantic reconciliation so
      // that a pending row created at submission time (which already has txHash
      // set) is still matched — preventing a duplicate visible history row.
    }

    // --- Phase 2: semantic reconciliation for recent pending rows ---
    // Runs whether or not txHash is present. Covers two scenarios:
    //  a) Row was created without a txHash (pre-submission) and chain sync
    //     sees the confirmed tx before the local txHash was set.
    //  b) Exact-hash lookup missed (e.g. timing / index lag) but a pending row
    //     with matching fields already exists (e.g. receiver row seeded at
    //     accepted-pending submission time).
    const direction = String(mapped?.direction || "")
      .trim()
      .toLowerCase();
    const amountBaseUnits = String(mapped?.amountBaseUnits || "0").trim();
    const fromAddress = normalizeAddress(mapped?.fromAddress || "");
    const toAddress = normalizeAddress(mapped?.toAddress || "");
    const asset = String(mapped?.asset || mapped?.currency || "")
      .trim()
      .toUpperCase();
    const standard = String(mapped?.standard || "native")
      .trim()
      .toLowerCase();
    const contractAddress = String(mapped?.contractAddress || "").trim();

    if (!direction || !amountBaseUnits || !toAddress) {
      return null;
    }

    const mappedTimestamp = normalizeTimestampValue(
      mapped?.chainTimestamp || mapped?.confirmedAt,
    );
    const centerTime = mappedTimestamp || new Date();
    const windowStart = new Date(
      centerTime.getTime() - HISTORY_PENDING_RECONCILIATION_WINDOW_MS,
    );
    const windowEnd = new Date(
      centerTime.getTime() + HISTORY_PENDING_RECONCILIATION_WINDOW_MS,
    );

    // Stale-pending lower bound: exclude rows so old they cannot plausibly be
    // the pending counterpart of a fresh chain sync event. This keeps the
    // candidate set small even when many stale rows accumulate over time.
    // The reconciliation window already provides an upper bound from the
    // mapped timestamp; this provides an absolute floor independent of it.
    const staleCutoff = new Date(Date.now() - PENDING_STALE_THRESHOLD_MS);

    // Direction-aware reconciliation query.
    //
    // OUTGOING (sender): fromAddress is NOT used as a filter. For UTXO chains
    // (ADA, BTC) the chain mapper resolves fromAddress from whichever UTXOs
    // were consumed, which may be a change address rather than the primary
    // wallet address stored on the pending row. walletId + toAddress + amount
    // within the time window is a sufficiently tight identity for a sender row.
    //
    // INCOMING (receiver): fromAddress IS included because the receiver row was
    // seeded with the exact sender address at submission time, so it is a
    // reliable discriminator and guards against false positives.
    //
    // Field order matches the compound reconciliation index:
    // { walletId, status, direction, asset, amountBaseUnits, createdAt }
    // so MongoDB narrows the candidate set before evaluating toAddress/assetType.
    const reconciliationQuery = {
      walletId,
      status: "pending",
      direction,
      asset,
      amountBaseUnits,
      // Narrow to recent-enough pending rows only (covers both the reconciliation
      // window AND the absolute stale cutoff — whichever is more restrictive).
      createdAt: {
        $gte: new Date(Math.max(windowStart.getTime(), staleCutoff.getTime())),
        $lte: windowEnd,
      },
      // Remaining discriminators applied after indexed narrowing.
      userId: wallet.userId,
      chain: wallet.chain,
      network: wallet.network,
      transactionType: "external",
      type: "transfer",
      toAddress,
      assetType,
      standard,
      isSystemManaged: Boolean(options.isSystemManaged),
    };

    // Include fromAddress only for incoming rows (see comment above).
    if (direction === "incoming" && fromAddress) {
      reconciliationQuery.fromAddress = fromAddress;
    }

    if (wallet.accountId) {
      reconciliationQuery.accountId = wallet.accountId;
    }

    if (assetType === "token") {
      reconciliationQuery.contractAddress = contractAddress || null;
    }

    if (assetType === "nft") {
      reconciliationQuery.contractAddress =
        String(mapped?.contractAddress || "").trim().toLowerCase() || null;

      if (normalizedNftTokenId) {
        reconciliationQuery["metadata.nft.tokenId"] = normalizedNftTokenId;
      }
    }

    const candidates = await Transaction.find(reconciliationQuery)
      .sort({ createdAt: -1 })
      .limit(2);


    if (candidates.length === 1) {
      return candidates[0];
    }

    if (candidates.length > 1) {
      // Multiple ambiguous candidates — prefer the one whose txHash already
      // matches (seeded at submission) before giving up.
      if (normalizedTxHash) {
        const hashMatch = candidates.find(
          (c) => normalizeTxHash(c.txHash) === normalizedTxHash,
        );
        if (hashMatch) {
          return hashMatch;
        }
      }

      logger.warn(
        "Skipped ambiguous pending reconciliation during history sync",
        {
          source: "syncWalletTransactions",
          walletId: String(walletId),
          userId: String(wallet.userId || ""),
          chain: wallet.chain,
          network: wallet.network,
          txHash: normalizedTxHash,
          direction,
          asset,
          assetType,
          standard,
          contractAddress: contractAddress || null,
          amountBaseUnits,
          candidateIds: candidates.map((candidate) => String(candidate._id)),
        },
      );
    }

    return null;
  }

  async getWalletOrFail(userId, walletId, includeRecoveryPhrase = false) {
    let query = Wallet.findOne({
      _id: walletId,
      userId,
      ...buildWalletVisibilityFilter({ includeHidden: true }),
    });
    if (includeRecoveryPhrase) {
      query = query.select(
        "+encryptedRecoveryPhrase.cipherText +encryptedRecoveryPhrase.iv +encryptedRecoveryPhrase.authTag",
      );
    } else {
      query = query.lean();
    }

    const wallet = await query;
    if (!wallet) {
      logger.warn("Transaction wallet lookup failed", {
        userId: userId ? String(userId) : null,
        walletId: walletId ? String(walletId) : null,
        reason: "wallet_not_found",
      });
      throw AppError.notFound("Wallet not found");
    }
    if (isWalletArchived(wallet)) {
      throw AppError.validation("Wallet is archived");
    }

    assertSupportedChainNetwork(wallet.chain, wallet.network);
    return wallet;
  }

  async getSystemWalletConfig(context) {
    if (!this.isPlatformFeeEnabled()) {
      this.systemWalletCache.set(context.chain, null);
      return null;
    }

    if (this.systemWalletCache.has(context.chain)) {
      return this.systemWalletCache.get(context.chain);
    }

    const address = appConfig.systemWallet.address;
    const secret = appConfig.systemWallet.secret;

    if (!address && !secret) {
      this.systemWalletCache.set(context.chain, null);
      return null;
    }

    if (!address || !secret) {
      throw AppError.notFound(
        "SYSTEM_WALLET_ADDRESS and SYSTEM_WALLET_SECRET must both be set",
      );
    }

    if (!context.adapter.wallet.validateAddress(address)) {
      throw AppError.validation(
        `SYSTEM_WALLET_ADDRESS is not a valid ${context.assetSymbol} address`,
      );
    }

    let derivedAddress;
    try {
      derivedAddress =
        await context.adapter.wallet.resolveAddressFromSecret(secret);
    } catch (_error) {
      throw AppError.validation(
        `SYSTEM_WALLET_SECRET must be valid for chain "${context.chain}"`,
      );
    }

    if (normalizeAddress(derivedAddress) !== normalizeAddress(address)) {
      throw AppError.conflict(
        "SYSTEM_WALLET_SECRET does not match SYSTEM_WALLET_ADDRESS",
      );
    }

    const config = { address, secret };
    this.systemWalletCache.set(context.chain, config);
    return config;
  }

  async isSystemManagedHistoryTransfer(context, input) {
    const systemWallet = await this.getSystemWalletConfig(context);
    if (!systemWallet) {
      return false;
    }

    return (
      normalizeAddress(input.fromAddress) ===
      normalizeAddress(systemWallet.address) ||
      normalizeAddress(input.toAddress) ===
      normalizeAddress(systemWallet.address) ||
      normalizeAddress(input.walletAddress) ===
      normalizeAddress(systemWallet.address)
    );
  }

  async normalizeExecutionParams(context, input) {
    const executionParams = normalizeExecutionParamsObject(
      input.executionParams,
    );

    return context.adapter.transaction.normalizeExecutionParams({
      ...input,
      executionParams,
    });
  }

  getAvailableBalanceBaseUnits(context, balance) {
    if (balance?.metadata?.availableBaseUnits) {
      return balance.metadata.availableBaseUnits;
    }

    return this.toBaseUnits(context, balance.availableBalance || "0");
  }

  getOnChainBalanceBaseUnits(context, balance) {
    if (balance?.metadata?.onChainBaseUnits) {
      return balance.metadata.onChainBaseUnits;
    }

    return this.toBaseUnits(
      context,
      balance.onChainBalance || balance.availableBalance || "0",
    );
  }

  async assertPreviewTransferAllowed(context, balance, previewInput) {
    const validator =
      context.adapter?.transaction?.assertPreviewTransferAllowed;
    if (typeof validator !== "function") {
      return;
    }

    await validator({
      context,
      balance,
      preview: previewInput,
      getAvailableBalanceBaseUnits: (nextBalance) =>
        this.getAvailableBalanceBaseUnits(context, nextBalance),
      getOnChainBalanceBaseUnits: (nextBalance) =>
        this.getOnChainBalanceBaseUnits(context, nextBalance),
      fromBaseUnits: (amountBaseUnits) =>
        this.fromBaseUnits(context, amountBaseUnits),
    });
  }

  isSendMaxRequested(input = {}) {
    return (
      input?.sendMax === true ||
      String(input?.sendMax || "")
        .trim()
        .toLowerCase() === "true"
    );
  }

  classifyMaxPreviewValidationError(error) {
    const reason = String(error?.errors?.reason || "")
      .trim()
      .toLowerCase();
    const message = String(error?.message || "")
      .trim()
      .toLowerCase();

    if (
      reason === "change_below_minimum_output" ||
      reason === "missing_required_change_output" ||
      reason === "change_output_below_minimum_output" ||
      reason === "change_output_mismatch" ||
      message.includes("required change output") ||
      message.includes("remaining ada change is too small") ||
      message.includes("rent-exempt minimum")
    ) {
      return "too_low";
    }

    return "too_high";
  }

  async quotePreviewTransfer({
    context,
    senderWallet,
    destination,
    assetDescriptor,
    feeAssetDescriptor,
    balance,
    mnemonicProvider,
    amount,
  }) {
    const availableBalanceBaseUnits = this.getAssetBalanceBaseUnits(
      balance,
      assetDescriptor,
    );
    const availableFeeBalanceBaseUnits = this.getAvailableBalanceBaseUnits(
      context,
      balance,
    );
    const transactionType = destination.isInternal ? "internal" : "external";
    const normalizedAmount = this.normalizeTransferAmount(
      assetDescriptor,
      amount,
    );
    const amountBaseUnits = this.toTransferBaseUnits(
      assetDescriptor,
      normalizedAmount,
    );
    const feeQuote = await feeService.quoteTransfer({
      context: {
        ...context,
        network: senderWallet.network,
        assetDescriptor,
      },
      amount: normalizedAmount,
      senderAddress: senderWallet.address,
      destinationAddress: destination.destinationAddress,
      network: senderWallet.network,
      transactionType,
      mnemonicProvider,
      executionParams: destination.executionParams,
      assetDescriptor,
    });
    const totalDebitBaseUnits = feeQuote.totalDebitBaseUnits;

    if (!isBaseUnitsGte(availableBalanceBaseUnits, totalDebitBaseUnits)) {
      throw AppError.validation("Insufficient balance");
    }

    if (
      !isBaseUnitsGte(
        availableFeeBalanceBaseUnits,
        feeQuote.networkFeeBaseUnits,
      )
    ) {
      throw AppError.validation(
        `Insufficient ${feeAssetDescriptor.symbol} balance to cover the network fee`,
      );
    }

    await this.assertPreviewTransferAllowed(context, balance, {
      amountBaseUnits,
      totalDebitBaseUnits,
      networkFeeBaseUnits: feeQuote.networkFeeBaseUnits,
      asset: assetDescriptor.asset,
      assetType: assetDescriptor.assetType,
      networkFeeAsset: feeAssetDescriptor.asset,
    });

    return {
      amount: normalizedAmount,
      amountBaseUnits,
      feeQuote,
      availableBalanceBaseUnits,
      availableFeeBalanceBaseUnits,
      transactionType,
    };
  }

  async resolveMaxTransferQuote({
    context,
    senderWallet,
    destination,
    assetDescriptor,
    feeAssetDescriptor,
    balance,
    mnemonicProvider,
  }) {
    const availableBalanceBaseUnits = this.getAssetBalanceBaseUnits(
      balance,
      assetDescriptor,
    );
    const maxCandidateBaseUnits = BigInt(
      String(availableBalanceBaseUnits || "0"),
    );

    if (maxCandidateBaseUnits <= 0n) {
      throw AppError.validation("Max send unavailable for this wallet");
    }

    let low = 0n;
    let high = maxCandidateBaseUnits;
    let bestQuote = null;
    let lastValidationError = null;
    let iterations = 0;

    while (low < high && iterations < 96) {
      iterations += 1;
      const candidateBaseUnits = (low + high + 1n) / 2n;
      const candidateAmount = this.fromTransferBaseUnits(
        assetDescriptor,
        candidateBaseUnits.toString(),
      );

      try {
        const candidateQuote = await this.quotePreviewTransfer({
          context,
          senderWallet,
          destination,
          assetDescriptor,
          feeAssetDescriptor,
          balance,
          mnemonicProvider,
          amount: candidateAmount,
        });

        bestQuote = candidateQuote;
        low = candidateBaseUnits;
      } catch (error) {
        if (error instanceof AppError && error.status === 400) {
          lastValidationError = error;

          if (this.classifyMaxPreviewValidationError(error) === "too_low") {
            low = candidateBaseUnits;
          } else {
            high = candidateBaseUnits - 1n;
          }
          continue;
        }

        throw error;
      }
    }

    const finalCandidates = Array.from(
      new Set(
        [high, low]
          .filter((value) => typeof value === "bigint" && value > 0n)
          .map((value) => value.toString()),
      ),
    )
      .map((value) => BigInt(value))
      .sort((left, right) => (left > right ? -1 : left < right ? 1 : 0));

    for (const candidateBaseUnits of finalCandidates) {
      const candidateAmount = this.fromTransferBaseUnits(
        assetDescriptor,
        candidateBaseUnits.toString(),
      );

      try {
        return await this.quotePreviewTransfer({
          context,
          senderWallet,
          destination,
          assetDescriptor,
          feeAssetDescriptor,
          balance,
          mnemonicProvider,
          amount: candidateAmount,
        });
      } catch (error) {
        if (error instanceof AppError && error.status === 400) {
          lastValidationError = error;
          continue;
        }

        throw error;
      }
    }

    if (
      bestQuote?.amountBaseUnits &&
      BigInt(String(bestQuote.amountBaseUnits)) > 0n
    ) {
      return bestQuote;
    }

    throw (
      lastValidationError ||
      AppError.validation("Max send unavailable for this wallet")
    );
  }

  buildTransactionAmounts(context, input) {
    return {
      amount: input.amount,
      amountBaseUnits: input.amountBaseUnits,
      networkFee: input.networkFee,
      networkFeeBaseUnits: input.networkFeeBaseUnits,
      platformFee: input.platformFee,
      platformFeeBaseUnits: input.platformFeeBaseUnits,
      totalDebit: input.totalDebit,
      totalDebitBaseUnits: input.totalDebitBaseUnits,
      recipientGets: input.recipientGets,
      recipientGetsBaseUnits: input.recipientGetsBaseUnits,
      currency: input.currency || context.assetSymbol,
      asset: input.asset || context.assetSymbol,
    };
  }

  async collectPlatformFeeFromWallet(input) {
    if (input.preview.platformFeeBaseUnits === "0") {
      return null;
    }

    const context = this.getContext(input.wallet.chain);
    const systemWallet = await this.getSystemWalletConfig(context);
    if (!systemWallet) {
      throw AppError.notFound(
        "System wallet is not configured for application fee routing",
      );
    }

    const feeTransaction = await Transaction.create({
      userId: input.wallet.userId,
      accountId: input.wallet.accountId,
      walletId: input.wallet._id,
      chain: context.chain,
      type: "fee",
      transactionType: "external",
      direction: "outgoing",
      fromAddress: input.wallet.address,
      toAddress: systemWallet.address,
      executionParams: {},
      amount: input.preview.platformFee,
      amountBaseUnits: input.preview.platformFeeBaseUnits,
      currency: context.assetSymbol,
      asset: context.assetSymbol,
      network: input.wallet.network,
      networkFee: "0",
      networkFeeBaseUnits: "0",
      platformFee: "0",
      platformFeeBaseUnits: "0",
      totalDebit: input.preview.platformFee,
      totalDebitBaseUnits: input.preview.platformFeeBaseUnits,
      recipientGets: input.preview.platformFee,
      recipientGetsBaseUnits: input.preview.platformFeeBaseUnits,
      validated: false,
      succeeded: false,
      confirmations: 0,
      ...this.getChainStatusFields(context, "pending_fee_collection"),
      systemStatus: "collecting_platform_fee",
      status: "pending",
      isSystemManaged: true,
      visibleInSuperadmin: true,
      relatedTransactionId: input.parentTransactionId,
      rawRequest: {
        amount: input.preview.platformFee,
        destinationAddress: systemWallet.address,
        purpose: "platform_fee_collection",
      },
    });
    socket.emitTransactionNew(feeTransaction);

    try {
      this.logSensitiveOperation(
        "info",
        "Sensitive signing operation initiated",
        {
          requestId: input.requestId || null,
          userId: input.wallet.userId,
          walletId: input.wallet._id,
          transactionId: feeTransaction._id,
          chain: context.chain,
          network: input.wallet.network,
          operation: "platform_fee_collection",
          source: "collect_platform_fee",
        },
        {
          asset: context.assetSymbol,
          destinationAddress: systemWallet.address,
        },
      );
      const submission = await context.adapter.transaction.executeTransfer({
        network: input.wallet.network,
        mnemonic: input.mnemonic,
        fromAddress: input.wallet.address,
        toAddress: systemWallet.address,
        amount: input.preview.platformFee,
        executionParams: {},
      });
      const status = getExecutionStatus(submission);
      const networkFeeBaseUnits = submission.networkFeeBaseUnits || "0";
      const acceptedPendingSubmission = isAcceptedPendingSubmission(submission);
      // Normalize immediately so what we persist matches what syncWalletTransactions
      // will search with — preventing a quote-mismatch reconciliation miss.
      const normalizedSubmissionTxHash = normalizeTxHash(submission.txHash);

      await Transaction.updateOne(
        { _id: feeTransaction._id },
        {
          $set: {
            networkFee:
              submission.networkFee ||
              this.fromBaseUnits(context, networkFeeBaseUnits),
            networkFeeBaseUnits,
            totalDebit: this.fromBaseUnits(
              context,
              addBaseUnits(
                input.preview.platformFeeBaseUnits,
                networkFeeBaseUnits,
              ),
            ),
            totalDebitBaseUnits: addBaseUnits(
              input.preview.platformFeeBaseUnits,
              networkFeeBaseUnits,
            ),
            txHash: normalizedSubmissionTxHash || null,
            ledgerIndex: submission.ledgerIndex,
            validated: submission.validated === true,
            succeeded: submission.succeeded === true,
            confirmations: Number(submission.confirmations || 0),
            ...this.getChainStatusFields(
              context,
              submission.chainStatus || "platform_fee_submitted",
            ),
            systemStatus:
              submission.succeeded || acceptedPendingSubmission
                ? submission.validated
                  ? "platform_fee_sent"
                  : "platform_fee_pending"
                : "platform_fee_failed",
            status,
            errorMessage:
              submission.succeeded || acceptedPendingSubmission
                ? undefined
                : `Chain returned ${submission.chainStatus || "failed"}`,
            rawRequest: buildSafeTransaction(submission.rawRequest),
            rawResponse: buildSafeTransaction(submission.rawResponse),
            ...this.buildTransactionTimeFields(submission, feeTransaction),
          },
        },
      );
      const updatedFee = await Transaction.findById(feeTransaction._id).lean();
      this.logSensitiveOperation(
        "info",
        "Sensitive signing operation succeeded",
        {
          requestId: input.requestId || null,
          userId: input.wallet.userId,
          walletId: input.wallet._id,
          transactionId: feeTransaction._id,
          chain: context.chain,
          network: input.wallet.network,
          operation: "platform_fee_collection",
          source: "collect_platform_fee",
        },
        {
          txHash: normalizedSubmissionTxHash || null,
          chainStatus: submission.chainStatus || "platform_fee_submitted",
          status,
        },
      );
      socket.emitTransactionUpdate(updatedFee);

      await Transaction.updateOne(
        { _id: input.parentTransactionId },
        { $set: { relatedTransactionId: feeTransaction._id } },
      );

      return {
        id: feeTransaction._id,
        txHash: normalizedSubmissionTxHash || null,
        status,
        networkFee:
          submission.networkFee ||
          this.fromBaseUnits(context, networkFeeBaseUnits),
        networkFeeBaseUnits,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Platform fee collection failed";
      this.logSensitiveOperation(
        error instanceof AppError ? "warn" : "error",
        "Sensitive signing operation failed",
        {
          requestId: input.requestId || null,
          userId: input.wallet.userId,
          walletId: input.wallet._id,
          transactionId: feeTransaction._id,
          chain: context.chain,
          network: input.wallet.network,
          operation: "platform_fee_collection",
          source: "collect_platform_fee",
        },
        {
          reason: errorMessage,
        },
      );

      await Transaction.updateOne(
        { _id: feeTransaction._id },
        {
          $set: {
            ...this.getChainStatusFields(context, "platform_fee_submit_failed"),
            systemStatus: "platform_fee_failed",
            status: "failed",
            errorMessage,
          },
        },
      );

      return {
        id: feeTransaction._id,
        txHash: null,
        status: "failed",
        networkFee: "0",
        networkFeeBaseUnits: "0",
        errorMessage,
      };
    }
  }

  async validateDestination(input) {
    const senderWallet = await this.getWalletOrFail(
      input.userId,
      input.walletId,
    );
    const context = assertChainFeature(
      senderWallet.chain,
      senderWallet.network,
      "send",
    );
    const assetDescriptor = this.resolveTransferAsset(
      senderWallet,
      input.asset,
    );
    const executionParams = await this.normalizeExecutionParams(context, input);
    const validated = await context.adapter.transaction.validateDestination({
      network: senderWallet.network,
      fromAddress: senderWallet.address,
      destinationAddress: normalizeAddress(input.destinationAddress),
      executionParams,
      asset: assetDescriptor.asset,
      assetDescriptor,
    });
    const normalizedParams = validated.executionParams || executionParams;
    const recipientResolution =
      await internalTransferService.resolveInternalTransferRecipient({
        senderWallet,
        chainContext: context,
        destinationAddress: validated.destinationAddress,
        executionParams: normalizedParams,
      });

    if (recipientResolution.isSameWallet) {
      const matchingWallets = await Wallet.find({
        userId: input.userId,
        chain: senderWallet.chain,
        address: recipientResolution.normalizedAddress,
        ...buildWalletVisibilityFilter(),
      })
        .select("network")
        .lean();
      const otherNetworks = [
        ...new Set(
          matchingWallets
            .map((wallet) => String(wallet.network || "").toLowerCase())
            .filter(
              (network) =>
                network &&
                network !== String(senderWallet.network || "").toLowerCase() &&
                isRuntimeVisibleNetwork(senderWallet.chain, network),
            ),
        ),
      ];
      const crossNetworkHint = otherNetworks.length
        ? ` This address is also one of your ${senderWallet.chain} wallets on ${otherNetworks.join(", ")}. In this app, that still resolves to the same public address string, so choose a different recipient address.`
        : "";

      throw AppError.validation(
        `Cannot send to the same wallet address on ${senderWallet.network}.${crossNetworkHint}`,
      );
    }

    const recipientWallet = recipientResolution.recipientWallet;
    const isPlatformRecipient =
      Boolean(recipientWallet) &&
      String(recipientWallet.userId) !== String(input.userId);

    const useLocalInternalSettlement =
      this.shouldUseLocalInternalSettlement(recipientResolution);
    const settlementMode =
      this.resolvePlatformTransferSettlementMode(recipientResolution);

    if (useLocalInternalSettlement) {
      assertChainFeature(
        senderWallet.chain,
        senderWallet.network,
        "internalTransfer",
      );
    }

    logger.info("Transaction destination classified", {
      requestId: input.requestId || null,
      userId: String(input.userId),
      walletId: String(senderWallet._id),
      chain: senderWallet.chain,
      network: senderWallet.network,
      asset: assetDescriptor.asset,
      destinationAddress: validated.destinationAddress,
      transactionType: useLocalInternalSettlement ? "internal" : "external",
      settlementMode,
      recipientClassification: recipientResolution.recipientClassification,
      internalWalletId:
        useLocalInternalSettlement && recipientWallet
          ? String(recipientWallet._id)
          : null,
      samePlatformWalletId:
        recipientResolution.isSamePlatform && recipientWallet
          ? String(recipientWallet._id)
          : null,
      samePlatformUserId:
        recipientResolution.isSamePlatform && recipientWallet
          ? String(recipientWallet.userId)
          : null,
      isPlatformRecipient,
      platformRecipientWalletId: isPlatformRecipient
        ? String(recipientWallet._id)
        : null,
      platformRecipientUserId: isPlatformRecipient
        ? String(recipientWallet.userId)
        : null,
      internalMatchStrategy: recipientResolution.matchStrategy,
    });

    return {
      walletId: String(senderWallet._id),
      chain: senderWallet.chain,
      asset: assetDescriptor.asset,
      currency: assetDescriptor.symbol,
      assetType: assetDescriptor.assetType,
      standard: assetDescriptor.standard,
      contractAddress: assetDescriptor.contractAddress,
      destinationAddress: validated.destinationAddress,
      executionParams: normalizedParams,
      network: senderWallet.network,
      isInternal: useLocalInternalSettlement,
      settlementMode,
      recipientClassification: recipientResolution.recipientClassification,
      isPlatformRecipient,
      samePlatformRecipient: recipientResolution.isSamePlatform,
      samePlatformRecipientWalletId:
        recipientResolution.isSamePlatform && recipientWallet
          ? String(recipientWallet._id)
          : null,
      samePlatformRecipientUserId:
        recipientResolution.isSamePlatform && recipientWallet
          ? String(recipientWallet.userId)
          : null,
      internalWalletId:
        useLocalInternalSettlement && recipientWallet
          ? String(recipientWallet._id)
          : null,
      platformRecipientWalletId: isPlatformRecipient
        ? String(recipientWallet._id)
        : null,
      platformRecipientUserId: isPlatformRecipient
        ? String(recipientWallet.userId)
        : null,
      internalMatchStrategy: useLocalInternalSettlement
        ? recipientResolution.matchStrategy
        : null,
      platformRecipientMatchStrategy: recipientResolution.isSamePlatform
        ? recipientResolution.matchStrategy
        : null,
    };
  }

  async previewTransfer(input) {
    const previewGeneratedAt = new Date().toISOString();

    try {
      const senderWallet = await this.getWalletOrFail(
        input.userId,
        input.walletId,
      );
      const destination = await this.validateDestination(input);
      const context = assertChainFeature(
        senderWallet.chain,
        senderWallet.network,
        destination.isInternal ? "internalTransfer" : "send",
      );
      const assetDescriptor = this.resolveTransferAsset(
        senderWallet,
        destination.asset || input.asset,
      );
      const feeAssetDescriptor = this.getFeeAsset(
        context,
        senderWallet.network,
      );
      const balance = await balanceService.getWalletBalance(
        input.userId,
        input.walletId,
        {
          requestId: input.requestId,
          force: true,
          trigger: "transaction_preview",
        },
      );

      if (senderWallet.chain === "xrp" && balance?.exists === false) {
        throw buildXrpAccountNotActivatedError({
          address: senderWallet.address,
          network: senderWallet.network,
          operation: "preview_transfer_balance_check",
        });
      }

      const mnemonicProvider = this.createDeferredMnemonicProvider({
        requestId: input.requestId || null,
        userId: input.userId,
        walletId: input.walletId,
        chain: senderWallet.chain,
        network: senderWallet.network,
        operation: "transaction_preview_estimate",
        source: "preview_transfer",
      });
      const sendMax = this.isSendMaxRequested(input);
      this.assertRequestedTransferAmount({
        input,
        destination,
        assetDescriptor,
        balance,
      });
      const quote = sendMax
        ? await this.resolveMaxTransferQuote({
          context,
          senderWallet,
          destination,
          assetDescriptor,
          feeAssetDescriptor,
          balance,
          mnemonicProvider,
        })
        : await this.quotePreviewTransfer({
          context,
          senderWallet,
          destination,
          assetDescriptor,
          feeAssetDescriptor,
          balance,
          mnemonicProvider,
          amount: input.amount,
        });
      const {
        amount,
        amountBaseUnits,
        feeQuote,
        availableBalanceBaseUnits,
        availableFeeBalanceBaseUnits,
        transactionType,
      } = quote;
      const totalDebitBaseUnits = feeQuote.totalDebitBaseUnits;
      const remainingBalanceBaseUnits =
        BigInt(availableBalanceBaseUnits) - BigInt(totalDebitBaseUnits);
      const preparedTransaction = feeQuote.preparedTransaction || {};
      const changeAmountBaseUnits = String(
        preparedTransaction.changeOutput?.amountBaseUnits ||
        preparedTransaction.changeBaseUnits ||
        "0",
      );

      return {
        walletId: String(senderWallet._id),
        chain: senderWallet.chain,
        asset: assetDescriptor.asset,
        currency: assetDescriptor.symbol,
        assetType: assetDescriptor.assetType,
        standard: assetDescriptor.standard,
        contractAddress: assetDescriptor.contractAddress,
        feeAsset: feeAssetDescriptor.asset,
        feeCurrency: feeAssetDescriptor.symbol,
        feeAssetType: feeAssetDescriptor.assetType,
        fromAddress: senderWallet.address,
        toAddress: destination.destinationAddress,
        executionParams: destination.executionParams,
        isPlatformRecipient: Boolean(destination.isPlatformRecipient),
        samePlatformRecipient: Boolean(destination.samePlatformRecipient),
        samePlatformRecipientWalletId:
          destination.samePlatformRecipientWalletId || null,
        samePlatformRecipientUserId:
          destination.samePlatformRecipientUserId || null,
        settlementMode: destination.settlementMode || "onchain",
        sendMax,
        isMaxSend: sendMax,
        recipientClassification:
          destination.recipientClassification || "external",
        platformRecipientMatchStrategy:
          destination.platformRecipientMatchStrategy || null,
        platformRecipientWalletId:
          destination.platformRecipientWalletId || null,
        platformRecipientUserId: destination.platformRecipientUserId || null,
        amount,
        amountBaseUnits,
        network: senderWallet.network,
        transactionType,
        direction: "outgoing",
        networkFee: feeQuote.networkFee,
        networkFeeBaseUnits: feeQuote.networkFeeBaseUnits,
        networkFeeAsset: feeQuote.networkFeeAsset || feeAssetDescriptor.asset,
        networkFeeCurrency:
          feeQuote.networkFeeCurrency || feeAssetDescriptor.symbol,
        networkFeeAssetType:
          feeQuote.networkFeeAssetType || feeAssetDescriptor.assetType,
        platformFee: feeQuote.platformFee,
        applicationFee: feeQuote.platformFee,
        platformFeeBaseUnits: feeQuote.platformFeeBaseUnits,
        applicationFeeBaseUnits: feeQuote.platformFeeBaseUnits,
        totalDebit: feeQuote.totalDebit,
        totalDeducted: feeQuote.totalDebit,
        totalDebitBaseUnits,
        totalDeductedBaseUnits: totalDebitBaseUnits,
        totalDebitAsset: feeQuote.totalDebitAsset || assetDescriptor.asset,
        totalDebitCurrency:
          feeQuote.totalDebitCurrency || assetDescriptor.symbol,
        totalDebitAssetType:
          feeQuote.totalDebitAssetType || assetDescriptor.assetType,
        compositeDebit: feeQuote.compositeDebit || null,
        recipientGets: feeQuote.recipientGets,
        recipientGetsBaseUnits: feeQuote.recipientGetsBaseUnits,
        availableBalance: this.fromTransferBaseUnits(
          assetDescriptor,
          availableBalanceBaseUnits,
        ),
        availableBalanceBaseUnits,
        availableFeeBalance: balance.availableBalance,
        availableFeeBalanceBaseUnits,
        remainingBalance: this.fromTransferBaseUnits(
          assetDescriptor,
          remainingBalanceBaseUnits.toString(),
        ),
        remainingBalanceBaseUnits: remainingBalanceBaseUnits.toString(),
        changeAmount: this.fromTransferBaseUnits(
          assetDescriptor,
          changeAmountBaseUnits,
        ),
        changeAmountBaseUnits,
        internalWalletId: destination.internalWalletId || null,
        internalMatchStrategy: destination.internalMatchStrategy || null,
        canSubmit: true,
        validationErrors: [],
        warnings: [],
        previewGeneratedAt,
      };
    } catch (error) {
      if (error instanceof AppError && error.status === 400) {
        const senderWallet = await this.getWalletOrFail(
          input.userId,
          input.walletId,
        ).catch(() => null);
        const validationContext = buildPreviewValidationContext(error);
        let assetDescriptor = null;
        if (senderWallet) {
          try {
            assetDescriptor = this.resolveTransferAsset(
              senderWallet,
              input.asset,
            );
          } catch (_assetError) {
            assetDescriptor = null;
          }
        }

        logger.warn("Transaction preview rejected by validation", {
          requestId: input.requestId || null,
          userId: input.userId ? String(input.userId) : null,
          walletId: senderWallet?._id
            ? String(senderWallet._id)
            : String(input.walletId || ""),
          chain: senderWallet?.chain || null,
          network: senderWallet?.network || null,
          errorCode: error.code || errorCodes.VALIDATION_ERROR,
          reason: error.message,
          validationReason: validationContext?.reason || null,
          onChainExists:
            validationContext?.onChainExists === undefined
              ? null
              : validationContext.onChainExists,
        });

        return {
          walletId: String(input.walletId),
          chain: senderWallet?.chain || null,
          network: senderWallet?.network || null,
          asset: assetDescriptor?.asset || null,
          currency: assetDescriptor?.symbol || null,
          canSubmit: false,
          validationErrors: [error.message],
          warnings: [],
          errorCode: error.code || errorCodes.VALIDATION_ERROR,
          validationContext,
          walletActivation:
            validationContext?.onChainExists === false
              ? {
                  onChainExists: false,
                  activationStatus:
                    validationContext?.activationStatus || "pending_activation",
                }
              : null,
          // Forward any fee-insufficiency details the adapter attached to the error
          // so the frontend can show "you need X TRX" instead of a generic error.
          requiredFee: error.requiredFee || null,
          requiredFeeAsset: error.requiredFeeAsset || null,
          requiredFeeBaseUnits: error.requiredFeeBaseUnits || null,
          actualBalance: error.actualBalance || null,
          actualBalanceBaseUnits: error.actualBalanceBaseUnits || null,
          previewGeneratedAt,
        };
      }

      throw error;
    }
  }

  async sendTransaction(input) {
    const hasExplicitIdempotencyKey = Boolean(
      String(input.idempotencyKey || "").trim(),
    );
    const atomicityRunner = hasExplicitIdempotencyKey
      ? atomicityService.withIdempotentOperation.bind(atomicityService)
      : atomicityService.withLock.bind(atomicityService);

    return atomicityRunner(
      {
        scope: "transaction_send",
        identity: atomicityService.buildSendOperationIdentity(input),
        ttlMs: atomicityService.DEFAULT_OPERATION_LOCK_TTL_MS,
        ...(hasExplicitIdempotencyKey
          ? {
              completedTtlMs: securityConfig.idempotencyTtlMs,
              loadResult: async ({ transactionId }) =>
                transactionId ? this.getTransactionById(input.userId, transactionId) : null,
              storeResult(result = {}) {
                return {
                  transactionId: String(result?._id || result?.id || ""),
                };
              },
            }
          : {}),
        busyMessage: "A matching transaction send request is already being processed",
        logContext: {
          userId: String(input.userId || ""),
          walletId: String(input.walletId || ""),
          chain: String(input.chain || ""),
        },
      },
      async () => {
        const preview = await this.previewTransfer(input);

        if (preview.canSubmit === false) {
          throw new AppError(
            preview.validationErrors?.[0] || "Transaction preview is invalid",
            {
              status: 400,
              code: preview.errorCode || errorCodes.VALIDATION_ERROR,
              errors:
                preview.validationContext &&
                typeof preview.validationContext === "object"
                  ? preview.validationContext
                  : null,
            },
          );
        }

        const existingPendingTransaction = await Transaction.findOne({
          userId: input.userId,
          walletId: input.walletId,
          toAddress: preview.toAddress,
          direction: "outgoing",
          transactionType:
            preview.transactionType === "internal" &&
            transactionConfig.useLocalInternalSettlement()
              ? "internal"
              : "external",
          asset: preview.asset,
          amountBaseUnits: preview.amountBaseUnits,
          status: "pending",
          createdAt: {
            $gte: new Date(Date.now() - securityConfig.idempotencyTtlMs),
          },
        })
          .sort({ createdAt: -1 })
          .lean();

        if (existingPendingTransaction?._id) {
          logger.info("Duplicate send request resolved to existing pending transaction", {
            userId: String(input.userId || ""),
            walletId: String(input.walletId || ""),
            transactionId: String(existingPendingTransaction._id),
            chain: preview.chain,
            network: preview.network,
          });

          return this.getTransactionById(
            input.userId,
            String(existingPendingTransaction._id),
          );
        }

        const result = await (preview.transactionType === "internal" &&
          transactionConfig.useLocalInternalSettlement()
          ? this.executeInternalTransfer(input, preview)
          : this.executeExternalTransfer(input, preview));

        // Trigger a forced live balance refresh after a successful send
        try {
          await balanceService.getWalletBalance(input.userId, input.walletId, {
            force: true,
        chain: preview.chain,
            network: preview.network,
          });
          logger.info("Post-send live balance refresh succeeded", {
            event: "post_send_balance_refresh_success",
            walletId: String(input.walletId),
            userId: String(input.userId),
            chain: preview.chain,
            network: preview.network,
          });
        } catch (balanceError) {
          logger.warn("Post-send live balance refresh failed", {
            event: "post_send_balance_refresh_failed",
            walletId: String(input.walletId),
            userId: String(input.userId),
            chain: preview.chain,
            network: preview.network,
            error: balanceError.message,
          });
        }

        return result;
      },
    );
  }

  async getTransactionById(userId, transactionId) {
    let transaction = await Transaction.findOne({
      _id: transactionId,
      userId,
    }).lean();
    if (!transaction) {
      throw AppError.notFound("Transaction not found");
    }

    assertSupportedChainNetwork(transaction.chain, transaction.network);

    if (shouldRefreshPendingTransactionDetails(transaction)) {
      try {
        // Delegate to the wallet-level sweep rather than triggering a full sync
        // directly. The sweep is cooldown-guarded and deduped so multiple
        // concurrent detail requests for the same wallet share a single sync pass.
        const wallet = {
          _id: transaction.walletId,
          chain: transaction.chain,
          network: transaction.network,
        };
        await this.sweepWalletPendingTransactions(userId, wallet);
        transaction =
          (await Transaction.findOne({ _id: transactionId, userId }).lean()) ||
          transaction;
      } catch (error) {
        logger.warn(
          "Failed to sweep pending transaction details before returning API response",
          {
            transactionId: String(transactionId),
            walletId: String(transaction.walletId || ""),
            userId: String(userId || ""),
            chain: transaction.chain,
            network: transaction.network,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    return buildSafeTransaction(transaction);
  }

  async listWalletTransactions(userId, walletId, query) {
    const wallet = await this.getWalletOrFail(userId, walletId);
    // Fire-and-forget wallet-level pending sweep. Does not block the list response.
    // If the wallet has pending external rows they will be refreshed in the background;
    // the next read will see the updated state.
    this.sweepWalletPendingTransactions(userId, wallet).catch(() => null);
    return this.listTransactions({ ...query, userId }, { walletId });
  }

  // Checks whether the wallet has any pending external rows that need a status sweep,
  // then delegates to syncWalletTransactions if so. Guarded by a per-wallet cooldown
  // and the existing in-flight dedup so concurrent reads share a single sweep.
  async sweepWalletPendingTransactions(userId, wallet) {
    const walletId = String(wallet._id);

    // Skip if no history feature for this chain/network.
    try {
      assertChainFeature(wallet.chain, wallet.network, "history");
    } catch (_err) {
      return;
    }

    // Cooldown guard: skip if a sweep ran recently for this wallet.
    const lastRan = pendingSweepLastRan.get(walletId);
    if (lastRan && Date.now() - lastRan < PENDING_SWEEP_COOLDOWN_MS) {
      return;
    }

    // Quick existence check: only proceed if at least one pending external row exists.
    // Uses the narrow reconciliation index { walletId, status, direction, ... } from Step 16.
    const hasPending = await Transaction.exists({
      walletId,
      status: "pending",
      transactionType: "external",
    });

    if (!hasPending) {
      // No pending rows — mark last-ran so we skip the DB check for the next cooldown window.
      pendingSweepLastRan.set(walletId, Date.now());
      return;
    }

    try {
      await this.syncWalletTransactions(userId, walletId, {
        trigger: "pending_sweep",
      });
    } finally {
      // Always update last-ran so concurrent sweeps are suppressed even on failure.
      pendingSweepLastRan.set(walletId, Date.now());
      // Evict very old entries to prevent unbounded map growth as wallet count grows.
      if (pendingSweepLastRan.size > 5000) {
        const cutoff = Date.now() - PENDING_SWEEP_COOLDOWN_MS * 10;
        for (const [key, ts] of pendingSweepLastRan) {
          if (ts < cutoff) pendingSweepLastRan.delete(key);
        }
      }
    }
  }

  async bootstrapUserHistoryIfNeeded(userId, query = {}) {
    const walletFilter = {
      userId,
      ...buildWalletVisibilityFilter({ includeHidden: false }),
    };

    if (query.network) {
      walletFilter.network = query.network;
    }

    // Limit to a reasonable scan ceiling. Even at scale we only bootstrap
    // up to USER_HISTORY_BOOTSTRAP_WALLET_LIMIT wallets, so there's no reason
    // to load the entire wallet set into memory.
    const MAX_BOOTSTRAP_WALLET_SCAN = 50;
    const wallets = await Wallet.find(walletFilter)
      .sort({ createdAt: -1 })
      .limit(MAX_BOOTSTRAP_WALLET_SCAN)
      .lean();

    if (!wallets.length) {
      return { attempted: 0, synced: 0, failed: 0 };
    }

    const walletIds = wallets.map((wallet) => wallet._id);
    const transactionCounts = await Transaction.aggregate([
      {
        $match: {
          userId,
          walletId: { $in: walletIds },
          isSystemManaged: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$walletId",
          count: { $sum: 1 },
        },
      },
    ]);

    const transactionCountMap = new Map(
      transactionCounts.map((entry) => [
        String(entry._id),
        Number(entry.count || 0),
      ]),
    );

    const bootstrapWallets = wallets
      .filter((wallet) =>
        shouldBootstrapWalletHistory(
          wallet,
          transactionCountMap.get(String(wallet._id)) || 0,
        ),
      )
      .sort((left, right) => {
        const leftPendingRecovery = isWalletPendingRecovery(left) ? 1 : 0;
        const rightPendingRecovery = isWalletPendingRecovery(right) ? 1 : 0;

        if (leftPendingRecovery !== rightPendingRecovery) {
          return rightPendingRecovery - leftPendingRecovery;
        }

        const leftHasCompletedSync = left?.metadata?.historySync?.completedAt
          ? 1
          : 0;
        const rightHasCompletedSync = right?.metadata?.historySync?.completedAt
          ? 1
          : 0;

        if (leftHasCompletedSync !== rightHasCompletedSync) {
          return leftHasCompletedSync - rightHasCompletedSync;
        }

        const leftTransactionCount =
          transactionCountMap.get(String(left._id)) || 0;
        const rightTransactionCount =
          transactionCountMap.get(String(right._id)) || 0;

        if (leftTransactionCount !== rightTransactionCount) {
          return leftTransactionCount - rightTransactionCount;
        }

        return (
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
        );
      })
      .slice(0, USER_HISTORY_BOOTSTRAP_WALLET_LIMIT);

    if (!bootstrapWallets.length) {
      return { attempted: 0, synced: 0, failed: 0 };
    }

    logger.info("Bootstrapping history for user-scoped global list", {
      userId: String(userId),
      attemptedWalletCount: bootstrapWallets.length,
      walletIds: bootstrapWallets.map((wallet) => String(wallet._id)),
      network: query.network || null,
    });

    const settledResults = await Promise.allSettled(
      bootstrapWallets.map((wallet) =>
        this.syncWalletTransactions(userId, String(wallet._id), {
          trigger: "user_history_bootstrap",
          background: true,
        }),
      ),
    );

    let synced = 0;
    let failed = 0;

    settledResults.forEach((result, index) => {
      const wallet = bootstrapWallets[index];

      if (result.status === "fulfilled") {
        synced += 1;
        return;
      }

      failed += 1;
      logger.warn("User-scoped history bootstrap failed for wallet", {
        userId: String(userId),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    });

    return {
      attempted: bootstrapWallets.length,
      synced,
      failed,
    };
  }

  async listUserTransactions(userId, query) {
    return this.listTransactions({ ...query, userId });
  }

  async hydrateDirectPendingHistoryEntries(
    context,
    wallet,
    entries = [],
    options = {},
  ) {
    const fetchTransaction = context?.adapter?.transaction?.fetchTransaction;
    const shouldHydratePendingByTxId =
      wallet?.chain === "hbar" &&
      typeof fetchTransaction === "function" &&
      (isForcedHistorySync(options) ||
        options.trigger === "pending_sweep" ||
        options.trigger === "transaction_status_job" ||
        options.trigger === "manual_refresh");

    if (!shouldHydratePendingByTxId) {
      return entries;
    }

    const pendingTransactions = await Transaction.find({
      walletId: wallet._id,
      transactionType: "external",
      status: "pending",
      txHash: {
        $exists: true,
        $type: "string",
        $gt: "",
      },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(10)
      .select("_id txHash createdAt updatedAt")
      .lean();

    if (!pendingTransactions.length) {
      return entries;
    }

    const seenTxHashes = new Set(
      entries
        .map((entry) =>
          normalizeTxHash(
            entry?.transaction_id ||
              entry?.transactionId ||
              entry?.txHash ||
              "",
          ),
        )
        .filter(Boolean),
    );
    const supplementalEntries = [];

    for (const pendingTransaction of pendingTransactions) {
      const txHash = normalizeTxHash(pendingTransaction?.txHash);
      if (!txHash || seenTxHashes.has(txHash)) {
        continue;
      }

      try {
        const directEntry = await fetchTransaction({
          network: wallet.network,
          transactionId: txHash,
          txHash,
          allowNotFound: true,
        });

        if (!directEntry) {
          continue;
        }

        const directTxHash = normalizeTxHash(
          directEntry.transaction_id ||
            directEntry.transactionId ||
            directEntry.txHash ||
            txHash,
        );
        if (!directTxHash || seenTxHashes.has(directTxHash)) {
          continue;
        }

        supplementalEntries.push({
          ...directEntry,
          network: wallet.network,
          walletAddress: wallet.address,
          walletAddresses: [wallet.address],
        });
        seenTxHashes.add(directTxHash);
      } catch (error) {
        logger.debug(
          "Skipped direct pending transaction hydration during wallet sync",
          {
            source: "syncWalletTransactions",
            walletId: String(wallet._id),
            userId: String(wallet.userId || ""),
            chain: wallet.chain,
            network: wallet.network,
            txHash,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    if (!supplementalEntries.length) {
      return entries;
    }

    logger.info("Hydrated pending wallet transactions from direct chain lookup", {
      source: "syncWalletTransactions",
      walletId: String(wallet._id),
      userId: String(wallet.userId || ""),
      chain: wallet.chain,
      network: wallet.network,
      supplementalCount: supplementalEntries.length,
    });

    return [...entries, ...supplementalEntries];
  }

  async syncWalletTransactions(userId, walletId, options = {}) {
    const wallet = await this.getWalletOrFail(userId, walletId);

    // Background delegation: if this is a request-path call (no workerContext) and
    // backgrounding is requested or it's a routine sync that shouldn't block,
    // enqueue it and return early. Forced syncs (e.g. manual refresh) bypass this
    // to preserve synchronous feedback where expected.
    const isRoutineTrigger = [
      "user_history_bootstrap",
      "pending_sweep",
      "history_sync",
    ].includes(options.trigger);
    const shouldBackground =
      options.background === true ||
      (isRoutineTrigger && !isForcedHistorySync(options));

    if (shouldBackground && !options.workerContext) {
      const job = await transactionQueue.enqueue(userId, walletId, options);
      return {
        syncStatus: job ? "enqueued" : "already_queued",
        jobId: job ? job._id : null,
      };
    }

    const context = assertChainFeature(wallet.chain, wallet.network, "history");
    const syncAttemptedAt = new Date();

    if (shouldSkipRecentHistorySync(wallet, options)) {
      const lastSyncedAt = normalizeTimestampValue(
        wallet?.metadata?.historySync?.lastSyncedAt,
      );

      logger.debug("Skipped wallet history sync due to freshness", {
        event: "wallet_history_sync_skipped_fresh",
        userId: String(userId),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        trigger: options.trigger || "history_sync",
        lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
        freshnessWindowMs: HISTORY_SYNC_COOLDOWN_MS,
      });

      await Wallet.updateOne(
        { _id: wallet._id },
        {
          $set: {
            "metadata.historySync.lastSkippedAt": syncAttemptedAt,
            "metadata.historySync.lastSkipReason": "recent_success",
          },
        },
      ).catch(() => null);

      return {
        created: 0,
        updated: 0,
        failed: 0,
        scanned: 0,
        syncStatus: "skipped_fresh",
        skipped: true,
        reason: "recent_success",
      };
    }

    if (
      isForcedHistorySync(options) &&
      normalizeTimestampValue(wallet?.metadata?.historySync?.lastSyncedAt)
    ) {
      logger.info("Forced wallet history sync bypassed freshness guard", {
        event: "wallet_history_sync_forced",
        userId: String(userId),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        trigger: options.trigger || "manual_refresh",
      });
    }

    return withHistorySyncDedup(
      String(userId),
      String(wallet._id),
      async () => {
        const startedAt = Date.now();

        logger.debug("Starting wallet history sync", {
          event: "wallet_history_sync_started",
          userId: String(userId),
          walletId: String(wallet._id),
          chain: wallet.chain,
          network: wallet.network,
          trigger: options.trigger || "history_sync",
          forced: isForcedHistorySync(options),
        });

        await Wallet.updateOne(
          { _id: wallet._id },
          {
            $set: {
              "metadata.historySync.lastAttemptAt": syncAttemptedAt,
            },
          },
        );

        try {
          let entries = await context.adapter.transaction.fetchHistory({
            network: wallet.network,
            address: wallet.address,
            limit: 100,
          });
          entries = await this.hydrateDirectPendingHistoryEntries(
            context,
            wallet,
            entries,
            options,
          );
          const hasCompletedHistorySync = Boolean(
            wallet.metadata?.historySync?.completedAt,
          );

          let created = 0;
          let updated = 0;
          let failed = 0;

          for (const entry of entries) {
            try {
              const mapped = context.adapter.mapper.mapTransaction(
                entry,
                wallet.address,
              );
              if (!mapped) {
                continue;
              }

              const normalizedTxHash = normalizeTxHash(mapped.txHash);
              const amountBaseUnits = String(mapped.amountBaseUnits || "0");
              const networkFeeBaseUnits = String(
                mapped.networkFeeBaseUnits || "0",
              );
              const executionParams = mapped.executionParams || {};
              const totalDebitBaseUnits =
                mapped.direction === "outgoing"
                  ? addBaseUnits(amountBaseUnits, networkFeeBaseUnits)
                  : "0";
              const isSystemManaged = await this.isSystemManagedHistoryTransfer(
                context,
                {
                  fromAddress: mapped.fromAddress,
                  toAddress: mapped.toAddress,
                  walletAddress: wallet.address,
                },
              );
              const existing = await this.findExistingHistoryTransaction(
                wallet,
                {
                  ...mapped,
                  txHash: normalizedTxHash,
                },
                {
                  isSystemManaged,
                },
              );
              const payload = {
                userId: wallet.userId,
                accountId: wallet.accountId,
                walletId: wallet._id,
                chain: wallet.chain,
                type: "transfer",
                transactionType: "external",
                direction: mapped.direction,
                fromAddress: mapped.fromAddress,
                toAddress: mapped.toAddress,
                executionParams,
                amount:
                  mapped.amount || this.fromBaseUnits(context, amountBaseUnits),
                amountBaseUnits,
                currency:
                  mapped.currency ||
                  mapped.asset ||
                  this.getAsset(wallet, context),
                asset:
                  mapped.asset ||
                  mapped.currency ||
                  this.getAsset(wallet, context),
                assetType: mapped.assetType || "native",
                standard: mapped.standard || "native",
                contractAddress: mapped.contractAddress || null,
                network: wallet.network,
                networkFee:
                  mapped.networkFee ||
                  this.fromBaseUnits(context, networkFeeBaseUnits),
                networkFeeBaseUnits,
                networkFeeAsset: mapped.networkFeeAsset || context.assetSymbol,
                networkFeeCurrency:
                  mapped.networkFeeCurrency || context.assetSymbol,
                networkFeeAssetType: mapped.networkFeeAssetType || "native",
                platformFee: "0",
                platformFeeBaseUnits: "0",
                totalDebit:
                  mapped.totalDebit ||
                  (mapped.assetType === "token"
                    ? mapped.amount ||
                    this.fromBaseUnits(context, amountBaseUnits)
                    : this.fromBaseUnits(context, totalDebitBaseUnits)),
                totalDebitBaseUnits,
                totalDebitAsset:
                  mapped.totalDebitAsset ||
                  mapped.asset ||
                  mapped.currency ||
                  this.getAsset(wallet, context),
                totalDebitCurrency:
                  mapped.totalDebitCurrency ||
                  mapped.currency ||
                  mapped.asset ||
                  this.getAsset(wallet, context),
                totalDebitAssetType:
                  mapped.totalDebitAssetType || mapped.assetType || "native",
                compositeDebit: mapped.compositeDebit || null,
                recipientGets:
                  mapped.amount || this.fromBaseUnits(context, amountBaseUnits),
                recipientGetsBaseUnits: amountBaseUnits,
                txHash: normalizedTxHash || null,
                ledgerIndex: mapped.ledgerIndex,
                validated: mapped.validated === true,
                succeeded: mapped.succeeded === true,
                confirmations: Number(mapped.confirmations || 0),
                ...this.getChainStatusFields(
                  context,
                  mapped.chainStatus || "synced",
                ),
                systemStatus: isSystemManaged
                  ? "synced_system_fee"
                  : `synced_from_${context.chain}`,
                status: getExecutionStatus(mapped),
                isSystemManaged,
                // History sync must never surface brand-new chain-discovered rows
                // in Superadmin. Only preserve the flag when we are reconciling an
                // already-classified platform transaction.
                visibleInSuperadmin: existing?.visibleInSuperadmin === true,
                rawRequest: buildSafeTransaction(
                  mapped.tx || mapped.rawRequest,
                ),
                rawResponse: buildSafeTransaction(entry),
                ...this.buildTransactionTimeFields(mapped, existing),
              };

              let persistedTransactionId = existing
                ? String(existing._id)
                : null;

              if (existing) {
                if (!normalizeTxHash(existing.txHash) && payload.txHash) {
                  logger.info(
                    "Reconciled pending transaction during history sync",
                    {
                      source: "syncWalletTransactions",
                      transactionId: String(existing._id),
                      walletId: String(wallet._id),
                      chain: wallet.chain,
                      network: wallet.network,
                      txHash: payload.txHash,
                    },
                  );
                }

                await Transaction.updateOne(
                  { _id: existing._id },
                  { $set: payload },
                );
                updated += 1;
                const persistedTransaction = {
                  ...existing,
                  ...payload,
                  _id: existing._id,
                };
                if (payload.direction === "outgoing") {
                  await consistencyService.upsertWithdrawalFromTransaction(
                    persistedTransaction,
                    {
                      source: "history_sync",
                    },
                  );
                } else {
                  await consistencyService.upsertDepositFromTransaction(
                    persistedTransaction,
                    {
                      source: "history_sync",
                    },
                  );
                }
                socket.emitTransactionUpdate(persistedTransaction);
              } else {
                if (payload.direction === "outgoing" && payload.txHash) {
                  logger.warn(
                    "Creating new outgoing sync row despite known txHash - possible duplicate",
                    {
                      source: "syncWalletTransactions",
                      walletId: String(wallet._id),
                      chain: wallet.chain,
                      network: wallet.network,
                      txHash: payload.txHash,
                      direction: payload.direction,
                      fromAddress: payload.fromAddress,
                      toAddress: payload.toAddress,
                      amountBaseUnits: payload.amountBaseUnits,
                    },
                  );
                }

                const transaction = await Transaction.create(payload);
                created += 1;
                persistedTransactionId = String(transaction._id);
                if (payload.direction === "outgoing") {
                  await consistencyService.upsertWithdrawalFromTransaction(
                    transaction,
                    {
                      source: "history_sync",
                    },
                  );
                } else {
                  await consistencyService.upsertDepositFromTransaction(
                    transaction,
                    {
                      source: "history_sync",
                    },
                  );
                }
                socket.emitTransactionNew(transaction);
              }

              if (!existing && payload.direction === "incoming") {
                await createNotificationSafely(
                  {
                    userId: String(payload.userId),
                    type: "PLATFORM_TRANSFER_RECEIVED",
                    title: "Payment received",
                    message: `You received ${payload.amount} ${payload.asset}`,
                    metadata: {
                      transactionId: persistedTransactionId,
                      walletId: String(payload.walletId),
                      chain: payload.chain,
                      network: payload.network,
                      asset: payload.asset,
                      amount: payload.amount,
                      direction: "incoming",
                      fromAddress: payload.fromAddress,
                      toAddress: payload.toAddress,
                      txHash: payload.txHash || "",
                    },
                  },
                  {
                    transactionId: persistedTransactionId,
                    walletId: String(payload.walletId),
                    source: "syncWalletTransactions",
                  },
                  {
                    source: "history_sync",
                    isInitialSync: !hasCompletedHistorySync,
                    eventTimestamp:
                      payload.confirmedAt || payload.chainTimestamp || null,
                    asset: payload.asset,
                    amount: payload.amount,
                  },
                );
              }
            } catch (entryError) {
              failed += 1;
              logger.warn("Skipped transaction history entry during sync", {
                source: "syncWalletTransactions",
                walletId: String(wallet._id),
                userId: String(userId),
                chain: wallet.chain,
                network: wallet.network,
                txHash: normalizeTxHash(
                  entry?.txHash || entry?.hash || entry?.transactionHash || "",
                ),
                error:
                  entryError instanceof Error
                    ? entryError.message
                    : String(entryError),
              });
            }
          }

          try {
            if (String(wallet.chain || "").toLowerCase() === "polygon") {
              const lastSyncedBlock = Number(
                wallet.metadata?.nftHistorySync?.lastSyncedBlock || 0,
              );
              const fromBlockHex = `0x${lastSyncedBlock.toString(16)}`;
              const nftEntries =
                typeof context.adapter?.nft?.fetchTransferHistory === "function"
                  ? await context.adapter.nft.fetchTransferHistory({
                    address: wallet.address,
                    network: wallet.network,
                    fromBlock: fromBlockHex,
                    limit: 100,
                  })
                  : [];

              if (nftEntries.length > 0) {
                for (const rawEvent of nftEntries) {
                  try {
                    const mapped = context.adapter.mapper.mapNftTransaction(
                      rawEvent,
                      wallet.address,
                    );
                    if (
                      !mapped ||
                      !mapped.txHash ||
                      !mapped.historyUniqueKey ||
                      !mapped.contractAddress ||
                      !mapped.metadata?.nft?.tokenId ||
                      !mapped.direction
                    ) {
                      continue;
                    }

                    const payload = buildNftHistoryTransactionPayload({
                      wallet,
                      mapped,
                      rawResponse: mapped.rawResponse || { event: rawEvent },
                    });
                    const existingTx = await this.findExistingHistoryTransaction(
                      wallet,
                      {
                        ...mapped,
                        historyUniqueKey: payload.historyUniqueKey,
                        txHash: payload.txHash,
                        logIndex: payload.logIndex || mapped.logIndex || rawEvent.logIndex,
                        contractAddress: payload.contractAddress,
                        tokenId: payload.metadata?.nft?.tokenId,
                        standard:
                          payload.metadata?.nft?.standard || payload.standard,
                      },
                    );

                    if (existingTx) {
                      await Transaction.updateOne(
                        { _id: existingTx._id },
                        { $set: payload },
                      );
                      updated += 1;
                    } else {
                      const transaction = await Transaction.create(payload);
                      created += 1;
                      socket.emitTransactionNew(transaction);
                    }
                  } catch (error) {
                    failed += 1;
                    logger.warn("Failed to process NFT delta sync entry", {
                      walletId: String(wallet._id),
                      error:
                        error instanceof Error ? error.message : String(error),
                    });
                  }
                }

                const maxBlock = nftEntries.reduce((max, entry) => {
                  return entry.blockNum && entry.blockNum > max
                    ? entry.blockNum
                    : max;
                }, lastSyncedBlock);

                if (maxBlock > lastSyncedBlock) {
                  await Wallet.updateOne(
                    { _id: wallet._id },
                    {
                      $set: {
                        "metadata.nftHistorySync.lastSyncedBlock": maxBlock,
                        "metadata.nftHistorySync.lastSyncedAt": new Date(),
                      },
                    },
                  );
                }

                logger.info("nft-delta-sync", {
                  walletId: String(wallet._id),
                  fromBlock: fromBlockHex,
                  fetched: nftEntries.length,
                  newMaxBlock: maxBlock,
                });
              }
            }
          } catch (error) {
            logger.warn("NFT delta sync failed during wallet history sync", {
              source: "syncWalletTransactions",
              walletId: String(wallet._id),
              userId: String(userId),
              chain: wallet.chain,
              network: wallet.network,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          if (wallet.chain === "ada") {
            await reconcilePendingTransactionsForWallet({
              walletId: String(wallet._id),
              chain: wallet.chain,
              network: wallet.network,
              logger,
              logContext: {
                source: "syncWalletTransactions",
              },
            });
          }

          const finishedAt = new Date();
          const historySyncCompletedAt =
            wallet.metadata?.historySync?.completedAt || finishedAt;

          await Wallet.updateOne(
            { _id: wallet._id },
            {
              $set: {
                "metadata.historySync.completedAt": historySyncCompletedAt,
                "metadata.historySync.lastAttemptAt": syncAttemptedAt,
                "metadata.historySync.lastSyncedAt": finishedAt,
                "metadata.historySync.lastScannedCount": entries.length,
                "metadata.historySync.lastCreatedCount": created,
                "metadata.historySync.lastUpdatedCount": updated,
                "metadata.historySync.lastFailedCount": failed,
                "metadata.historySync.lastError": null,
                "metadata.historySync.lastTrigger": String(
                  options.trigger || "history_sync",
                ),
                "metadata.historySync.lastDurationMs":
                  finishedAt.getTime() - startedAt,
              },
              $unset: {
                "metadata.historySync.lastSkippedAt": 1,
                "metadata.historySync.lastSkipReason": 1,
              },
            },
          );

          if (failed > 0) {
            logger.warn("Wallet history sync completed with skipped entries", {
              source: "syncWalletTransactions",
              walletId: String(wallet._id),
              userId: String(userId),
              chain: wallet.chain,
              network: wallet.network,
              created,
              updated,
              failed,
              scanned: entries.length,
            });
          } else {
            logger.debug("Completed wallet history sync", {
              event: "wallet_history_sync_completed",
              walletId: String(wallet._id),
              userId: String(userId),
              chain: wallet.chain,
              network: wallet.network,
              trigger: options.trigger || "history_sync",
              forced: isForcedHistorySync(options),
              created,
              updated,
              failed,
              scanned: entries.length,
              durationMs: finishedAt.getTime() - startedAt,
            });
          }

          // Trigger a balance refresh after successful history sync to ensure
          // balance UI reflects any newly discovered transactions immediately.
          if (created > 0 || updated > 0) {
            balanceService
              .getWalletBalance(userId, wallet._id, {
                force: true,
                chain: wallet.chain,
                network: wallet.network,
                trigger: "history_sync_post",
              })
              .catch((err) => {
                logger.warn("Post-sync balance refresh failed (non-critical)", {
                  walletId: String(wallet._id),
                  error: err.message,
                });
              });
          }

          return { created, updated, failed, scanned: entries.length };
        } catch (error) {
          await Wallet.updateOne(
            { _id: wallet._id },
            {
              $set: {
                "metadata.historySync.lastAttemptAt": syncAttemptedAt,
                "metadata.historySync.lastError":
                  error instanceof Error ? error.message : String(error),
                "metadata.historySync.lastTrigger": String(
                  options.trigger || "history_sync",
                ),
                "metadata.historySync.lastDurationMs": Date.now() - startedAt,
                "metadata.historySync.lastFailedAt": new Date(),
              },
            },
          );

          logger.warn("Wallet history sync failed", {
            event: "wallet_history_sync_failed",
            walletId: String(wallet._id),
            userId: String(userId),
            chain: wallet.chain,
            network: wallet.network,
            trigger: options.trigger || "history_sync",
            forced: isForcedHistorySync(options),
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
    );
  }

  async executeInternalTransfer(input, preview) {
    if (!transactionConfig.useLocalInternalSettlement()) {
      throw AppError.validation(
        "Local internal settlement is disabled for platform transfers",
      );
    }

    const senderWallet = await this.getWalletOrFail(
      input.userId,
      input.walletId,
      true,
    );
    const context = assertChainFeature(
      senderWallet.chain,
      senderWallet.network,
      "internalTransfer",
    );
    const receiverWallet = preview.internalWalletId
      ? await Wallet.findOne({
        _id: preview.internalWalletId,
        chain: senderWallet.chain,
        network: preview.network,
      }).lean()
      : null;

    if (!receiverWallet) {
      throw AppError.notFound("Internal recipient wallet not found");
    }

    if (String(receiverWallet._id) === String(senderWallet._id)) {
      throw AppError.validation("Cannot send to the same wallet");
    }

    await this.assertSufficientBalance(
      input.userId,
      input.walletId,
      preview.amountBaseUnits,
      "0",
      { requestId: input.requestId },
    );

    const settledPreview = {
      ...preview,
      networkFee: "0",
      networkFeeBaseUnits: "0",
      platformFee: "0",
      platformFeeBaseUnits: "0",
      totalDebit: preview.amount,
      totalDebitBaseUnits: preview.amountBaseUnits,
      recipientGets: preview.amount,
      recipientGetsBaseUnits: preview.amountBaseUnits,
    };
    const basePayload = this.buildTransactionAmounts(context, {
      ...settledPreview,
      currency: this.getAsset(senderWallet, context),
      asset: this.getAsset(senderWallet, context),
    });

    const senderTransaction = await Transaction.create({
      userId: senderWallet.userId,
      accountId: senderWallet.accountId,
      walletId: senderWallet._id,
      chain: senderWallet.chain,
      type: "transfer",
      transactionType: "internal",
      direction: "outgoing",
      fromAddress: senderWallet.address,
      toAddress: receiverWallet.address,
      executionParams: preview.executionParams,
      ...basePayload,
      network: senderWallet.network,
      status: "success",
      ...this.getChainStatusFields(context, "not_broadcast_internal"),
      systemStatus: "internal_settled",
      rawRequest: {
        amount: preview.amount,
        destinationAddress: preview.toAddress,
        executionParams: preview.executionParams,
        recipientGets: settledPreview.recipientGets,
      },
      rawResponse: {
        internal: true,
        matchStrategy: preview.internalMatchStrategy || "address",
      },
      confirmedAt: new Date(),
      visibleInSuperadmin: true,
    });

    const receiverTransaction = await Transaction.create({
      userId: receiverWallet.userId,
      accountId: receiverWallet.accountId,
      walletId: receiverWallet._id,
      chain: receiverWallet.chain,
      type: "transfer",
      transactionType: "internal",
      direction: "incoming",
      fromAddress: senderWallet.address,
      toAddress: receiverWallet.address,
      executionParams: preview.executionParams,
      ...this.buildTransactionAmounts(context, {
        amount: preview.recipientGets,
        amountBaseUnits: preview.recipientGetsBaseUnits,
        networkFee: "0",
        networkFeeBaseUnits: "0",
        platformFee: "0",
        platformFeeBaseUnits: "0",
        totalDebit: "0",
        totalDebitBaseUnits: "0",
        recipientGets: preview.recipientGets,
        recipientGetsBaseUnits: preview.recipientGetsBaseUnits,
        currency: this.getAsset(receiverWallet, context),
        asset: this.getAsset(receiverWallet, context),
      }),
      assetType: assetDescriptor.assetType,
      standard: assetDescriptor.standard,
      contractAddress: assetDescriptor.contractAddress,
      networkFeeAsset: preview.networkFeeAsset || context.assetSymbol,
      networkFeeCurrency: preview.networkFeeCurrency || context.assetSymbol,
      networkFeeAssetType: preview.networkFeeAssetType || "native",
      totalDebitAsset: preview.totalDebitAsset || assetDescriptor.asset,
      totalDebitCurrency: preview.totalDebitCurrency || assetDescriptor.symbol,
      totalDebitAssetType:
        preview.totalDebitAssetType || assetDescriptor.assetType,
      compositeDebit: preview.compositeDebit || null,
      network: receiverWallet.network,
      validated: false,
      succeeded: false,
      confirmations: 0,
      ...this.getChainStatusFields(context, "pending_submission"),
      systemStatus: "submitting",
      status: "pending",
      visibleInSuperadmin: true,
      rawRequest: {
        amount: preview.amount,
        asset: assetDescriptor.asset,
        contractAddress: assetDescriptor.contractAddress,
        destinationAddress: preview.toAddress,
        executionParams: preview.executionParams,
        recipientGets: preview.recipientGets,
      },
      visibleInSuperadmin: true,
    });
    socket.emitTransactionNew(senderTransaction);
    socket.emitTransactionNew(receiverTransaction);

    await Transaction.updateOne(
      { _id: senderTransaction._id },
      {
        $set: {
          relatedTransactionId: receiverTransaction._id,
          networkFee: "0",
          networkFeeBaseUnits: "0",
          platformFee: "0",
          platformFeeBaseUnits: "0",
          totalDebit: settledPreview.totalDebit,
          totalDebitBaseUnits: settledPreview.totalDebitBaseUnits,
          recipientGets: settledPreview.recipientGets,
          recipientGetsBaseUnits: settledPreview.recipientGetsBaseUnits,
          systemStatus: "internal_settled",
          status: "success",
          confirmedAt: new Date(),
        },
      },
    );
    await Transaction.updateOne(
      { _id: receiverTransaction._id },
      { $set: { relatedTransactionId: senderTransaction._id } },
    );

    await ledgerService.writeLedgerEntries(
      [
        {
          userId: senderWallet.userId,
          walletId: senderWallet._id,
          transactionId: senderTransaction._id,
          direction: "debit",
          ...this.getLedgerAmountFields(
            preview.recipientGets,
            preview.recipientGetsBaseUnits,
          ),
          asset: this.getAsset(senderWallet, context),
          note: `Internal transfer to ${receiverWallet.address}`,
        },
        {
          userId: receiverWallet.userId,
          walletId: receiverWallet._id,
          transactionId: receiverTransaction._id,
          direction: "credit",
          ...this.getLedgerAmountFields(
            preview.recipientGets,
            preview.recipientGetsBaseUnits,
          ),
          asset: this.getAsset(receiverWallet, context),
          note: `Internal transfer from ${senderWallet.address}`,
        },
      ],
      {
        invalidateReason: "internal_transfer_settled",
      },
    );

    logger.info("Internal transfer settled", {
      requestId: input.requestId || null,
      transactionId: String(senderTransaction._id),
      relatedTransactionId: String(receiverTransaction._id),
      walletId: String(senderWallet._id),
      receiverWalletId: String(receiverWallet._id),
      chain: senderWallet.chain,
      network: senderWallet.network,
      amountBaseUnits: preview.recipientGetsBaseUnits,
    });

    await Promise.all([
      createNotificationSafely(
        {
          userId: String(senderWallet.userId),
          type: "INTERNAL_TRANSFER_SENT",
          title: "Transfer sent",
          message: `You sent ${preview.recipientGets} ${context.assetSymbol}`,
          metadata: {
            transactionId: String(senderTransaction._id),
            relatedTransactionId: String(receiverTransaction._id),
            walletId: String(senderWallet._id),
            senderUserId: String(senderWallet.userId),
            receiverUserId: String(receiverWallet.userId),
            chain: senderWallet.chain,
            network: senderWallet.network,
            asset: this.getAsset(senderWallet, context),
            amount: preview.recipientGets,
            direction: "outgoing",
            fromAddress: senderWallet.address,
            toAddress: receiverWallet.address,
          },
        },
        {
          transactionId: String(senderTransaction._id),
          walletId: String(senderWallet._id),
          source: "executeInternalTransfer:sender",
        },
      ),
      createNotificationSafely(
        {
          userId: String(receiverWallet.userId),
          type: "INTERNAL_TRANSFER_RECEIVED",
          title: "Payment received",
          message: `You received ${preview.recipientGets} ${context.assetSymbol}`,
          metadata: {
            transactionId: String(receiverTransaction._id),
            relatedTransactionId: String(senderTransaction._id),
            walletId: String(receiverWallet._id),
            senderUserId: String(senderWallet.userId),
            receiverUserId: String(receiverWallet.userId),
            chain: receiverWallet.chain,
            network: receiverWallet.network,
            asset: this.getAsset(receiverWallet, context),
            amount: preview.recipientGets,
            direction: "incoming",
            fromAddress: senderWallet.address,
            toAddress: receiverWallet.address,
          },
        },
        {
          transactionId: String(receiverTransaction._id),
          walletId: String(receiverWallet._id),
          source: "executeInternalTransfer:receiver",
        },
      ),
    ]);

    return this.getTransactionById(input.userId, String(senderTransaction._id));
  }

  async executeExternalTransfer(input, preview) {
    const wallet = await this.getWalletOrFail(
      input.userId,
      input.walletId,
    );
    const context = this.getContext(wallet.chain);
    const assetDescriptor = this.resolveTransferAsset(
      wallet,
      preview.asset || input.asset,
    );
    const mnemonicProvider = this.createDeferredMnemonicProvider({
      requestId: input.requestId || null,
      userId: input.userId,
      walletId: input.walletId,
      chain: wallet.chain,
      network: wallet.network,
      operation: "transaction_execute_transfer",
      source: "execute_external_transfer",
    });

    await this.assertSufficientBalance(
      input.userId,
      input.walletId,
      addBaseUnits(preview.amountBaseUnits, preview.platformFeeBaseUnits),
      preview.networkFeeBaseUnits,
      {
        requestId: input.requestId,
        assetDescriptor,
      },
    );

    const pendingTransaction = await Transaction.create({
      userId: wallet.userId,
      accountId: wallet.accountId,
      walletId: wallet._id,
      chain: wallet.chain,
      type: "transfer",
      transactionType: "external",
      direction: "outgoing",
      fromAddress: wallet.address,
      toAddress: preview.toAddress,
      executionParams: preview.executionParams,
      ...this.buildTransactionAmounts(context, {
        ...preview,
        currency: assetDescriptor.symbol,
        asset: assetDescriptor.asset,
      }),
      assetType: assetDescriptor.assetType,
      standard: assetDescriptor.standard,
      contractAddress: assetDescriptor.contractAddress,
      networkFeeAsset: preview.networkFeeAsset || context.assetSymbol,
      networkFeeCurrency: preview.networkFeeCurrency || context.assetSymbol,
      networkFeeAssetType: preview.networkFeeAssetType || "native",
      totalDebitAsset: preview.totalDebitAsset || assetDescriptor.asset,
      totalDebitCurrency: preview.totalDebitCurrency || assetDescriptor.symbol,
      totalDebitAssetType:
        preview.totalDebitAssetType || assetDescriptor.assetType,
      compositeDebit: preview.compositeDebit || null,
      network: wallet.network,
      validated: false,
      succeeded: false,
      confirmations: 0,
      ...this.getChainStatusFields(context, "pending_submission"),
      systemStatus: "submitting",
      status: "pending",
      visibleInSuperadmin: true,
      rawRequest: {
        amount: preview.amount,
        asset: assetDescriptor.asset,
        contractAddress: assetDescriptor.contractAddress,
        destinationAddress: preview.toAddress,
        executionParams: preview.executionParams,
        recipientGets: preview.recipientGets,
      },
    });
    emitSocketEventSafely("emitTransactionNew", pendingTransaction, {
      requestId: input.requestId || null,
      transactionId: String(pendingTransaction._id),
      walletId: String(wallet._id),
      chain: wallet.chain,
      network: wallet.network,
      source: "executeExternalTransfer:pending",
    });
    await consistencyService.upsertWithdrawalFromTransaction(
      pendingTransaction,
      {
        source: "send_flow",
      },
    );

    let submissionPersisted = false;
    let persistedPendingTransaction = null;

    try {
      let feeCollection = null;
      let extraFeeBaseUnits = "0";
      let submission = null;
      let normalizedSubmissionTxHash = null;
      let receiverTransaction = null;
      let mnemonic = null;

      if (preview.platformFeeBaseUnits !== "0") {
        mnemonic = await mnemonicProvider();
        feeCollection = await this.collectPlatformFeeFromWallet({
          wallet: {
            _id: wallet._id,
            userId: String(wallet.userId),
            accountId: wallet.accountId || null,
            address: wallet.address,
            network: wallet.network,
            chain: wallet.chain,
          },
          requestId: input.requestId || null,
          mnemonic,
          preview,
          parentTransactionId: pendingTransaction._id,
        });

        if (feeCollection?.status !== "success") {
          await Transaction.updateOne(
            { _id: pendingTransaction._id },
            {
              $set: {
                networkFee: feeCollection?.networkFee || "0",
                networkFeeBaseUnits: feeCollection?.networkFeeBaseUnits || "0",
                totalDebit:
                  assetDescriptor.assetType === "token"
                    ? this.fromTransferBaseUnits(
                      assetDescriptor,
                      addBaseUnits(
                        preview.amountBaseUnits,
                        preview.platformFeeBaseUnits,
                      ),
                    )
                    : this.fromBaseUnits(
                      context,
                      addBaseUnits(
                        preview.amountBaseUnits,
                        preview.platformFeeBaseUnits,
                        feeCollection?.networkFeeBaseUnits || "0",
                      ),
                    ),
                totalDebitBaseUnits:
                  assetDescriptor.assetType === "token"
                    ? addBaseUnits(
                      preview.amountBaseUnits,
                      preview.platformFeeBaseUnits,
                    )
                    : addBaseUnits(
                      preview.amountBaseUnits,
                      preview.platformFeeBaseUnits,
                      feeCollection?.networkFeeBaseUnits || "0",
                    ),
                ...this.getChainStatusFields(context, "platform_fee_failed"),
                systemStatus: "platform_fee_failed_before_submission",
                status: "failed",
                errorMessage:
                  feeCollection?.errorMessage ||
                  "Application fee collection failed",
                rawResponse: buildSafeTransaction({
                  platformFeeCollection: feeCollection,
                }),
              },
            },
          );
          const updatedPending = await Transaction.findById(
            pendingTransaction._id,
          ).lean();
          socket.emitTransactionUpdate(updatedPending);
          await consistencyService.upsertWithdrawalFromTransaction(
            {
              ...pendingTransaction.toObject(),
              networkFee: feeCollection?.networkFee || "0",
              networkFeeBaseUnits: feeCollection?.networkFeeBaseUnits || "0",
              ...this.getChainStatusFields(context, "platform_fee_failed"),
              systemStatus: "platform_fee_failed_before_submission",
              status: "failed",
              errorMessage:
                feeCollection?.errorMessage ||
                "Application fee collection failed",
            },
            {
              source: "send_flow",
            },
          );

          return this.getTransactionById(
            input.userId,
            String(pendingTransaction._id),
          );
        }

        extraFeeBaseUnits = feeCollection.networkFeeBaseUnits;
      }

      mnemonic = mnemonic || (await mnemonicProvider());
      this.logSensitiveOperation(
        "info",
        "Sensitive signing operation initiated",
        {
          requestId: input.requestId || null,
          userId: input.userId,
          walletId: wallet._id,
          transactionId: pendingTransaction._id,
          chain: wallet.chain,
          network: wallet.network,
          operation: "transaction_execute_transfer",
          source: "execute_external_transfer",
        },
        {
          asset: assetDescriptor.asset,
          destinationAddress: preview.toAddress,
        },
      );
      logger.info("Preparing external transfer injection", {
        requestId: input.requestId || null,
        transactionId: String(pendingTransaction._id),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        asset: assetDescriptor.asset,
        amount: preview.amount,
        amountBaseUnits: preview.amountBaseUnits,
        toAddress: preview.toAddress,
      });
      submission = await context.adapter.transaction.executeTransfer({
        network: wallet.network,
        mnemonic,
        fromAddress: wallet.address,
        toAddress: preview.toAddress,
        amount: preview.recipientGets,
        executionParams: preview.executionParams,
        asset: assetDescriptor.asset,
        assetDescriptor,
      });
      logger.info("External transfer injected to chain", {
        requestId: input.requestId || null,
        transactionId: String(pendingTransaction._id),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        txHash: normalizeTxHash(submission?.txHash) || null,
        chainStatus: submission?.chainStatus || "submitted",
      });
      const status = getExecutionStatus(submission);
      const acceptedPendingSubmission = isAcceptedPendingSubmission(submission);
      // Normalize before persisting so the stored txHash is always in canonical
      // form. syncWalletTransactions normalizes the mapped txHash before the
      // exact-hash reconciliation lookup, so both sides must match.
      normalizedSubmissionTxHash = normalizeTxHash(submission.txHash);
      const totalNetworkFeeBaseUnits = addBaseUnits(
        submission.networkFeeBaseUnits || "0",
        extraFeeBaseUnits,
      );
      const totalDebitBaseUnits =
        assetDescriptor.assetType === "token"
          ? addBaseUnits(preview.amountBaseUnits, preview.platformFeeBaseUnits)
          : addBaseUnits(
            preview.amountBaseUnits,
            preview.platformFeeBaseUnits,
            totalNetworkFeeBaseUnits,
          );

      await Transaction.updateOne(
        { _id: pendingTransaction._id },
        {
          $set: {
            networkFee:
              submission.networkFee ||
              this.fromBaseUnits(context, totalNetworkFeeBaseUnits),
            networkFeeBaseUnits: totalNetworkFeeBaseUnits,
            txHash: normalizedSubmissionTxHash || null,
            ledgerIndex: submission.ledgerIndex,
            validated: submission.validated === true,
            succeeded: submission.succeeded === true,
            confirmations: Number(submission.confirmations || 0),
            ...this.getChainStatusFields(
              context,
              submission.chainStatus || "submitted",
            ),
            systemStatus:
              submission.succeeded || acceptedPendingSubmission
                ? preview.platformFeeBaseUnits !== "0"
                  ? submission.validated
                    ? "submitted_with_platform_fee"
                    : "submitted_pending_with_platform_fee"
                  : submission.validated
                    ? "submitted_to_chain"
                    : "submitted_pending"
                : preview.platformFeeBaseUnits !== "0"
                  ? "recipient_transfer_failed_after_platform_fee"
                  : "chain_rejected",
            status,
            errorMessage:
              submission.succeeded || acceptedPendingSubmission
                ? undefined
                : preview.platformFeeBaseUnits !== "0"
                  ? "Recipient transfer failed after application fee was collected"
                  : `Chain returned ${submission.chainStatus || "failed"}`,
            rawRequest: buildSafeTransaction(submission.rawRequest),
            rawResponse: buildSafeTransaction({
              recipientTransfer: submission.rawResponse,
              platformFeeCollection: feeCollection || undefined,
            }),
            ...this.buildTransactionTimeFields(submission, pendingTransaction),
            totalDebit:
              assetDescriptor.assetType === "token"
                ? this.fromTransferBaseUnits(
                  assetDescriptor,
                  totalDebitBaseUnits,
                )
                : this.fromBaseUnits(context, totalDebitBaseUnits),
            totalDebitBaseUnits,
          },
        },
      );
      const finalizedPending = await Transaction.findById(
        pendingTransaction._id,
      ).lean();
      submissionPersisted = true;
      persistedPendingTransaction = finalizedPending;
      logger.info("External transfer persisted after chain submission", {
        requestId: input.requestId || null,
        transactionId: String(pendingTransaction._id),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        txHash: normalizedSubmissionTxHash || null,
        status,
        chainStatus: submission.chainStatus || "submitted",
      });
      this.logSensitiveOperation(
        "info",
        "Sensitive signing operation succeeded",
        {
          requestId: input.requestId || null,
          userId: input.userId,
          walletId: wallet._id,
          transactionId: pendingTransaction._id,
          chain: wallet.chain,
          network: wallet.network,
          operation: "transaction_execute_transfer",
          source: "execute_external_transfer",
        },
        {
          txHash: normalizedSubmissionTxHash || null,
          chainStatus: submission.chainStatus || "submitted",
          status,
        },
      );
      emitSocketEventSafely("emitTransactionUpdate", finalizedPending, {
        requestId: input.requestId || null,
        transactionId: String(pendingTransaction._id),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        source: "executeExternalTransfer:submitted",
      });
      const postSubmissionTasks = [
        {
          name: "withdrawal_consistency",
          run: () =>
            consistencyService.upsertWithdrawalFromTransaction(
              {
                ...pendingTransaction.toObject(),
                networkFee:
                  submission.networkFee ||
                  this.fromBaseUnits(context, totalNetworkFeeBaseUnits),
                networkFeeBaseUnits: totalNetworkFeeBaseUnits,
                txHash: normalizedSubmissionTxHash || null,
                ledgerIndex: submission.ledgerIndex,
                ...this.getChainStatusFields(
                  context,
                  submission.chainStatus || "submitted",
                ),
                systemStatus:
                  submission.succeeded || acceptedPendingSubmission
                    ? preview.platformFeeBaseUnits !== "0"
                      ? submission.validated
                        ? "submitted_with_platform_fee"
                        : "submitted_pending_with_platform_fee"
                      : submission.validated
                        ? "submitted_to_chain"
                        : "submitted_pending"
                    : preview.platformFeeBaseUnits !== "0"
                      ? "recipient_transfer_failed_after_platform_fee"
                      : "chain_rejected",
                status,
                errorMessage:
                  submission.succeeded || acceptedPendingSubmission
                    ? undefined
                    : preview.platformFeeBaseUnits !== "0"
                      ? "Recipient transfer failed after application fee was collected"
                      : `Chain returned ${submission.chainStatus || "failed"}`,
                ...this.buildTransactionTimeFields(submission, pendingTransaction),
              },
              {
                source: "send_flow",
              },
            ),
        },
      ];

      if (
        (submission.succeeded || acceptedPendingSubmission) &&
        String(wallet.chain || "").trim().toLowerCase() === "xtz"
      ) {
        postSubmissionTasks.push({
          name: "sender_balance_refresh",
          run: () =>
            forceWalletBalanceRefreshSafely(wallet.userId, wallet._id, {
              trigger: "xtz_post_send_sender_refresh",
              logContext: {
                requestId: input.requestId || null,
                transactionId: String(pendingTransaction._id),
                chain: wallet.chain,
                network: wallet.network,
                source: "executeExternalTransfer:sender_balance_refresh",
              },
            }),
        });
      }

      // Same-platform on-chain transfers must not pre-seed receiver history.
      // Receiver history and balance should appear only after the chain sync
      // confirms the transfer for that wallet.
      logger.info(
        "Same-platform receiver mirror history creation skipped for on-chain transfer",
        {
          requestId: input.requestId || null,
          transactionId: String(pendingTransaction._id),
          walletId: String(wallet._id),
          chain: wallet.chain,
          network: wallet.network,
          samePlatformRecipient: Boolean(preview.samePlatformRecipient),
          samePlatformRecipientWalletId:
            preview.samePlatformRecipientWalletId || null,
          samePlatformRecipientUserId:
            preview.samePlatformRecipientUserId || null,
        },
      );
      if (
        (submission.succeeded || acceptedPendingSubmission) &&
        normalizedSubmissionTxHash &&
        preview.samePlatformRecipient &&
        preview.samePlatformRecipientUserId &&
        preview.samePlatformRecipientWalletId
      ) {
        if (String(wallet.chain || "").trim().toLowerCase() === "xtz") {
          postSubmissionTasks.push({
            name: "recipient_balance_refresh",
            run: () =>
              forceWalletBalanceRefreshSafely(
                preview.samePlatformRecipientUserId,
                preview.samePlatformRecipientWalletId,
                {
                  trigger: "xtz_post_send_recipient_refresh",
                  logContext: {
                    requestId: input.requestId || null,
                    transactionId: String(pendingTransaction._id),
                    chain: wallet.chain,
                    network: wallet.network,
                    source: "executeExternalTransfer:recipient_balance_refresh",
                  },
                },
              ),
          });
        }

        postSubmissionTasks.push({
          name: "same_platform_sender_notification",
          run: () =>
            createNotificationSafely(
              {
                userId: wallet.userId,
                type: "PLATFORM_TRANSFER_SENT",
                title: "Transfer sent",
                message: `You sent ${preview.amount} ${preview.asset}`,
                metadata: {
                  transactionId: String(pendingTransaction._id),
                  walletId: String(wallet._id),
                  senderUserId: String(wallet.userId),
                  receiverUserId: String(preview.samePlatformRecipientUserId),
                  chain: wallet.chain,
                  network: wallet.network,
                  asset: preview.asset,
                  amount: preview.amount,
                  direction: "outgoing",
                  fromAddress: wallet.address,
                  toAddress: preview.toAddress,
                  txHash: normalizedSubmissionTxHash || "",
                },
              },
              {
                transactionId: String(pendingTransaction._id),
                walletId: String(wallet._id),
                source: "executeExternalTransfer:sender",
              },
            ),
        });
      }

      const postSubmissionResults = await Promise.allSettled(
        postSubmissionTasks.map((task) => Promise.resolve().then(() => task.run())),
      );

      postSubmissionResults.forEach((result, index) => {
        if (result.status === "rejected") {
          logger.warn("External transfer post-submission task failed", {
            requestId: input.requestId || null,
            transactionId: String(pendingTransaction._id),
            walletId: String(wallet._id),
            chain: wallet.chain,
            network: wallet.network,
            task: postSubmissionTasks[index]?.name || "unknown",
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          });
        }
      });
      logger.info("External transfer post-submission tasks completed", {
        requestId: input.requestId || null,
        transactionId: String(pendingTransaction._id),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        attemptedTaskCount: postSubmissionTasks.length,
        failedTaskCount: postSubmissionResults.filter(
          (result) => result.status === "rejected",
        ).length,
      });

      logger.info("External transfer submission completed", {
        requestId: input.requestId || null,
        transactionId: String(pendingTransaction._id),
        walletId: String(wallet._id),
        txHash: normalizedSubmissionTxHash || null,
        chain: wallet.chain,
        network: wallet.network,
        chainStatus: submission.chainStatus || "submitted",
        status,
      });
         logger.info("Preparing final external transfer response", {
        requestId: input.requestId || null,
        transactionId: String(pendingTransaction._id),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        txHash: normalizedSubmissionTxHash || null,
        status,
      });

      // Try to get fresh details, but don't fail the request if our broadcast succeeded.
      try {
        return await this.getTransactionById(
          input.userId,
          String(pendingTransaction._id),
        );
      } catch (postSubmissionSyncError) {
        logger.warn("External transfer broadcast succeeded but post-submission detail fetch failed", {
          transactionId: String(pendingTransaction._id),
          error: postSubmissionSyncError.message,
        });
        
        // Return the best view we have from the DB
        return (await Transaction.findById(pendingTransaction._id).lean()) || pendingTransaction;
      }
    } catch (error) {
      // CRITICAL: If we have reached a state where the transaction was broadcast (we have a hash),
      // we must NOT mark it as failed or return an error to the user.
      const hasHash = Boolean(
        normalizedSubmissionTxHash || 
        (submission && submission.txHash) || 
        (error && (error.transactionHash || (error.errors && error.errors.transactionHash)))
      );

      if (hasHash || (submission && submission.succeeded) || acceptedPendingSubmission) {
        logger.error("Post-submission failure in executeExternalTransfer (SHADOWED)", {
          transactionId: String(pendingTransaction._id),
          error: error.message,
          stack: error.stack,
        });

        // Try to recover the record
        return (await Transaction.findById(pendingTransaction._id).lean()) || pendingTransaction;
      }

      const errorMessage =
        error instanceof Error ? error.message : "External transfer failed";

      if (submissionPersisted) {
        logger.error(
          "External transfer finalized on chain but response bookkeeping failed",
          {
            requestId: input.requestId || null,
            transactionId: String(pendingTransaction._id),
            walletId: String(wallet._id),
            chain: wallet.chain,
            network: wallet.network,
            error: errorMessage,
          },
        );

        return (
          persistedPendingTransaction ||
          (await Transaction.findById(pendingTransaction._id).lean().catch(() => null)) ||
          pendingTransaction.toObject()
        );
      }

      await Transaction.updateOne(
        { _id: pendingTransaction._id },
        {
          $set: {
            ...this.getChainStatusFields(context, "submit_failed"),
            systemStatus: "external_failed",
            status: "failed",
            errorMessage,
          },
        },
      );
      await consistencyService.upsertWithdrawalFromTransaction(
        {
          ...pendingTransaction.toObject(),
          ...this.getChainStatusFields(context, "submit_failed"),
          systemStatus: "external_failed",
          status: "failed",
          errorMessage,
        },
        {
          source: "send_flow",
        },
      );

      logger.error("External transfer submission failed", {
        requestId: input.requestId || null,
        transactionId: String(pendingTransaction._id),
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        error: errorMessage,
        errorDetails:
          error?.errors && typeof error.errors === "object"
            ? error.errors
            : null,
      });
      this.logSensitiveOperation(
        error instanceof AppError ? "warn" : "error",
        "Sensitive signing operation failed",
        {
          requestId: input.requestId || null,
          userId: input.userId,
          walletId: wallet._id,
          transactionId: pendingTransaction._id,
          chain: wallet.chain,
          network: wallet.network,
          operation: "transaction_execute_transfer",
          source: "execute_external_transfer",
        },
        {
          reason: errorMessage,
        },
      );

      if (error instanceof AppError) {
        throw new AppError(error.message, {
          status: error.status,
          code: error.code,
          errors: {
            ...(error.errors && typeof error.errors === "object"
              ? error.errors
              : {}),
            transactionId: String(pendingTransaction._id),
            reason:
              (error.errors &&
                typeof error.errors === "object" &&
                error.errors.reason) ||
              errorMessage,
          },
        });
      }

      throw new AppError(
        `Failed to submit ${assetDescriptor.asset} transaction`,
        {
          status: 502,
          errors: {
            transactionId: String(pendingTransaction._id),
            reason: errorMessage,
          },
        },
      );
    }

  }

  async listTransactions(query, scope = {}) {
    // Use explicit false so the compound index prefix {userId/walletId, isSystemManaged, ...} is hit.
    const filter = {
      userId: query.userId,
      isSystemManaged: false,
      ...(scope.walletId ? { walletId: scope.walletId } : {}),
    };
    const andClauses = [];

    if (query.status) {
      filter.status = query.status;
    }
    if (query.transactionType) {
      filter.transactionType = query.transactionType;
    }
    if (query.direction) {
      filter.direction = query.direction;
    }
    if (query.network) {
      filter.network = query.network;
    }
    if (query.startDate || query.endDate) {
      const timestampRange = {
        ...(query.startDate ? { $gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { $lte: new Date(query.endDate) } : {}),
      };
      andClauses.push({
        $or: [
          { chainTimestamp: timestampRange },
          {
            chainTimestamp: { $exists: false },
            confirmedAt: timestampRange,
          },
          {
            chainTimestamp: { $exists: false },
            confirmedAt: { $exists: false },
            createdAt: timestampRange,
          },
        ],
      });
    }
    if (query.search) {
      const safeSearch = escapeRegex(String(query.search).trim());
      andClauses.push({
        $or: [
          { fromAddress: { $regex: safeSearch, $options: "i" } },
          { toAddress: { $regex: safeSearch, $options: "i" } },
          { txHash: { $regex: safeSearch, $options: "i" } },
        ],
      });
    }
    if (andClauses.length) {
      filter.$and = andClauses;
    }

    // Clamp limit to guard against unbounded payload fetches.
    const MAX_PAGE_LIMIT = 100;
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(query.limit, 10) || 20, 1),
      MAX_PAGE_LIMIT,
    );
    const skip = (page - 1) * limit;
    const scopedFilter = withRuntimeChainNetworkFilter(filter);

    // Skip the count query when deep-paging (skip > 500) to avoid
    // a full collection scan. Return a sentinel (-1) so the frontend
    // can detect "more pages may exist" without relying on an exact total.
    // This threshold is intentionally conservative so the first several pages
    // always receive an accurate total for UI pagination controls.
    const COUNT_SCAN_SKIP_THRESHOLD = 500;
    const shouldCount = skip <= COUNT_SCAN_SKIP_THRESHOLD;

    let [items, total] = await Promise.all([
      Transaction.find(scopedFilter)
        .sort({ chainTimestamp: -1, confirmedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      shouldCount
        ? Transaction.countDocuments(scopedFilter)
        : Promise.resolve(-1),
    ]);

    const pendingSwapIds = Array.from(
      new Set(
        items
          .map((item) => item?.metadata?.swap)
          .filter(
            (swap) =>
              swap &&
              typeof swap === "object" &&
              swap.role === "source_transfer" &&
              swap.swapId &&
              !["completed", "failed", "payout_failed", "manual_review", "expired"].includes(
                String(swap.status || "").trim().toLowerCase(),
              ),
          )
          .map((swap) => String(swap.swapId).trim())
          .filter(Boolean),
      ),
    );

    if (pendingSwapIds.length) {
      try {
        const swapService = require("../swap/service");
        await Promise.allSettled(
          pendingSwapIds.map((swapId) => swapService.getSwapById(query.userId, swapId)),
        );

        const itemIds = items.map((item) => item?._id).filter(Boolean);
        if (itemIds.length) {
          items = await Transaction.find({
            ...scopedFilter,
            _id: { $in: itemIds },
          })
            .sort({ chainTimestamp: -1, confirmedAt: -1, createdAt: -1 })
            .lean();
        }
      } catch (error) {
        logger.warn("Failed to refresh pending swaps during transaction list load", {
          userId: String(query.userId || ""),
          walletId: String(scope.walletId || ""),
          swapIds: pendingSwapIds,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalPages = total >= 0 ? Math.ceil(total / limit) : null;

    // Detect and group old swap transactions
    const processedItems = await detectAndGroupSwapTransactions(query.userId, items);

    return {
      data: processedItems.map((item) => buildSafeTransaction(item)),
      meta: { page, limit, total, totalPages },
    };
  }

  async assertSufficientBalance(
    userId,
    walletId,
    amountBaseUnits,
    feeBaseUnits,
    options = {},
  ) {
    const balance = await balanceService.getWalletBalance(userId, walletId, {
      requestId: options.requestId,
      force: true,
      trigger: "balance_validation",
    });
    const context = this.getContext(balance.chain);
    const assetDescriptor =
      options.assetDescriptor ||
      buildNativeAssetDescriptor(balance.chain, balance.network);
    const transferBalanceBaseUnits = this.getAssetBalanceBaseUnits(
      balance,
      assetDescriptor,
    );
    const transferRequiredBaseUnits =
      assetDescriptor.assetType === "token"
        ? String(amountBaseUnits)
        : addBaseUnits(amountBaseUnits, feeBaseUnits);

    if (!isBaseUnitsGte(transferBalanceBaseUnits, transferRequiredBaseUnits)) {
      throw AppError.validation("Insufficient balance");
    }

    if (
      assetDescriptor.assetType === "token" &&
      !isBaseUnitsGte(
        this.getAvailableBalanceBaseUnits(context, balance),
        feeBaseUnits,
      )
    ) {
      throw AppError.validation(
        "Insufficient TRX balance to cover the network fee",
      );
    }
  }
  async backfillLegacyTransactionTruthFlags() {
    logger.info("Starting backfill of legacy transaction truth flags");

    const legacyValidatedSuccessFilter = {
      status: "success",
      transactionType: "external",
      $or: [
        { validated: { $exists: false } },
        { validated: false },
        { succeeded: { $exists: false } },
        { succeeded: false },
      ],
      // Only backfill rows that have concrete settlement evidence.
      // This avoids treating internal/manual/loosely-synced "success" rows
      // as on-chain validated without a finality signal.
      $and: [
        {
          $or: [
            { confirmations: { $gt: 0 } },
            { ledgerIndex: { $exists: true, $ne: null } },
            { confirmedAt: { $exists: true, $ne: null } },
            { chainTimestamp: { $exists: true, $ne: null } },
          ],
        },
        {
          $or: [
            { txHash: { $exists: true, $nin: [null, ""] } },
            {
              chainStatus: {
                $in: ["confirmed", "completed", "success", "succeeded"],
              },
            },
          ],
        },
      ],
    };

    const result = await Transaction.updateMany(legacyValidatedSuccessFilter, {
      $set: {
        validated: true,
        succeeded: true,
      },
    });

    logger.info("Completed backfill of legacy transaction truth flags", {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });

    return {
      matched: result.matchedCount,
      modified: result.modifiedCount,
    };
  }
}

module.exports = new TransactionService();
