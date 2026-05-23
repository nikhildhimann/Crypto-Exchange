const mongoose = require("mongoose");

const Wallet = require("../wallet/model");
const Transaction = require("../transaction/model");
const LedgerEntry = require("../transaction/ledgerEntry.model");
const BalanceSnapshot = require("./snapshot.model");
const PortfolioSnapshot = require("./portfolioSnapshot.model");
const { AppError } = require("../../helpers/errors");
const {
  assertSupportedChainNetwork,
  withRuntimeChainNetworkFilter,
} = require("../../common/utils/chain");
const {
  formatAssetBalanceFromBase,
  resolveSupportedAsset,
} = require("../../common/utils/assets");
const {
  buildAddressExplorerUrl,
  buildExplorerMetadata,
} = require("../../common/utils/explorer");
const logger = require("../../common/utils/logger");
const stats = require("../../common/utils/stats");
const marketService = require("../market/service");
const { subtractBaseUnits } = require("../../common/utils/amount");
const operationsConfig = require("../../config/operations");

let balanceSnapshotIndexesReadyPromise = null;
const BASE_UNIT_INTEGER_PATTERN = /^-?\d+$/;
const BALANCE_SYNC_COOLDOWN_MS = operationsConfig.sync.balanceCooldownMs;
const BALANCE_LIST_CACHE_TTL_MS = operationsConfig.sync.balanceListCacheTtlMs;
const BALANCE_LIST_CONCURRENCY = operationsConfig.concurrency.balanceListLimit;
const PORTFOLIO_SNAPSHOT_TTL_MS = operationsConfig.sync.portfolioSnapshotTtlMs;
const INTERNAL_DELTA_SUMMARY_VERSION = 1;
const balanceSyncInFlight = new Map();
const balanceListCache = new Map();

function normalizeTimestampValue(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function isWalletPendingRecovery(wallet = {}) {
  return (
    String(wallet?.metadata?.provisioning?.status || "").trim().toLowerCase() ===
      "pending_recovery" ||
    wallet?.metadata?.provisioning?.recoveryPending === true ||
    wallet?.metadata?.provisioning?.discoveryPending === true
  );
}

function isForcedBalanceSync(options = {}) {
  return (
    options.force === true ||
    options.forceSync === true ||
    options.forceRefresh === true
  );
}

function getBalanceSyncKey(userId, walletId) {
  return `${String(userId || "").trim()}:${String(walletId || "").trim()}`;
}

function getBalanceListCacheKey(userId) {
  return String(userId || "").trim();
}

function buildBalanceListWalletSignature(wallets = []) {
  return (Array.isArray(wallets) ? wallets : [])
    .map((wallet) => [
      String(wallet?._id || "").trim(),
      normalizeTimestampValue(wallet?.updatedAt)?.toISOString() || "",
      normalizeTimestampValue(wallet?.metadata?.balance?.lastSyncedAt)?.toISOString() || "",
      normalizeTimestampValue(wallet?.metadata?.lastBalanceSyncAt)?.toISOString() || "",
    ].join(":"))
    .join("|");
}

function getCachedBalanceList(userId, walletSignature = "") {
  const cacheKey = getBalanceListCacheKey(userId);
  if (!cacheKey) {
    return null;
  }

  const cached = balanceListCache.get(cacheKey);
  if (!cached) {
    stats.trackCache("balance_list", false);
    return null;
  }

  const ageMs = Date.now() - cached.timestamp;
  if (ageMs > BALANCE_LIST_CACHE_TTL_MS) {
    balanceListCache.delete(cacheKey);
    stats.trackCache("balance_list", false);
    return null;
  }

  if (cached.walletSignature !== String(walletSignature || "")) {
    balanceListCache.delete(cacheKey);
    stats.trackCache("balance_list", false);
    return null;
  }

  stats.trackCache("balance_list", true);
  return cached;
}

function setCachedBalanceList(userId, response, walletSignature = "", summary = null) {
  const cacheKey = getBalanceListCacheKey(userId);
  if (!cacheKey || !Array.isArray(response)) {
    return;
  }

  balanceListCache.set(cacheKey, {
    response,
    summary,
    walletSignature: String(walletSignature || ""),
    timestamp: Date.now(),
  });
}

function invalidateBalanceListCache(userId) {
  const cacheKey = getBalanceListCacheKey(userId);
  if (!cacheKey) {
    return;
  }

  balanceListCache.delete(cacheKey);
}

async function withBalanceSyncDedup(userId, walletId, callback) {
  const key = getBalanceSyncKey(userId, walletId);
  const inFlight = balanceSyncInFlight.get(key);

  if (inFlight) {
    return inFlight;
  }

  const request = Promise.resolve()
    .then(callback)
    .finally(() => {
      balanceSyncInFlight.delete(key);
    });

  balanceSyncInFlight.set(key, request);
  return request;
}

async function mapSettledWithConcurrency(items = [], limit, mapper) {
  const targetItems = Array.isArray(items) ? items : [];
  if (!targetItems.length) {
    return [];
  }

  const concurrency = Math.max(Number(limit) || 1, 1);
  const results = new Array(targetItems.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < targetItems.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await mapper(targetItems[currentIndex], currentIndex),
        };
      } catch (reason) {
        results[currentIndex] = {
          status: "rejected",
          reason,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targetItems.length) }, () => worker()),
  );

  return results;
}

function hasCachedWalletBalance(wallet = {}) {
  return Boolean(
    normalizeTimestampValue(wallet?.metadata?.balance?.lastSyncedAt) &&
      wallet?.metadata?.balance &&
      typeof wallet.metadata.balance === "object",
  );
}

function shouldPreferLiveBalanceRead(wallet = {}) {
  const chain = String(wallet?.chain || "").trim().toLowerCase();
  return chain === "hbar" || chain === "aptos" || chain === "xtz";
}

function shouldUsePersistedBalanceRead(wallet = {}, options = {}) {
  if (
    isForcedBalanceSync(options) ||
    options.preferPersisted === false ||
    options.liveRead === true
  ) {
    return false;
  }

  // Hedera, Aptos, and Tezos balances can change after external funding or
  // history-sync events that do not pass through local wallet metadata first,
  // so persisted wallet metadata is too stale to be the default source of truth.
  if (shouldPreferLiveBalanceRead(wallet)) {
    return false;
  }

  // Only serve from cache if data exists AND is still within the freshness
  // window. Stale cache must fall through to a live chain fetch.
  if (!hasCachedWalletBalance(wallet)) {
    return false;
  }

  const lastSyncedAt = normalizeTimestampValue(wallet?.metadata?.balance?.lastSyncedAt);
  if (!lastSyncedAt) {
    return false;
  }

  return Date.now() - lastSyncedAt.getTime() < BALANCE_SYNC_COOLDOWN_MS;
}

function shouldSkipRecentBalanceSync(wallet = {}, options = {}) {
  if (isForcedBalanceSync(options) || isWalletPendingRecovery(wallet)) {
    return false;
  }

  const lastSyncedAt = normalizeTimestampValue(wallet?.metadata?.balance?.lastSyncedAt);
  if (!lastSyncedAt || !hasCachedWalletBalance(wallet)) {
    return false;
  }

  return Date.now() - lastSyncedAt.getTime() < BALANCE_SYNC_COOLDOWN_MS;
}

