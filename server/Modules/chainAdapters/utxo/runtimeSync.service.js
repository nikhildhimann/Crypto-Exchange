const Wallet = require("../../wallet/model");
const Transaction = require("../../transaction/model");
const logger = require("../../../common/utils/logger");
const {
  buildWalletVisibilityFilter,
} = require("../../../common/utils/walletState");
const { normalizeTxHash } = require("../../../common/utils/txHash");
const {
  reconcilePendingTransactionsForWallet,
} = require("./pendingReconciliation.service");

const walletSyncLocks = new Map();
const MIN_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const DEEP_SCAN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_GAP_LIMIT = 20;

function getWalletSyncLockKey(walletId) {
  return `utxo_wallet_${String(walletId || "").trim()}`;
}

async function withWalletSyncLock(walletId, callback) {
  const lockKey = getWalletSyncLockKey(walletId);
  if (walletSyncLocks.has(lockKey)) {
    return {
      status: "skipped",
      reason: "already_running",
      walletId: String(walletId || ""),
    };
  }

  walletSyncLocks.set(lockKey, true);
  try {
    return await callback();
  } finally {
    walletSyncLocks.delete(lockKey);
  }
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shouldThrottleSync(wallet = {}, options = {}) {
  if (options.force === true || options.forceSync === true) {
    return false;
  }

  const lastSyncAt = parseDate(wallet?.metadata?.utxoRuntime?.lastFullSyncAt);
  if (!lastSyncAt) {
    return false;
  }

  return Date.now() - lastSyncAt.getTime() < MIN_SYNC_INTERVAL_MS;
}

function shouldThrottleDeepScan(wallet = {}, options = {}) {
  if (options.forceDiscovery === true || options.forceDeepScan === true) {
    return false;
  }

  const lastDeepScanAt = parseDate(
    wallet?.metadata?.utxoRuntime?.lastDeepScanAt,
  );
  if (!lastDeepScanAt) {
    return false;
  }

  return Date.now() - lastDeepScanAt.getTime() < DEEP_SCAN_COOLDOWN_MS;
}

function isPositiveBaseUnits(value) {
  try {
    return BigInt(String(value || "0")) > 0n;
  } catch (_error) {
    return false;
  }
}

async function findUnknownManagedAddressActivity(
  wallet,
  addressSet,
  validateAddress,
) {
  const transactions = await Transaction.find({
    walletId: wallet._id,
    chain: wallet.chain,
    network: wallet.network,
    transactionType: "external",
    type: "transfer",
    status: { $in: ["pending", "success", "failed"] },
  })
    .select("direction fromAddress toAddress")
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(100)
    .lean();

  for (const transaction of transactions) {
    const direction = String(transaction.direction || "")
      .trim()
      .toLowerCase();
    const candidateAddress =
      direction === "outgoing"
        ? String(transaction.fromAddress || "").trim()
        : String(transaction.toAddress || "").trim();
    const normalized = candidateAddress.toLowerCase();

    if (!candidateAddress || addressSet.has(normalized)) {
      continue;
    }

    if (
      typeof validateAddress === "function" &&
      !validateAddress(candidateAddress, wallet.network)
    ) {
      continue;
    }

    return candidateAddress;
  }

  return "";
}

async function buildAutoHealAssessment(wallet, runtimeContext, balance) {
  const addressSet =
    runtimeContext?.addressSet instanceof Set
      ? runtimeContext.addressSet
      : new Set();

  // Lazy require to avoid circular dependency with registry
  const { getChainContext } = require("../../../common/utils/chain");

  const validateAddress =
    wallet?.chain === "ada"
      ? getChainContext(wallet.chain).adapter.transaction.validateAddress
      : null;

  const unknownManagedAddress = await findUnknownManagedAddressActivity(
    wallet,
    addressSet,
    validateAddress,
  );
  const hasPriorPositiveBalance = isPositiveBaseUnits(
    wallet?.metadata?.balance?.lastKnownAvailableBaseUnits ||
      wallet?.metadata?.balance?.lastKnownBaseUnits ||
      "0",
  );
  const zeroCurrentBalance = !isPositiveBaseUnits(
    balance?.metadata?.availableBaseUnits ||
      balance?.metadata?.onChainBaseUnits ||
      "0",
  );
  const isImportedAdaWallet =
    String(wallet?.chain || "")
      .trim()
      .toLowerCase() === "ada" && wallet?.isImported === true;
  const hasNoChainActivity = balance?.exists === false && zeroCurrentBalance;
  const transactionCount = await Transaction.countDocuments({
    walletId: wallet._id,
    chain: wallet.chain,
    network: wallet.network,
    transactionType: "external",
    type: "transfer",
  });

  return {
    transactionCount,
    unknownManagedAddress,
    shouldDeepScan:
      Boolean(unknownManagedAddress) ||
      (transactionCount > 0 && zeroCurrentBalance) ||
      (hasPriorPositiveBalance && zeroCurrentBalance) ||
      (isImportedAdaWallet && hasNoChainActivity),
    reasons: [
      ...(unknownManagedAddress ? ["unknown_managed_address_activity"] : []),
      ...(transactionCount > 0 && zeroCurrentBalance
        ? ["history_with_zero_balance"]
        : []),
      ...(hasPriorPositiveBalance && zeroCurrentBalance
        ? ["previous_positive_balance_now_zero"]
        : []),
      ...(isImportedAdaWallet && hasNoChainActivity
        ? ["imported_wallet_empty_onchain"]
        : []),
    ],
  };
}

async function writeRuntimeSyncMetadata(walletId, patch = {}) {
  const setFields = Object.entries(patch).reduce(
    (accumulator, [key, value]) => {
      accumulator[`metadata.utxoRuntime.${key}`] = value;
      return accumulator;
    },
    {},
  );

  if (!Object.keys(setFields).length) {
    return;
  }

  await Wallet.updateOne(
    { _id: walletId },
    {
      $set: setFields,
    },
  );
}

async function syncUtxoWallet(walletId, options = {}) {
  return withWalletSyncLock(walletId, async () => {
    const wallet = await Wallet.findOne({
      _id: walletId,
      ...buildWalletVisibilityFilter({ includeHidden: true }),
    })
      .select("_id userId accountId chain network address isImported metadata")
      .lean();
    if (!wallet) {
      return {
        status: "skipped",
        reason: "wallet_not_found",
        walletId: String(walletId || ""),
      };
    }

    if (shouldThrottleSync(wallet, options)) {
      return {
        status: "skipped",
        reason: "recently_synced",
        walletId: String(wallet._id),
      };
    }

    // Lazy require to avoid circular dependency with registry
    const { getChainContext } = require("../../../common/utils/chain");
    const context = getChainContext(wallet.chain);

    const runtimeInitializer =
      context?.adapter?.transaction?.ensureRuntimeWalletContext;
    if (typeof runtimeInitializer !== "function") {
      return {
        status: "skipped",
        reason: "adapter_runtime_sync_unsupported",
        walletId: String(wallet._id),
        chain: wallet.chain,
      };
    }

    const transactionService = require("../../transaction/service");
    const balanceService = require("../../balance/service");
    const startedAt = new Date();
    try {
      logger.debug("Starting UTXO wallet runtime sync", {
        event: "utxo_wallet_sync_started",
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        trigger: options.trigger || "manual",
        reason: options.reason || null,
      });

      let runtimeContext = await runtimeInitializer({
        wallet,
        walletRecord: wallet,
        network: wallet.network,
        address: wallet.address,
        fromAddress: wallet.address,
        mnemonic: options.mnemonic || "",
        persistChangeAddress: true,
      });
      if (
        wallet.chain === "ada" &&
        typeof context?.adapter?.transaction
          ?.discoverManagedAddressesByGapLimit === "function" &&
        (options.forceDiscovery === true || wallet.isImported === true)
      ) {
        await context.adapter.transaction.discoverManagedAddressesByGapLimit({
          wallet,
          walletRecord: wallet,
          network: wallet.network,
          address: wallet.address,
          fromAddress: wallet.address,
          gapLimit: Math.max(Number(options.gapLimit) || DEFAULT_GAP_LIMIT, 1),
          maxReceiveScanCount: 128,
          maxChangeScanCount: 64,
        });

        runtimeContext = await runtimeInitializer({
          wallet,
          walletRecord: wallet,
          network: wallet.network,
          address: wallet.address,
          fromAddress: wallet.address,
          mnemonic: options.mnemonic || "",
          persistChangeAddress: true,
        });
      }
      const historySync = await transactionService.syncWalletTransactions(
        String(wallet.userId),
        String(wallet._id),
        {
          force: true,
          trigger: options.trigger || "utxo_runtime_sync",
        },
      );
      const pendingReconciliation = await reconcilePendingTransactionsForWallet(
        {
          walletId: String(wallet._id),
          chain: wallet.chain,
          network: wallet.network,
          logger,
          logContext: {
            source: "syncUtxoWallet",
          },
        },
      );
      let balance = await balanceService.getWalletBalance(
        String(wallet.userId),
        String(wallet._id),
        {
          requestId: options.requestId,
          force: true,
          trigger: options.trigger || "utxo_runtime_sync",
        },
      );

      const autoHealAssessment = await buildAutoHealAssessment(
        wallet,
        runtimeContext,
        balance,
      );
      let deepDiscovery = {
        executed: false,
        gapLimit: Math.max(Number(options.gapLimit) || DEFAULT_GAP_LIMIT, 1),
        reasons: autoHealAssessment.reasons,
        branchSummaries: [],
        discoveredCount: 0,
      };

      if (
        (options.forceDiscovery === true ||
          autoHealAssessment.shouldDeepScan) &&
        !shouldThrottleDeepScan(wallet, options) &&
        typeof context?.adapter?.transaction
          ?.discoverManagedAddressesByGapLimit === "function"
      ) {
        const discovery =
          await context.adapter.transaction.discoverManagedAddressesByGapLimit({
            wallet,
            walletRecord: wallet,
            network: wallet.network,
            address: wallet.address,
            fromAddress: wallet.address,
            gapLimit: Math.max(
              Number(options.gapLimit) || DEFAULT_GAP_LIMIT,
              1,
            ),
          });

        deepDiscovery = {
          executed: true,
          gapLimit: discovery.gapLimit,
          reasons: autoHealAssessment.reasons,
          branchSummaries: discovery.branchSummaries || [],
          discoveredCount: Array.isArray(discovery.discoveredManagedAddresses)
            ? discovery.discoveredManagedAddresses.length
            : 0,
        };

        logger.info("Expanded ADA wallet index via gap-limit discovery", {
          event: "utxo_gap_discovery_executed",
          walletId: String(wallet._id),
          chain: wallet.chain,
          network: wallet.network,
          gapLimit: discovery.gapLimit,
          reasons: autoHealAssessment.reasons,
          branchSummaries: discovery.branchSummaries || [],
        });

        await transactionService.syncWalletTransactions(
          String(wallet.userId),
          String(wallet._id),
          {
            force: true,
            trigger: `${String(options.trigger || "utxo_runtime_sync")}:post_discovery`,
          },
        );
        await reconcilePendingTransactionsForWallet({
          walletId: String(wallet._id),
          chain: wallet.chain,
          network: wallet.network,
          logger,
          logContext: {
            source: "syncUtxoWallet:postDiscovery",
          },
        });
        balance = await balanceService.getWalletBalance(
          String(wallet.userId),
          String(wallet._id),
          {
            requestId: options.requestId,
            force: true,
            trigger: `${String(options.trigger || "utxo_runtime_sync")}:post_discovery`,
          },
        );
      }

      const finishedAt = new Date();
      await writeRuntimeSyncMetadata(wallet._id, {
        lastFullSyncAt: finishedAt,
        lastTrigger: String(options.trigger || "manual"),
        lastReason: String(options.reason || "").trim() || null,
        lastHistoryScanCount: Number(historySync?.scanned || 0),
        lastHistoryCreatedCount: Number(historySync?.created || 0),
        lastHistoryUpdatedCount: Number(historySync?.updated || 0),
        lastPendingReconciliationAt: finishedAt,
        lastPendingSupersededCount: pendingReconciliation.superseded,
        lastPendingNormalizedCount: pendingReconciliation.normalizedTxHashes,
        lastKnownManagedAddressCount: Array.isArray(
          runtimeContext?.managedAddresses,
        )
          ? runtimeContext.managedAddresses.length
          : 0,
        lastAutoHealReasons: autoHealAssessment.reasons,
        lastDeepScanAt: deepDiscovery.executed
          ? finishedAt
          : wallet?.metadata?.utxoRuntime?.lastDeepScanAt || null,
        lastDeepScanGapLimit: deepDiscovery.executed
          ? deepDiscovery.gapLimit
          : wallet?.metadata?.utxoRuntime?.lastDeepScanGapLimit || null,
        lastDeepScanDiscoveredCount: deepDiscovery.executed
          ? deepDiscovery.discoveredCount
          : wallet?.metadata?.utxoRuntime?.lastDeepScanDiscoveredCount || 0,
        lastBalanceRefreshAt: finishedAt,
        lastSyncStatus: "completed",
        lastSyncDurationMs: finishedAt.getTime() - startedAt.getTime(),
        lastSyncError: null,
      });

      const completionLogPayload = {
        event: "utxo_wallet_sync_completed",
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        history: historySync,
        pendingReconciliation,
        deepDiscovery,
        autoHealReasons: autoHealAssessment.reasons,
      };
      if (
        deepDiscovery.executed ||
        pendingReconciliation.superseded > 0 ||
        pendingReconciliation.normalizedTxHashes > 0 ||
        Number(historySync?.created || 0) > 0 ||
        Number(historySync?.updated || 0) > 0 ||
        autoHealAssessment.reasons.length
      ) {
        logger.info("Completed UTXO wallet runtime sync", completionLogPayload);
      } else {
        logger.debug(
          "Completed UTXO wallet runtime sync",
          completionLogPayload,
        );
      }

      return {
        status: "completed",
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        history: historySync,
        pendingReconciliation,
        deepDiscovery,
        autoHealReasons: autoHealAssessment.reasons,
        balanceBaseUnits:
          balance?.metadata?.availableBaseUnits ||
          balance?.metadata?.onChainBaseUnits ||
          "0",
      };
    } catch (error) {
      const failedAt = new Date();
      await writeRuntimeSyncMetadata(wallet._id, {
        lastSyncStatus: "failed",
        lastSyncError: error instanceof Error ? error.message : String(error),
        lastSyncFailedAt: failedAt,
        lastSyncDurationMs: failedAt.getTime() - startedAt.getTime(),
      });

      logger.error("UTXO wallet runtime sync failed", {
        event: "utxo_wallet_sync_failed",
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "failed",
        walletId: String(wallet._id),
        chain: wallet.chain,
        network: wallet.network,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

module.exports = {
  syncUtxoWallet,
};
