const path = require("path");
const demoConfig = require("./demo");

require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

function normalizeString(value) {
  return String(value || "").trim();
}

function hasEnvValue(name) {
  return normalizeString(process.env[name]).length > 0;
}

function parseBooleanEnv(name, fallback) {
  if (!hasEnvValue(name)) {
    return fallback;
  }

  return normalizeString(process.env[name]).toLowerCase() === "true";
}

function parsePositiveIntEnv(name, fallback) {
  const rawValue = normalizeString(process.env[name]);
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveGlobalJobsEnabled() {
  if (demoConfig.enabled) {
    return {
      enabled: false,
      source: "DEMO_MODE",
    };
  }

  if (hasEnvValue("JOBS_ENABLED")) {
    return {
      enabled: parseBooleanEnv("JOBS_ENABLED", false),
      source: "JOBS_ENABLED",
    };
  }

  if (hasEnvValue("QUEUE_ENABLED")) {
    return {
      enabled: parseBooleanEnv("QUEUE_ENABLED", false),
      source: "QUEUE_ENABLED",
    };
  }

  return {
    enabled: false,
    source: "default_false",
  };
}

const DEFAULT_JOB_INTERVALS = Object.freeze({
  depositWatcher: 30_000,
  withdrawalStatus: 60_000,
  transactionStatus: 60_000,
  balanceSync: 300_000,
  sessionCleanup: 3_600_000,
  treasuryReconcile: 86_400_000,
  utxoWalletSync: 180_000,
  syncQueueWorker: 15_000,
  nftListingExpiry: 600_000,
});

const JOB_ENV_MAP = Object.freeze({
  depositWatcher: {
    enabledEnv: "DEPOSIT_WATCHER_ENABLED",
    intervalEnv: "DEPOSIT_WATCHER_INTERVAL_MS",
  },
  withdrawalStatus: {
    enabledEnv: "WITHDRAWAL_STATUS_ENABLED",
    intervalEnv: "WITHDRAWAL_STATUS_INTERVAL_MS",
  },
  transactionStatus: {
    enabledEnv: "TRANSACTION_STATUS_ENABLED",
    intervalEnv: "TRANSACTION_STATUS_INTERVAL_MS",
  },
  balanceSync: {
    enabledEnv: "BALANCE_SYNC_ENABLED",
    intervalEnv: "BALANCE_SYNC_INTERVAL_MS",
  },
  sessionCleanup: {
    enabledEnv: "SESSION_CLEANUP_ENABLED",
    intervalEnv: "SESSION_CLEANUP_INTERVAL_MS",
  },
  treasuryReconcile: {
    enabledEnv: "TREASURY_RECONCILE_ENABLED",
    intervalEnv: "TREASURY_RECONCILE_INTERVAL_MS",
  },
  utxoWalletSync: {
    enabledEnv: "UTXO_WALLET_SYNC_ENABLED",
    intervalEnv: "UTXO_WALLET_SYNC_INTERVAL_MS",
  },
  syncQueueWorker: {
    enabledEnv: "SYNC_QUEUE_WORKER_ENABLED",
    intervalEnv: "SYNC_QUEUE_WORKER_INTERVAL_MS",
  },
  nftListingExpiry: {
    enabledEnv: "NFT_LISTING_EXPIRY_ENABLED",
    intervalEnv: "NFT_LISTING_EXPIRY_INTERVAL_MS",
  },
});

const globalJobs = resolveGlobalJobsEnabled();

function resolveJobConfig(jobName) {
  const envConfig = JOB_ENV_MAP[jobName] || {};
  if (demoConfig.enabled) {
    return {
      enabled: false,
      enabledSource: "DEMO_MODE",
      intervalMs: parsePositiveIntEnv(
        envConfig.intervalEnv,
        DEFAULT_JOB_INTERVALS[jobName] || 60_000,
      ),
      intervalSource: hasEnvValue(envConfig.intervalEnv)
        ? envConfig.intervalEnv
        : "default_interval",
    };
  }

  const enabledSource = hasEnvValue(envConfig.enabledEnv)
    ? envConfig.enabledEnv
    : globalJobs.source;

  return {
    enabled: parseBooleanEnv(envConfig.enabledEnv, globalJobs.enabled),
    enabledSource,
    intervalMs: parsePositiveIntEnv(
      envConfig.intervalEnv,
      DEFAULT_JOB_INTERVALS[jobName] || 60_000,
    ),
    intervalSource: hasEnvValue(envConfig.intervalEnv)
      ? envConfig.intervalEnv
      : "default_interval",
  };
}

const jobs = Object.freeze(
  Object.fromEntries(
    Object.keys(JOB_ENV_MAP).map((jobName) => [jobName, resolveJobConfig(jobName)]),
  ),
);

module.exports = Object.freeze({
  enabled: globalJobs.enabled,
  queueEnabled: globalJobs.enabled,
  jobsEnabled: globalJobs.enabled,
  enabledSource: globalJobs.source,
  names: Object.freeze({
    deposit: "deposit",
    withdrawal: "withdrawal",
    balance: "balance",
    treasury: "treasury",
  }),
  jobs,
});