function formatCachedTokenBalanceEntry(entry = {}, context, wallet) {
  let assetDescriptor = null;

  try {
    assetDescriptor = resolveSupportedAsset(
      context.chain,
      wallet.network,
      entry.asset,
    );
  } catch (_error) {
    assetDescriptor = null;
  }

  const addressExplorerUrl = buildAddressExplorerUrl(
    context.chain,
    wallet.network,
    wallet.address,
  );

  return {
    code: String(entry.code || entry.asset || "").trim().toLowerCase(),
    asset: String(entry.asset || entry.currency || "").trim().toUpperCase(),
    currency: String(entry.currency || entry.asset || "").trim().toUpperCase(),
    symbol: String(entry.asset || entry.currency || "").trim().toUpperCase(),
    label: String(entry.label || entry.asset || entry.currency || "").trim(),
    assetType: String(entry.assetType || "token").trim().toLowerCase(),
    standard: String(entry.standard || "token").trim().toLowerCase(),
    contractAddress: entry.contractAddress ? String(entry.contractAddress).trim() : null,
    decimals: Math.max(Number(entry.decimals) || 0, 0),
    baseUnitName: String(entry.baseUnitName || "base units").trim(),
    status: String(entry.status || "available").trim().toLowerCase(),
    exists: true,
    confirmed: true,
    balance: String(entry.balance ?? "0"),
    availableBalance: String(entry.availableBalance ?? entry.balance ?? "0"),
    baseUnitBalance: String(entry.baseUnitBalance ?? "0"),
    availableBaseUnits: String(entry.availableBaseUnits ?? entry.baseUnitBalance ?? "0"),
    explorerUrl: addressExplorerUrl,
    contractExplorerUrl: assetDescriptor?.contractExplorerUrl || null,
    explorer: buildExplorerMetadata(context.chain, wallet.network, {
      address: wallet.address,
    }),
  };
}

function buildCachedWalletBalance(wallet = {}, options = {}) {
  const context = assertSupportedChainNetwork(wallet.chain, wallet.network);
  const balanceMetadata =
    wallet?.metadata?.balance && typeof wallet.metadata.balance === "object"
      ? wallet.metadata.balance
      : {};
  const syncedAt =
    normalizeTimestampValue(balanceMetadata.lastSyncedAt) || new Date();
  const onChainBaseUnits = String(balanceMetadata.lastKnownBaseUnits || "0");
  const chainAvailableBaseUnits = String(
    balanceMetadata.lastKnownAvailableBaseUnits ||
      balanceMetadata.lastKnownBaseUnits ||
      "0",
  );
  const internalDeltaBaseUnits = String(
    options.internalDeltaBaseUnitsOverride ??
      balanceMetadata.legacyInternalDeltaBaseUnits ??
      "0",
  );
  const balances = formatBalanceSummary(
    context,
    onChainBaseUnits,
    chainAvailableBaseUnits,
    internalDeltaBaseUnits,
    {
      requestId: options.requestId,
      walletId: String(wallet._id),
      pendingOutgoingBaseUnits: options.pendingOutgoingBaseUnits,
    },
  );
  const tokenBalances = Array.isArray(balanceMetadata.tokenBalances)
    ? balanceMetadata.tokenBalances.map((entry) =>
        formatCachedTokenBalanceEntry(entry, context, wallet),
      )
    : [];

  return {
    walletId: String(wallet._id),
    chain: context.chain,
    address: wallet.address,
    network: wallet.network,
    exists: balanceMetadata.exists !== false,
    confirmed: balanceMetadata.confirmed !== false,
    onChainBalance: balances.onChainBalance,
    internalBalanceDelta: balances.internalBalanceDelta,
    availableBalance: balances.availableBalance,
    balance: balances.availableBalance,
    currency: context.assetSymbol,
    asset: context.assetSymbol,
    tokenBalances,
    asOf: syncedAt.toISOString(),
    source: "cached_recent",
    metadata: {
      baseUnitName: context.baseUnitName,
      decimals: context.decimals,
      onChainBaseUnits: balances.onChainBaseUnits,
      chainAvailableBaseUnits: balances.chainAvailableBaseUnits,
      internalDeltaBaseUnits: balances.internalDeltaBaseUnits,
      legacyInternalDeltaBaseUnits: balances.internalDeltaBaseUnits,
      availableBaseUnits: balances.availableBaseUnits,
      minimumReserveBaseUnits: "0",
      cached: true,
      lastSyncedAt: syncedAt.toISOString(),
      freshnessWindowMs: BALANCE_SYNC_COOLDOWN_MS,
      syncSkipped: true,
      syncSkipReason: "recent_success",
      ...buildChainActivationMetadata(context, balanceMetadata.exists !== false),
    },
  };
}

function buildPersistedWalletBalance(wallet = {}, options = {}) {
  const cachedBalance = buildCachedWalletBalance(wallet, options);

  return {
    ...cachedBalance,
    source: "persisted_wallet",
    metadata: {
      ...(cachedBalance.metadata || {}),
      persisted: true,
      syncSkipped: false,
      syncSkipReason: null,
    },
  };
}

function buildChainActivationMetadata(context, exists) {
  if (String(context?.chain || "").trim().toLowerCase() !== "xrp") {
    return {};
  }

  const onChainExists = Boolean(exists);

  return {
    onChainAccount: {
      exists: onChainExists,
      activationStatus: onChainExists ? "active" : "pending_activation",
      needsFunding: !onChainExists,
    },
  };
}

function getInternalDeltaSummary(wallet = {}) {
  const summary =
    wallet?.metadata?.balance?.internalDeltaSummary &&
    typeof wallet.metadata.balance.internalDeltaSummary === "object"
      ? wallet.metadata.balance.internalDeltaSummary
      : null;

  if (!summary) {
    return null;
  }

  const deltaBaseUnits = String(summary.deltaBaseUnits ?? "").trim();
  if (!BASE_UNIT_INTEGER_PATTERN.test(deltaBaseUnits || "")) {
    return null;
  }

  return {
    deltaBaseUnits,
    stale: summary.stale === true,
    version: Number(summary.version || 0) || 0,
    entryCount: Math.max(Number(summary.entryCount || 0) || 0, 0),
    lastEntryId: summary.lastEntryId ? String(summary.lastEntryId).trim() : null,
    lastEntryAt: normalizeTimestampValue(summary.lastEntryAt),
    computedAt: normalizeTimestampValue(summary.computedAt),
    lastInvalidatedAt: normalizeTimestampValue(summary.lastInvalidatedAt),
    lastInvalidateReason: summary.lastInvalidateReason
      ? String(summary.lastInvalidateReason).trim()
      : null,
  };
}

function hasReusableInternalDeltaSummary(wallet = {}) {
  const summary = getInternalDeltaSummary(wallet);
  if (!summary) {
    return false;
  }

  return summary.stale !== true && summary.version === INTERNAL_DELTA_SUMMARY_VERSION;
}

