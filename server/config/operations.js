const demoConfig = require("./demo");

function parseNumberEnv(key, defaultValue, min = 0) {
  const value = process.env[key];
  if (!value || String(value).trim() === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min) {
    return defaultValue;
  }
  return parsed;
}

function demoDefault(demoValue, standardValue) {
  return demoConfig.enabled ? demoValue : standardValue;
}

module.exports = {
  sync: {
    balanceCooldownMs: parseNumberEnv(
      "OPERATIONS_BALANCE_SYNC_COOLDOWN_MS",
      demoDefault(60 * 1000, 15 * 1000),
      1000,
    ),
    balanceListCacheTtlMs: parseNumberEnv(
      "OPERATIONS_BALANCE_LIST_CACHE_TTL_MS",
      demoDefault(60 * 1000, 10 * 1000),
      1000,
    ),
    portfolioSnapshotTtlMs: parseNumberEnv("OPERATIONS_PORTFOLIO_SNAPSHOT_TTL_MS", 60 * 1000, 1000),
    historyCooldownMs: parseNumberEnv("OPERATIONS_HISTORY_SYNC_COOLDOWN_MS", 30 * 1000, 1000),
    historyPendingReconciliationWindowMs: parseNumberEnv("OPERATIONS_HISTORY_PENDING_RECONCILIATION_WINDOW_MS", 15 * 60 * 1000, 1000),
    historyPendingDetailRefreshMs: parseNumberEnv("OPERATIONS_HISTORY_PENDING_DETAIL_REFRESH_MS", 15 * 1000, 1000),
    historyBootstrapRecentProvisioningWindowMs: parseNumberEnv("OPERATIONS_HISTORY_BOOTSTRAP_RECENT_PROVISIONING_WINDOW_MS", 15 * 60 * 1000, 1000),
    historyBootstrapWalletLimit: parseNumberEnv("OPERATIONS_HISTORY_BOOTSTRAP_WALLET_LIMIT", 5, 1),
    // Pending rows older than this age are excluded from semantic reconciliation candidate scans.
    // 7-day default safely covers the slowest finality chains (ADA, BTC) without bloating hot paths.
    pendingStaleThresholdMs: parseNumberEnv("OPERATIONS_PENDING_STALE_THRESHOLD_MS", 7 * 24 * 60 * 60 * 1000, 60 * 60 * 1000),
    // Wallet-level pending sweep cooldown. Prevents the same wallet's pending rows from
    // being re-swept more than once per this window across concurrent reads.
    pendingSweepCooldownMs: parseNumberEnv("OPERATIONS_PENDING_SWEEP_COOLDOWN_MS", 30 * 1000, 5000),
    // Number of wallets to process in a single background worker pass.
    syncQueueWorkerBatchSize: parseNumberEnv("OPERATIONS_SYNC_QUEUE_WORKER_BATCH_SIZE", 5, 1),
    // Lifecycle of in-memory market price data. Shorter TTLs keep prices fresh,
    // while longer TTLs significantly reduce market provider (CoinGecko) API fanout.
    marketPriceCacheTtlMs: parseNumberEnv(
      "OPERATIONS_MARKET_PRICE_CACHE_TTL_MS",
      demoDefault(5 * 60 * 1000, 60 * 1000),
      10 * 1000,
    ),
  },
  concurrency: {
    balanceListLimit: parseNumberEnv("OPERATIONS_BALANCE_LIST_CONCURRENCY", 6, 1),
    provisioningLimit: parseNumberEnv("OPERATIONS_PROVISIONING_CONCURRENCY", 3, 1),
  },
  session: {
    creationTtlMs: parseNumberEnv("OPERATIONS_CREATION_SESSION_TTL_MS", 15 * 60 * 1000, 60 * 1000),
  },
  observability: {
    // Frequency for flushing in-memory performance metrics to logs.
    statsReportIntervalMs: parseNumberEnv("OPERATIONS_STATS_REPORT_INTERVAL_MS", 5 * 60 * 1000, 60 * 1000),
    // Threshold for stale provisioning/recovery states in consistency audits.
    recoveryMaxAgeMs: parseNumberEnv("OPERATIONS_RECOVERY_MAX_AGE_MS", 48 * 60 * 60 * 1000, 60 * 60 * 1000),
  }
};