async function recomputeInternalBalanceDeltaSummary(walletId, options = {}) {
  const objectId = new mongoose.Types.ObjectId(walletId);
  const cursor = LedgerEntry.find({ walletId: objectId })
    .select("_id transactionId direction amountBaseUnits amountDrops amount asset createdAt")
    .lean()
    .cursor();

  let totalCredits = 0n;
  let totalDebits = 0n;
  let entryCount = 0;
  let lastEntryId = null;
  let lastEntryAt = null;
  const malformedEntries = [];

  for await (const entry of cursor) {
    entryCount += 1;

    const entryCreatedAt = normalizeTimestampValue(entry?.createdAt);
    if (entryCreatedAt && (!lastEntryAt || entryCreatedAt > lastEntryAt)) {
      lastEntryAt = entryCreatedAt;
      lastEntryId = entry?._id ? String(entry._id) : lastEntryId;
    }

    const rawValue =
      entry.amountBaseUnits ??
      entry.amountDrops ??
      null;

    if (rawValue === null) {
      malformedEntries.push({
        entryId: String(entry._id),
        transactionId: entry.transactionId ? String(entry.transactionId) : null,
        reason: "missing_base_units",
      });
      continue;
    }

    const normalized = String(rawValue).trim();
    if (!BASE_UNIT_INTEGER_PATTERN.test(normalized)) {
      malformedEntries.push({
        entryId: String(entry._id),
        transactionId: entry.transactionId ? String(entry.transactionId) : null,
        reason: "invalid_base_units",
        value: normalized,
      });
      continue;
    }

    if (entry.direction === "credit") {
      totalCredits += BigInt(normalized);
      continue;
    }

    if (entry.direction === "debit") {
      totalDebits += BigInt(normalized);
    }
  }

  if (malformedEntries.length) {
    logger.warn("Ignored malformed ledger entries while computing internal balance delta", {
      walletId,
      invalidEntryCount: malformedEntries.length,
      entries: malformedEntries.slice(0, 20),
    });
  }

  const deltaBaseUnits = (totalCredits - totalDebits).toString();
  const computedAt = new Date();

  await Wallet.updateOne(
    { _id: walletId },
    {
      $set: {
        "metadata.balance.legacyInternalDeltaBaseUnits": deltaBaseUnits,
        "metadata.balance.internalDeltaSummary.version": INTERNAL_DELTA_SUMMARY_VERSION,
        "metadata.balance.internalDeltaSummary.deltaBaseUnits": deltaBaseUnits,
        "metadata.balance.internalDeltaSummary.entryCount": entryCount,
        "metadata.balance.internalDeltaSummary.lastEntryId": lastEntryId,
        "metadata.balance.internalDeltaSummary.lastEntryAt": lastEntryAt,
        "metadata.balance.internalDeltaSummary.computedAt": computedAt,
        "metadata.balance.internalDeltaSummary.stale": false,
        "metadata.balance.internalDeltaSummary.lastInvalidateReason": null,
        "metadata.balance.internalDeltaSummary.lastInvalidatedAt": null,
      },
    },
  );

  if (options.userId) {
    invalidateBalanceReadState(options.userId, {
      clearPortfolioSnapshot: true,
    }).catch(() => null);
  }

  logger.debug("Recomputed internal balance delta summary", {
    event: "internal_delta_summary_recomputed",
    walletId: String(walletId),
    userId: options.userId ? String(options.userId) : null,
    entryCount,
    deltaBaseUnits,
    trigger: options.trigger || "balance_read",
  });

  return deltaBaseUnits;
}

async function resolveInternalBalanceDeltaBaseUnits(walletOrWalletId, options = {}) {
  const wallet =
    walletOrWalletId && typeof walletOrWalletId === "object" && !Array.isArray(walletOrWalletId)
      ? walletOrWalletId
      : null;
  const walletId = wallet ? String(wallet._id || wallet.walletId || "").trim() : String(walletOrWalletId || "").trim();

  if (!walletId) {
    return "0";
  }

  if (wallet && hasReusableInternalDeltaSummary(wallet)) {
    const summary = getInternalDeltaSummary(wallet);

    stats.trackCache("internal_delta_summary", true);
    return summary.deltaBaseUnits;
  }

  stats.trackCache("internal_delta_summary", false);
  return recomputeInternalBalanceDeltaSummary(walletId, {
    userId: options.userId || wallet?.userId || null,
    trigger: options.trigger,
  });
}

async function resolvePendingOutgoingBaseUnits(walletId) {
  if (!walletId) return "0";

  const pendingTransactions = await Transaction.find({
    walletId,
    direction: "outgoing",
    status: "pending",
    transactionType: "external",
  }).lean();

  return pendingTransactions
    .reduce((total, tx) => {
      const amount = tx.totalDebitBaseUnits || tx.amountBaseUnits || "0";
      return total + BigInt(amount);
    }, 0n)
    .toString();
}

function getIsoTimestampOrNull(value) {
  const normalized = normalizeTimestampValue(value);
  return normalized ? normalized.toISOString() : null;
}

function buildPortfolioSummary(
  balances = [],
  {
    source = "computed",
    computedAt = new Date(),
    snapshotValid = false,
  } = {},
) {
  const walletIds = new Set();
  const assets = new Set();
  let totalFiatValue = 0;
  let totalUsdValue = 0;
  let latestBalanceAsOf = null;
  let latestMarketUpdatedAt = null;

  for (const balance of Array.isArray(balances) ? balances : []) {
    const walletId = String(balance?.walletId || "").trim();
    const asset = String(balance?.asset || balance?.currency || "").trim().toUpperCase();
    const fiatValue = Number(balance?.fiatValue ?? balance?.usdValue ?? 0) || 0;
    const usdValue = Number(balance?.usdValue ?? balance?.fiatValue ?? 0) || 0;
    const balanceAsOf = normalizeTimestampValue(balance?.asOf);
    const marketUpdatedAt = normalizeTimestampValue(balance?.market?.updatedAt);

    if (walletId) {
      walletIds.add(walletId);
    }

    if (asset) {
      assets.add(asset);
    }

    totalFiatValue += fiatValue;
    totalUsdValue += usdValue;

    if (balanceAsOf && (!latestBalanceAsOf || balanceAsOf > latestBalanceAsOf)) {
      latestBalanceAsOf = balanceAsOf;
    }

    if (
      marketUpdatedAt &&
      (!latestMarketUpdatedAt || marketUpdatedAt > latestMarketUpdatedAt)
    ) {
      latestMarketUpdatedAt = marketUpdatedAt;
    }
  }

  return {
    source: String(source || "computed"),
    snapshotValid: snapshotValid === true,
    walletCount: walletIds.size,
    assetCount: assets.size,
    totalFiatValue,
    totalUsdValue,
    asOf: getIsoTimestampOrNull(latestBalanceAsOf || computedAt),
    marketUpdatedAt: getIsoTimestampOrNull(latestMarketUpdatedAt),
    freshnessWindowMs: PORTFOLIO_SNAPSHOT_TTL_MS,
  };
}

function normalizePortfolioSnapshotDocument(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  return {
    ...snapshot,
    balances: Array.isArray(snapshot.balances) ? snapshot.balances : [],
    summary:
      snapshot.summary && typeof snapshot.summary === "object"
        ? snapshot.summary
        : {},
    asOf: normalizeTimestampValue(snapshot.asOf),
    createdAt: normalizeTimestampValue(snapshot.createdAt),
    updatedAt: normalizeTimestampValue(snapshot.updatedAt),
  };
}

function isReusablePortfolioSnapshot(snapshot, walletSignature = "", options = {}) {
  if (!snapshot || isForcedBalanceSync(options)) {
    return false;
  }

  if (!Array.isArray(snapshot.balances) || snapshot.balances.length === 0) {
    return false;
  }

  if (String(snapshot.walletSignature || "") !== String(walletSignature || "")) {
    return false;
  }

  const referenceTimestamp =
    normalizeTimestampValue(snapshot.updatedAt) ||
    normalizeTimestampValue(snapshot.asOf);

  if (!referenceTimestamp) {
    return false;
  }

  return Date.now() - referenceTimestamp.getTime() <= PORTFOLIO_SNAPSHOT_TTL_MS;
}

async function readReusablePortfolioSnapshot(userId, walletSignature = "", options = {}) {
  if (isForcedBalanceSync(options)) {
    return null;
  }

  const snapshot = normalizePortfolioSnapshotDocument(
    await PortfolioSnapshot.findOne({ userId }).lean(),
  );
  if (!isReusablePortfolioSnapshot(snapshot, walletSignature, options)) {
    stats.trackCache("portfolio_snapshot", false);
    return null;
  }

  const summary = buildPortfolioSummary(snapshot.balances, {
    source: "snapshot_persisted",
    computedAt: snapshot.updatedAt || snapshot.asOf || new Date(),
    snapshotValid: true,
  });

  stats.trackCache("portfolio_snapshot", true);

  logger.debug("Returning persisted portfolio snapshot", {
    event: "portfolio_snapshot_hit",
    userId: String(userId),
    walletCount: summary.walletCount,
    assetCount: summary.assetCount,
    updatedAt: getIsoTimestampOrNull(snapshot.updatedAt || snapshot.asOf),
    snapshotTtlMs: PORTFOLIO_SNAPSHOT_TTL_MS,
  });

  return {
    response: snapshot.balances,
    summary,
  };
}

async function writePortfolioSnapshot(userId, walletSignature = "", balances = [], summary = null) {
  const computedAt = new Date();
  const nextSummary =
    summary && typeof summary === "object"
      ? summary
      : buildPortfolioSummary(balances, {
          source: "computed",
          computedAt,
          snapshotValid: true,
        });

  await PortfolioSnapshot.updateOne(
    { userId },
    {
      $set: {
        userId,
        walletSignature: String(walletSignature || ""),
        balances,
        summary: nextSummary,
        asOf: computedAt,
      },
    },
    { upsert: true },
  );
}

function normalizeAdapterBalanceResponse(response, meta = {}) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw AppError.validation("Chain balance adapter returned an invalid response", {
      ...meta,
      reason: "invalid_response_object",
    });
  }

  const baseUnitBalance = ensureValidBaseUnits(response.baseUnitBalance ?? "0", {
    ...meta,
    field: "baseUnitBalance",
  });
  const availableBaseUnits = ensureValidBaseUnits(response.availableBaseUnits ?? "0", {
    ...meta,
    field: "availableBaseUnits",
  });
  const rentExemptMinimumBaseUnits = ensureValidBaseUnits(
    response.rentExemptMinimumBaseUnits ?? "0",
    {
      ...meta,
      field: "rentExemptMinimumBaseUnits",
    },
  );

  return {
    baseUnitBalance,
    availableBaseUnits,
    rentExemptMinimumBaseUnits,
    exists: Boolean(response.exists),
    confirmed: Boolean(response.confirmed),
    tokenBalances: Array.isArray(response.tokenBalances) ? response.tokenBalances : [],
    raw: response.raw && typeof response.raw === "object" ? response.raw : {},
  };
}

function normalizeAdapterTokenBalances(response, meta = {}) {
  if (!Array.isArray(response)) {
    return [];
  }

  return response.reduce((results, entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      logger.warn("Ignored invalid token balance entry from chain adapter", {
        requestId: meta.requestId || null,
        walletId: meta.walletId || null,
        chain: meta.chain || null,
        index,
      });
      return results;
    }

    const asset = String(entry.asset || entry.symbol || "").trim().toUpperCase();
    const decimals = Math.max(Number(entry.decimals) || 0, 0);

    if (!asset) {
      logger.warn("Ignored token balance entry without asset symbol", {
        requestId: meta.requestId || null,
        walletId: meta.walletId || null,
        chain: meta.chain || null,
        index,
      });
      return results;
    }

    try {
      const baseUnitBalance = ensureValidBaseUnits(entry.baseUnitBalance ?? "0", {
        ...meta,
        field: `tokenBalances.${asset}.baseUnitBalance`,
      });
      const availableBaseUnits = validateSpendableBalance(
        baseUnitBalance,
        ensureValidBaseUnits(entry.availableBaseUnits ?? baseUnitBalance, {
          ...meta,
          field: `tokenBalances.${asset}.availableBaseUnits`,
        }),
        {
          ...meta,
          field: `tokenBalances.${asset}.availableBaseUnits`,
        },
      );
      const baseUnitName = String(entry.baseUnitName || "").trim() || "base units";
      const status = String(entry.status || "available").trim().toLowerCase() || "available";

      results.push({
        code: String(entry.code || asset).trim().toLowerCase() || asset.toLowerCase(),
        asset,
        currency: String(entry.currency || asset).trim() || asset,
        symbol: String(entry.symbol || asset).trim() || asset,
        label: String(entry.label || asset).trim() || asset,
        assetType: String(entry.assetType || "token").trim().toLowerCase() || "token",
        standard: String(entry.standard || "token").trim().toLowerCase() || "token",
        contractAddress: entry.contractAddress ? String(entry.contractAddress).trim() : null,
        decimals,
        baseUnitName,
        status,
        exists: entry.exists !== false,
        confirmed: Boolean(entry.confirmed),
        baseUnitBalance,
        availableBaseUnits,
        raw: entry.raw && typeof entry.raw === "object" ? entry.raw : {},
        metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
        error: entry.error ? String(entry.error) : null,
      });
    } catch (error) {
      logger.warn("Ignored malformed token balance entry from chain adapter", {
        requestId: meta.requestId || null,
        walletId: meta.walletId || null,
        chain: meta.chain || null,
        index,
        asset,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }, []);
}

function formatTokenBalanceEntry(entry, context, input) {
  let assetDescriptor = null;

  try {
    assetDescriptor = resolveSupportedAsset(context.chain, input.network, entry.asset);
  } catch (_error) {
    assetDescriptor = null;
  }

  const balance = formatAssetBalanceFromBase(entry, entry.baseUnitBalance);
  const availableBalance = formatAssetBalanceFromBase(entry, entry.availableBaseUnits);
  const addressExplorerUrl = buildAddressExplorerUrl(context.chain, input.network, input.address);

  return {
    code: entry.code,
    asset: entry.asset,
    currency: entry.currency,
    symbol: entry.symbol,
    label: entry.label,
    assetType: entry.assetType,
    standard: entry.standard,
    contractAddress: entry.contractAddress,
    decimals: entry.decimals,
    baseUnitName: entry.baseUnitName,
    status: entry.status,
    exists: entry.exists,
    confirmed: entry.confirmed,
    balance,
    availableBalance,
    baseUnitBalance: entry.baseUnitBalance,
    availableBaseUnits: entry.availableBaseUnits,
    explorerUrl: addressExplorerUrl,
    contractExplorerUrl: assetDescriptor?.contractExplorerUrl || null,
    explorer: buildExplorerMetadata(context.chain, input.network, {
      address: input.address,
    }),
    metadata: entry.metadata,
    raw: entry.raw,
    ...(entry.error ? { error: entry.error } : {}),
  };
}

function validateSpendableBalance(baseUnitBalance, availableBaseUnits, meta = {}) {
  if (BigInt(availableBaseUnits) > BigInt(baseUnitBalance)) {
    throw AppError.validation("Chain adapter returned spendable balance above total balance", {
      ...meta,
      baseUnitBalance,
      availableBaseUnits,
    });
  }

  return availableBaseUnits;
}

function ensureValidBaseUnits(value, meta = {}) {
  const normalized = String(value ?? "").trim();

  if (BASE_UNIT_INTEGER_PATTERN.test(normalized)) {
    return normalized;
  }

  const field = meta.field || "unknown";
  const error = AppError.validation(`Invalid base unit amount for ${field}`, {
    field: meta.field || "unknown",
    value: normalized || String(value ?? ""),
    walletId: meta.walletId || null,
    transactionId: meta.transactionId || null,
    entryId: meta.entryId || null,
  });

  logger.error("Invalid base unit amount detected", {
    requestId: meta.requestId || null,
    walletId: meta.walletId || null,
    transactionId: meta.transactionId || null,
    entryId: meta.entryId || null,
    field,
    value: normalized || String(value ?? ""),
  });

  throw error;
}

function extractBalanceErrorReason(error) {
  if (error?.errors?.reason) {
    return String(error.errors.reason);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

function toDisplayBalance(context, value, meta = {}) {
  const normalized = ensureValidBaseUnits(value, meta);

  try {
    return context.adapter.amount.fromBaseUnits(normalized);
  } catch (error) {
    logger.error("Failed to format base unit balance", {
      requestId: meta.requestId || null,
      walletId: meta.walletId || null,
      transactionId: meta.transactionId || null,
      entryId: meta.entryId || null,
      chain: context.chain,
      field: meta.field || "unknown",
      value: normalized,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function formatBalanceSummary(
  context,
  onChainBaseUnits,
  chainAvailableBaseUnits,
  internalDeltaBaseUnits,
  meta = {},
) {
  const safeOnChainBaseUnits = ensureValidBaseUnits(onChainBaseUnits, {
    ...meta,
    field: "onChainBaseUnits",
  });
  const safeChainAvailableBaseUnits = validateSpendableBalance(
    safeOnChainBaseUnits,
    ensureValidBaseUnits(chainAvailableBaseUnits, {
      ...meta,
      field: "chainAvailableBaseUnits",
    }),
    meta,
  );
  const safeInternalDeltaBaseUnits = ensureValidBaseUnits(internalDeltaBaseUnits, {
    ...meta,
    field: "internalDeltaBaseUnits",
  });
  // Legacy internal-settlement deltas remain visible for reconciliation only;
  // live wallet balances now follow chain-reported spendable funds.
  const pendingOutgoingBaseUnits = meta.pendingOutgoingBaseUnits || "0";
  const adjustedAvailableBaseUnits = subtractBaseUnits(
    safeChainAvailableBaseUnits,
    pendingOutgoingBaseUnits,
  );
  const availableBaseUnits = BigInt(adjustedAvailableBaseUnits) < 0n ? "0" : adjustedAvailableBaseUnits;

  ensureValidBaseUnits(availableBaseUnits, {
    ...meta,
    field: "availableBaseUnits",
  });

  return {
    onChainBaseUnits: safeOnChainBaseUnits,
    chainAvailableBaseUnits: safeChainAvailableBaseUnits,
    internalDeltaBaseUnits: safeInternalDeltaBaseUnits,
    availableBaseUnits,
    onChainBalance: toDisplayBalance(context, safeOnChainBaseUnits, {
      ...meta,
      field: "onChainBaseUnits",
    }),
    chainAvailableBalance: toDisplayBalance(context, safeChainAvailableBaseUnits, {
      ...meta,
      field: "chainAvailableBaseUnits",
    }),
    internalBalanceDelta: toDisplayBalance(context, safeInternalDeltaBaseUnits, {
      ...meta,
      field: "internalDeltaBaseUnits",
    }),
    availableBalance: toDisplayBalance(context, availableBaseUnits, {
      ...meta,
      field: "availableBaseUnits",
    }),
  };
}

async function ensureBalanceSnapshotIndexes() {
  if (balanceSnapshotIndexesReadyPromise) {
    return balanceSnapshotIndexesReadyPromise;
  }

  balanceSnapshotIndexesReadyPromise = (async () => {
    const collection = BalanceSnapshot.collection;

    try {
      await collection.dropIndex("userId_1_chain_1_asset_1");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const codeName = error && typeof error === "object" ? error.codeName : "";

      if (
        codeName !== "IndexNotFound" &&
        !message.includes("index not found") &&
        !message.includes("ns not found") &&
        !message.includes("ns does not exist")
      ) {
        throw error;
      }
    }

    await collection.createIndex(
      { userId: 1, walletId: 1, chain: 1, network: 1, asset: 1 },
      {
        unique: true,
        name: "userId_1_walletId_1_chain_1_network_1_asset_1",
      },
    );
  })().catch((error) => {
    balanceSnapshotIndexesReadyPromise = null;
    throw error;
  });

  return balanceSnapshotIndexesReadyPromise;
}

async function getWalletBalance(userId, walletId, options = {}) {
  let wallet =
    options.walletRecord ||
    (await Wallet.findOne({ _id: walletId, userId }).lean());
  if (!wallet) {
    throw AppError.notFound("Wallet not found");
  }

  const buildFallbackBalance = (err) => {
    const balanceMetadata = wallet?.metadata?.balance || {};
    if (balanceMetadata.lastSyncedAt) {
      return {
        walletId: String(wallet._id),
        chain: wallet.chain,
        address: wallet.address,
        network: wallet.network,
        exists: balanceMetadata.exists !== false,
        confirmed: balanceMetadata.confirmed !== false,
        onChainBalance: String(balanceMetadata.lastKnownBalance || "0"),
        internalBalanceDelta: "0",
        availableBalance: String(balanceMetadata.lastKnownBalance || "0"),
        balance: String(balanceMetadata.lastKnownBalance || "0"),
        currency: wallet.chain.toUpperCase(),
        asset: wallet.chain.toUpperCase(),
        tokenBalances: Array.isArray(balanceMetadata.tokenBalances)
          ? balanceMetadata.tokenBalances.map((entry) => ({
              code: String(entry.code || entry.asset || "").toLowerCase(),
              asset: String(entry.asset || entry.symbol || "").toUpperCase(),
              currency: String(entry.currency || entry.symbol || "").toUpperCase(),
              symbol: String(entry.symbol || "").toUpperCase(),
              label: String(entry.label || entry.symbol || "").toUpperCase(),
              balance: String(entry.balance || "0"),
              availableBalance: String(entry.availableBalance || entry.balance || "0"),
              baseUnitBalance: String(entry.baseUnitBalance || "0"),
              availableBaseUnits: String(entry.availableBaseUnits || entry.baseUnitBalance || "0"),
            }))
          : [],
        asOf: new Date(balanceMetadata.lastSyncedAt).toISOString(),
        source: "fallback_offline",
        metadata: {
          cached: true,
          offlineFallback: true,
          lastSyncedAt: new Date(balanceMetadata.lastSyncedAt).toISOString(),
          error: err.message,
        },
      };
    }
    return null;
  };

  let walletContext;
  try {
    walletContext = assertSupportedChainNetwork(wallet.chain, wallet.network);
    if (walletContext.chain === "hbar") {
      const syncActivationState = walletContext.adapter?.wallet?.syncActivationState;
      if (typeof syncActivationState === "function") {
        wallet =
          (await syncActivationState(wallet, wallet.network, {
            allowProvision: false,
          }).catch(() => wallet)) || wallet;
      }
    }
  } catch (error) {
    logger.warn("Resolved runtime context failed for balance read, checking fallback options", {
      event: "wallet_balance_context_failed",
      walletId: String(wallet._id),
      chain: wallet.chain,
      error: error.message,
    });

    const fallback = buildFallbackBalance(error);
    if (fallback) {
      return options.skipMarketEnrichment === true
        ? fallback
        : enrichBalanceWithMarketData(fallback);
    }
    throw error;
  }

  const internalDeltaBaseUnits = await resolveInternalBalanceDeltaBaseUnits(wallet, {
    userId,
    trigger: options.trigger || "balance_read",
  });

  const pendingOutgoingBaseUnits = await resolvePendingOutgoingBaseUnits(walletId);

  if (shouldUsePersistedBalanceRead(wallet, options)) {
    const persistedBalance = buildPersistedWalletBalance(wallet, {
      ...options,
      internalDeltaBaseUnitsOverride: internalDeltaBaseUnits,
      pendingOutgoingBaseUnits,
    });
    const syncedAt = normalizeTimestampValue(wallet?.metadata?.balance?.lastSyncedAt);

    logger.debug("Served wallet balance from persisted metadata", {
      event: "wallet_balance_read_persisted",
      userId: String(userId),
      walletId: String(wallet._id),
      chain: wallet.chain,
      network: wallet.network,
      trigger: options.trigger || "balance_read",
      lastSyncedAt: syncedAt ? syncedAt.toISOString() : null,
    });

    return options.skipMarketEnrichment === true
      ? persistedBalance
      : enrichBalanceWithMarketData(persistedBalance);
  }

  if (shouldSkipRecentBalanceSync(wallet, options)) {
    const syncedAt = normalizeTimestampValue(wallet?.metadata?.balance?.lastSyncedAt);

    logger.debug("Skipped wallet balance sync due to freshness", {
      event: "wallet_balance_sync_skipped_fresh",
      userId: String(userId),
      walletId: String(wallet._id),
      chain: wallet.chain,
      network: wallet.network,
      trigger: options.trigger || "balance_read",
      lastSyncedAt: syncedAt ? syncedAt.toISOString() : null,
      freshnessWindowMs: BALANCE_SYNC_COOLDOWN_MS,
    });

    await Wallet.updateOne(
      { _id: wallet._id },
      {
        $set: {
          "metadata.balance.lastSkippedAt": new Date(),
          "metadata.balance.lastSkipReason": "recent_success",
        },
      },
    ).catch(() => null);

    const cachedBalance = buildCachedWalletBalance(wallet, {
      ...options,
      internalDeltaBaseUnitsOverride: internalDeltaBaseUnits,
      pendingOutgoingBaseUnits,
    });
    return options.skipMarketEnrichment === true
      ? cachedBalance
      : enrichBalanceWithMarketData(cachedBalance);
  }

  if (
    isForcedBalanceSync(options) &&
    normalizeTimestampValue(wallet?.metadata?.balance?.lastSyncedAt)
  ) {
    logger.info("Forced wallet balance sync bypassed freshness guard", {
      event: "wallet_balance_sync_forced",
      userId: String(userId),
      walletId: String(wallet._id),
      chain: wallet.chain,
      network: wallet.network,
      trigger: options.trigger || "manual_refresh",
    });
  }

  try {
    const balance = await withBalanceSyncDedup(
      String(wallet.userId),
      String(wallet._id),
      async () => {
        const startedAt = Date.now();
        const syncAttemptedAt = new Date();

        logger.debug("Starting wallet balance sync", {
          event: "wallet_balance_sync_started",
          userId: String(wallet.userId),
          walletId: String(wallet._id),
          chain: wallet.chain,
          network: wallet.network,
          trigger: options.trigger || "balance_read",
          forced: isForcedBalanceSync(options),
        });

        await Wallet.updateOne(
          { _id: wallet._id },
          {
            $set: {
              "metadata.balance.lastAttemptAt": syncAttemptedAt,
            },
          },
        ).catch(() => null);

        try {
          const liveBalance = await getAddressBalance({
            requestId: options.requestId,
            walletId: String(wallet._id),
            userId: String(wallet.userId),
            chain: wallet.chain,
            address: wallet.address,
            network: wallet.network,
            trigger: options.trigger,
            preloadedAdapterBalances: options.preloadedAdapterBalances,
          });

          await Wallet.updateOne(
            { _id: wallet._id },
            {
              $set: {
                "metadata.balance.lastSyncDurationMs": Date.now() - startedAt,
                "metadata.balance.lastSyncTrigger": String(
                  options.trigger || "balance_read",
                ),
                "metadata.balance.lastSyncError": null,
              },
              $unset: {
                "metadata.balance.lastSkippedAt": 1,
                "metadata.balance.lastSkipReason": 1,
              },
            },
          ).catch(() => null);

          logger.debug("Completed wallet balance sync", {
            event: "wallet_balance_sync_completed",
            userId: String(wallet.userId),
            walletId: String(wallet._id),
            chain: wallet.chain,
            network: wallet.network,
            trigger: options.trigger || "balance_read",
            forced: isForcedBalanceSync(options),
            durationMs: Date.now() - startedAt,
          });

          return liveBalance;
        } catch (error) {
          await Wallet.updateOne(
            { _id: wallet._id },
            {
              $set: {
                "metadata.balance.lastSyncDurationMs": Date.now() - startedAt,
                "metadata.balance.lastSyncTrigger": String(
                  options.trigger || "balance_read",
                ),
                "metadata.balance.lastSyncError":
                  error instanceof Error ? error.message : String(error),
                "metadata.balance.lastSyncFailedAt": new Date(),
              },
            },
          ).catch(() => null);

          logger.warn("Wallet balance sync failed", {
            event: "wallet_balance_sync_failed",
            userId: String(wallet.userId),
            walletId: String(wallet._id),
            chain: wallet.chain,
            network: wallet.network,
            trigger: options.trigger || "balance_read",
            forced: isForcedBalanceSync(options),
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
    );

    return options.skipMarketEnrichment === true
      ? balance
      : enrichBalanceWithMarketData(balance);
  } catch (error) {
    logger.warn("Live wallet balance sync failed, falling back to cached state", {
      event: "wallet_balance_sync_failed_fallback",
      walletId: String(wallet._id),
      chain: wallet.chain,
      error: error.message,
    });

    const fallback = buildFallbackBalance(error);
    if (fallback) {
      return options.skipMarketEnrichment === true
        ? fallback
        : enrichBalanceWithMarketData(fallback);
    }

    throw error;
  }
}

async function refreshWalletBalance(userId, walletId, options = {}) {
  return getWalletBalance(userId, walletId, {
    ...options,
    force: true,
  });
}

/**
 * Enriches a single balance with market data (additive fields only)
 */
async function enrichBalanceWithMarketData(balance) {
  if (!balance || !balance.asset) return balance;

  try {
    const marketDataMap = await marketService.getMarketData([balance.asset]);
    const market = marketDataMap[String(balance.asset).toUpperCase()] || null;

    const priceUsd = market ? market.priceUsd : 0;
    const change24h = market ? market.change24h : 0;
    const balanceValue = Number(balance.balance || 0);
    const usdValue = balanceValue * priceUsd;

    return {
      ...balance,
      priceUsd,
      usdValue,
      fiatValue: usdValue,
      change24h,
      market: market
        ? {
          priceUsd,
          change24h,
          updatedAt: market.updatedAt,
        }
        : null,
    };
  } catch (error) {
    logger.error("Failed to enrich balance with market data", { error: error.message, asset: balance.asset });
    return {
      ...balance,
      priceUsd: 0,
      usdValue: 0,
      fiatValue: 0,
      change24h: 0,
      market: null,
    };
  }
}

/**
 * Enriches multiple balances with market data (additive fields only)
 */
async function enrichBalancesWithMarketData(balances = []) {
  if (!balances.length) return [];

  try {
    const assets = Array.from(new Set(balances.map((b) => b.asset).filter(Boolean)));
    const marketDataMap = await marketService.getMarketData(assets);

    return balances.map((balance) => {
      const market = marketDataMap[String(balance.asset || "").toUpperCase()] || null;
      const priceUsd = market ? market.priceUsd : 0;
      const change24h = market ? market.change24h : 0;
      const balanceValue = Number(balance.balance || 0);
      const usdValue = balanceValue * priceUsd;

      return {
        ...balance,
        priceUsd,
        usdValue,
        fiatValue: usdValue,
        change24h,
        market: market
          ? {
            priceUsd,
            change24h,
            updatedAt: market.updatedAt,
          }
          : null,
      };
    });
  } catch (error) {
    logger.error("Failed to enrich balances with market data", { error: error.message });
    return balances.map((b) => ({
      ...b,
      priceUsd: 0,
      usdValue: 0,
      fiatValue: 0,
      change24h: 0,
      market: null,
    }));
  }
}

async function getAddressBalance(input) {
  const context = assertSupportedChainNetwork(input.chain, input.network);
  const internalDeltaBaseUnits = await resolveInternalBalanceDeltaBaseUnits(input.walletId, {
    userId: input.userId,
    trigger: input.trigger || "balance_live_sync",
  });
  await ensureBalanceSnapshotIndexes();

  try {
    const batchedCacheKey = `${input.chain}:${input.network}:${input.address}`;
    let adapterResponse = input.preloadedAdapterBalances?.get(batchedCacheKey);

    if (!adapterResponse) {
      adapterResponse = await context.adapter.balance.fetchBalance({
        network: input.network,
        address: input.address,
      });
    }

    const adapterBalance = normalizeAdapterBalanceResponse(
      adapterResponse,
      {
        requestId: input.requestId,
        walletId: input.walletId,
      },
    );
    const tokenBalances = normalizeAdapterTokenBalances(adapterBalance.tokenBalances, {
      requestId: input.requestId,
      walletId: input.walletId,
      chain: context.chain,
    }).map((entry) => formatTokenBalanceEntry(entry, context, input));
    const onChainBaseUnits = adapterBalance.baseUnitBalance;
    const minimumReserveBaseUnits = adapterBalance.rentExemptMinimumBaseUnits;
    const pendingOutgoingBaseUnits = await resolvePendingOutgoingBaseUnits(input.walletId);
    const balances = formatBalanceSummary(
      context,
      onChainBaseUnits,
      adapterBalance.availableBaseUnits,
      internalDeltaBaseUnits,
      {
        requestId: input.requestId,
        walletId: input.walletId,
        pendingOutgoingBaseUnits,
      },
    );
    const syncedAt = new Date();
    const tokenBalanceMetadata = tokenBalances.map((entry) => ({
      code: entry.code,
      asset: entry.asset,
      currency: entry.currency,
      label: entry.label,
      assetType: entry.assetType,
      standard: entry.standard,
      contractAddress: entry.contractAddress,
      explorerUrl: entry.explorerUrl,
      contractExplorerUrl: entry.contractExplorerUrl,
      balance: entry.balance,
      availableBalance: entry.availableBalance,
      baseUnitBalance: entry.baseUnitBalance,
      availableBaseUnits: entry.availableBaseUnits,
      decimals: entry.decimals,
      baseUnitName: entry.baseUnitName,
      status: entry.status,
      confirmed: entry.confirmed,
      ...(entry.error ? { error: entry.error } : {}),
    }));
    const snapshotWrites = [
      BalanceSnapshot.updateOne(
        {
          userId: input.userId,
          walletId: input.walletId,
          chain: context.chain,
          network: input.network,
          asset: context.assetSymbol,
        },
        {
          $set: {
            userId: input.userId,
            walletId: input.walletId,
            chain: context.chain,
            network: input.network,
            asset: context.assetSymbol,
            available: balances.availableBalance,
            locked: "0",
            total: balances.availableBalance,
            availableBaseUnits: balances.availableBaseUnits,
            lockedBaseUnits: "0",
            totalBaseUnits: balances.availableBaseUnits,
            decimals: context.decimals,
            baseUnitName: context.baseUnitName,
            syncedAt,
          },
        },
        { upsert: true },
      ),
      ...tokenBalances
        .filter((entry) => entry.status === "available")
        .map((entry) =>
          BalanceSnapshot.updateOne(
            {
              userId: input.userId,
              walletId: input.walletId,
              chain: context.chain,
              network: input.network,
              asset: entry.asset,
            },
            {
              $set: {
                userId: input.userId,
                walletId: input.walletId,
                chain: context.chain,
                network: input.network,
                asset: entry.asset,
                available: entry.availableBalance,
                locked: "0",
                total: entry.availableBalance,
                availableBaseUnits: entry.availableBaseUnits,
                lockedBaseUnits: "0",
                totalBaseUnits: entry.availableBaseUnits,
                decimals: entry.decimals,
                baseUnitName: entry.baseUnitName,
                syncedAt,
              },
            },
            { upsert: true },
          )),
    ];

    await Promise.all([
      Wallet.updateOne(
        { _id: input.walletId },
        {
          $set: {
            "metadata.balance.lastKnownBalance": balances.onChainBalance,
            "metadata.balance.lastKnownBaseUnits": balances.onChainBaseUnits,
            "metadata.balance.lastKnownAvailableBaseUnits": balances.chainAvailableBaseUnits,
            "metadata.balance.legacyInternalDeltaBaseUnits": balances.internalDeltaBaseUnits,
            "metadata.balance.asset": context.assetSymbol,
            "metadata.balance.chain": context.chain,
            "metadata.balance.baseUnitName": context.baseUnitName,
            "metadata.balance.decimals": context.decimals,
            "metadata.balance.lastSyncedAt": syncedAt,
            "metadata.balance.exists": adapterBalance.exists,
            "metadata.balance.confirmed": adapterBalance.confirmed,
            "metadata.balance.tokenBalances": tokenBalanceMetadata,
            "metadata.lastBalanceSyncAt": syncedAt,
            ...(context.chain === "xrp"
              ? {
                  "metadata.balance.activationStatus": adapterBalance.exists
                    ? "active"
                    : "pending_activation",
                }
              : {}),
          },
          $unset: {
            "metadata.balance.lastKnown": 1,
            "metadata.balance.assetSymbol": 1,
          },
        },
      ),
      ...snapshotWrites,
    ]);

    await invalidateBalanceReadState(input.userId, {
      clearPortfolioSnapshot: true,
    }).catch(() => null);

    return {
      walletId: input.walletId,
      chain: context.chain,
      address: input.address,
      network: input.network,
      exists: adapterBalance.exists,
      confirmed: adapterBalance.confirmed,
      onChainBalance: balances.onChainBalance,
      internalBalanceDelta: balances.internalBalanceDelta,
      availableBalance: balances.availableBalance,
      balance: balances.availableBalance,
      currency: context.assetSymbol,
      asset: context.assetSymbol,
      tokenBalances,
      asOf: syncedAt.toISOString(),
      source: "live_onchain",
      metadata: {
        baseUnitName: context.baseUnitName,
        decimals: context.decimals,
        onChainBaseUnits: balances.onChainBaseUnits,
        chainAvailableBaseUnits: balances.chainAvailableBaseUnits,
        internalDeltaBaseUnits: balances.internalDeltaBaseUnits,
        legacyInternalDeltaBaseUnits: balances.internalDeltaBaseUnits,
        availableBaseUnits: balances.availableBaseUnits,
        minimumReserveBaseUnits,
        balanceSourceOfTruth: "onchain",
        tokenBalances: tokenBalanceMetadata,
        ...buildChainActivationMetadata(context, adapterBalance.exists),
      },
    };
  } catch (error) {
    logger.error("Failed to fetch live chain balance", {
      requestId: input.requestId || null,
      walletId: input.walletId,
      address: input.address,
      network: input.network,
      chain: context.chain,
      error: error instanceof Error ? error.message : String(error),
      errorDetails:
        error?.errors && typeof error.errors === "object" ? error.errors : null,
    });
    throw new AppError(`Failed to fetch live ${context.assetSymbol} balance`, {
      status: 502,
      errors:
        error instanceof AppError
          ? {
              ...(error.errors && typeof error.errors === "object"
                ? error.errors
                : {}),
              reason: error.message,
              chain: context.chain,
            }
          : error instanceof Error
            ? { reason: error.message, chain: context.chain }
            : undefined,
    });
  }
}

async function getInternalBalanceDeltaBaseUnits(walletId) {
  const wallet = await Wallet.findById(walletId)
    .select("_id userId metadata.balance.internalDeltaSummary metadata.balance.legacyInternalDeltaBaseUnits")
    .lean();

  return resolveInternalBalanceDeltaBaseUnits(wallet || walletId, {
    userId: wallet?.userId || null,
    trigger: "internal_delta_read",
  });
}

async function listBalances(userId, options = {}) {
  const wallets = await Wallet.find(withRuntimeChainNetworkFilter({ userId }))
    .sort({ createdAt: -1 })
    .lean();
  const walletSignature = buildBalanceListWalletSignature(wallets);
  const cachedEntry = isForcedBalanceSync(options)
    ? null
    : getCachedBalanceList(userId, walletSignature);
  if (cachedEntry) {
    logger.debug("Returning cached aggregated balance list", {
      event: "balance_list_cache_hit",
      userId: String(userId),
      walletCount: cachedEntry.response.length,
      cacheTtlMs: BALANCE_LIST_CACHE_TTL_MS,
    });

    if (options.includeSummary === true) {
      return {
        items: cachedEntry.response,
        summary:
          cachedEntry.summary ||
          buildPortfolioSummary(cachedEntry.response, {
            source: "memory_cache",
            computedAt: new Date(),
            snapshotValid: true,
          }),
      };
    }

    return cachedEntry.response;
  }

  const snapshotEntry = await readReusablePortfolioSnapshot(
    userId,
    walletSignature,
    options,
  );
  if (snapshotEntry) {
    setCachedBalanceList(
      userId,
      snapshotEntry.response,
      walletSignature,
      snapshotEntry.summary,
    );

    if (options.includeSummary === true) {
      return {
        items: snapshotEntry.response,
        summary: snapshotEntry.summary,
      };
    }

    return snapshotEntry.response;
  }

  const liveSyncGroups = new Map();
  for (const wallet of wallets) {
    if (shouldSkipRecentBalanceSync(wallet, options)) {
      continue;
    }
    try {
      const context = assertSupportedChainNetwork(wallet.chain, wallet.network);
      if (typeof context.adapter.balance.fetchBalances === "function") {
        const key = `${wallet.chain}:${wallet.network}`;
        if (!liveSyncGroups.has(key)) {
          liveSyncGroups.set(key, { context, network: wallet.network, addresses: new Set() });
        }
        liveSyncGroups.get(key).addresses.add(wallet.address);
      }
    } catch (_err) {
      // Ignore unsupported networks here, handled inside getWalletBalance
    }
  }

  const preloadedAdapterBalances = new Map();
  if (liveSyncGroups.size > 0) {
    await Promise.all(
      Array.from(liveSyncGroups.values()).map(async ({ context, network, addresses }) => {
        try {
          const addressArray = Array.from(addresses);
          const results = await context.adapter.balance.fetchBalances({ network, addresses: addressArray });
          
          if (Array.isArray(results)) {
            for (const result of results) {
              if (result && result.address && result.balance) {
                preloadedAdapterBalances.set(`${context.chain}:${network}:${result.address}`, result.balance);
              }
            }
          }
        } catch (error) {
          logger.warn("Adapter batch balance fetch failed, falling back to per-wallet read", {
            event: "adapter_batch_fetch_failed",
            chain: context.chain,
            network,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );
  }

  const balanceResults = await mapSettledWithConcurrency(
    wallets,
    BALANCE_LIST_CONCURRENCY,
    (wallet) =>
      getWalletBalance(String(userId), String(wallet._id), {
        walletRecord: wallet,
        trigger: "balance_list",
        skipMarketEnrichment: true,
        preloadedAdapterBalances,
      }),
  );

  const balances = balanceResults.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const wallet = wallets[index];
    const error = result.reason;
    let fallbackContext = null;

    try {
      fallbackContext = assertSupportedChainNetwork(wallet.chain, wallet.network);
    } catch (_contextError) {
      fallbackContext = null;
    }

    const fallbackAsset = fallbackContext?.assetSymbol || wallet.asset;
    const fallbackBaseUnitName =
      fallbackContext?.baseUnitName ||
      String(wallet?.metadata?.balance?.baseUnitName || "").trim() ||
      "base units";
    const fallbackDecimals = Number.isFinite(Number(fallbackContext?.decimals))
      ? Number(fallbackContext.decimals)
      : Math.max(Number(wallet?.metadata?.balance?.decimals) || 0, 0);

    // Log individual failure once during aggregation
    logger.error("Failed to fetch wallet balance during list aggregation, using fallback", {
      userId,
      walletId: String(wallet._id),
      chain: wallet.chain,
      network: wallet.network,
      address: wallet.address,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return safe fallback object preserved in original order
    return {
      walletId: String(wallet._id),
      chain: wallet.chain,
      address: wallet.address,
      network: wallet.network,
      exists: false,
      confirmed: false,
      onChainBalance: "0",
      internalBalanceDelta: "0",
      availableBalance: "0",
      balance: "0",
      currency: fallbackAsset,
      asset: fallbackAsset,
      asOf: new Date().toISOString(),
      source: "error",
      metadata: {
        baseUnitName: fallbackBaseUnitName,
        decimals: fallbackDecimals,
        onChainBaseUnits: "0",
        chainAvailableBaseUnits: "0",
        internalDeltaBaseUnits: "0",
        availableBaseUnits: "0",
        minimumReserveBaseUnits: "0",
      },
      errors: {
        reason: extractBalanceErrorReason(error),
        chain: wallet.chain,
      },
    };
  });

  // Fallback entries still pass through enrichment if asset symbol is present
  const enrichedBalances = await enrichBalancesWithMarketData(balances);
  const summary = buildPortfolioSummary(enrichedBalances, {
    source: "computed",
    computedAt: new Date(),
    snapshotValid: true,
  });
  setCachedBalanceList(userId, enrichedBalances, walletSignature, summary);
  await writePortfolioSnapshot(userId, walletSignature, enrichedBalances, summary).catch(
    (error) => {
      logger.warn("Failed to persist portfolio snapshot", {
        event: "portfolio_snapshot_write_failed",
        userId: String(userId),
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );

  logger.debug("Aggregated wallet balances for user", {
    event: "balance_list_compiled",
    userId: String(userId),
    walletCount: wallets.length,
    assetCount: summary.assetCount,
    totalFiatValue: summary.totalFiatValue,
    concurrency: BALANCE_LIST_CONCURRENCY,
  });

  if (options.includeSummary === true) {
    return {
      items: enrichedBalances,
      summary,
    };
  }

  return enrichedBalances;
}

async function invalidateBalanceReadState(userId, options = {}) {
  invalidateBalanceListCache(userId);

  if (options.clearPortfolioSnapshot !== false) {
    await PortfolioSnapshot.deleteOne({ userId }).catch(() => null);
  }
}

module.exports = {
  listBalances,
  getWalletBalance,
  getAddressBalance,
  refreshWalletBalance,
  getInternalBalanceDeltaBaseUnits,
  invalidateBalanceReadState,
};
