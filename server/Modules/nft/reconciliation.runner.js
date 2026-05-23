const logger = require("../../common/utils/logger");
const {
  reconcilePendingNftTransfers,
} = require("./reconciliation.service");

const DEFAULT_CHAIN = "polygon";
const DEFAULT_NETWORK = "mainnet";
const DEFAULT_ENABLED = false;
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_LIMIT = 25;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 3_600_000;
const MIN_BATCH_LIMIT = 1;
const MAX_BATCH_LIMIT = 100;

let reconciliationTimeoutHandle = null;
let activeRunState = null;
let runnerConfig = null;

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function hasEnvValue(name) {
  return normalizeString(process.env[name]).length > 0;
}

function parseBoolean(value, fallback) {
  const normalized = normalizeString(value).toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return fallback;
}

function normalizeBooleanOption(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  return parseBoolean(value, fallback);
}

function normalizePositiveInt(value, fallback, { min, max } = {}) {
  const parsed = Number.parseInt(normalizeString(value), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalizedMin = Number.isFinite(min) ? min : parsed;
  const normalizedMax = Number.isFinite(max) ? max : parsed;
  const bounded = Math.max(parsed, normalizedMin);

  return Math.min(bounded, normalizedMax);
}

function resolveRunnerConfig(overrides = {}) {
  const enabledSource =
    overrides.enabled !== undefined
      ? "options"
      : hasEnvValue("NFT_RECONCILIATION_ENABLED")
        ? "NFT_RECONCILIATION_ENABLED"
        : "default_false";
  const intervalSource =
    overrides.intervalMs !== undefined
      ? "options"
      : hasEnvValue("NFT_RECONCILIATION_INTERVAL_MS")
        ? "NFT_RECONCILIATION_INTERVAL_MS"
        : "default_interval";
  const batchLimitSource =
    overrides.limit !== undefined
      ? "options"
      : hasEnvValue("NFT_RECONCILIATION_BATCH_LIMIT")
        ? "NFT_RECONCILIATION_BATCH_LIMIT"
        : "default_limit";

  return {
    enabled: normalizeBooleanOption(
      overrides.enabled,
      parseBoolean(process.env.NFT_RECONCILIATION_ENABLED, DEFAULT_ENABLED),
    ),
    enabledSource,
    chain: normalizeString(overrides.chain, DEFAULT_CHAIN).toLowerCase(),
    network: normalizeString(overrides.network, DEFAULT_NETWORK).toLowerCase(),
    intervalMs: normalizePositiveInt(
      overrides.intervalMs !== undefined
        ? overrides.intervalMs
        : process.env.NFT_RECONCILIATION_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      { min: MIN_INTERVAL_MS, max: MAX_INTERVAL_MS },
    ),
    intervalSource,
    batchLimit: normalizePositiveInt(
      overrides.limit !== undefined
        ? overrides.limit
        : process.env.NFT_RECONCILIATION_BATCH_LIMIT,
      DEFAULT_BATCH_LIMIT,
      { min: MIN_BATCH_LIMIT, max: MAX_BATCH_LIMIT },
    ),
    batchLimitSource,
  };
}

function buildBaseSummary({ chain, network, batchLimit, trigger, startedAt }) {
  return {
    chain,
    network,
    batchLimit,
    trigger: normalizeString(trigger, "manual"),
    startedAt: startedAt.toISOString(),
    totalScanned: 0,
    confirmedSuccessCount: 0,
    confirmedFailedCount: 0,
    stillPendingCount: 0,
    notFoundYetCount: 0,
    skippedCount: 0,
    errorCount: 0,
    durationMs: 0,
  };
}

function summarizeOutcomes(results = []) {
  const summary = {
    totalScanned: results.length,
    confirmedSuccessCount: 0,
    confirmedFailedCount: 0,
    stillPendingCount: 0,
    notFoundYetCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };

  for (const result of results) {
    switch (normalizeString(result?.outcome).toLowerCase()) {
      case "confirmed_success":
        summary.confirmedSuccessCount += 1;
        break;
      case "confirmed_failed":
        summary.confirmedFailedCount += 1;
        break;
      case "still_pending":
        summary.stillPendingCount += 1;
        break;
      case "not_found_yet":
        summary.notFoundYetCount += 1;
        break;
      case "error":
        summary.errorCount += 1;
        break;
      case "skipped":
        summary.skippedCount += 1;
        break;
      default:
        summary.skippedCount += 1;
        break;
    }
  }

  return summary;
}

async function runNftTransferReconciliationBatch(options = {}) {
  const config = resolveRunnerConfig(options);
  const startedAt = new Date();
  const baseSummary = buildBaseSummary({
    chain: config.chain,
    network: config.network,
    batchLimit: config.batchLimit,
    trigger: options.trigger,
    startedAt,
  });

  if (activeRunState) {
    const summary = {
      ...baseSummary,
      status: "skipped",
      skipReason: "already_running",
      runningSince: activeRunState.startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
    };

    logger.warn("NFT transfer reconciliation batch skipped", {
      event: "nft_reconciliation_batch_skipped",
      ...summary,
    });

    return summary;
  }

  activeRunState = {
    startedAt,
    config,
  };

  try {
    const reconciliationResult = await reconcilePendingNftTransfers({
      chain: config.chain,
      network: config.network,
      limit: config.batchLimit,
    });
    const results = Array.isArray(reconciliationResult?.results)
      ? reconciliationResult.results
      : [];
    const outcomeSummary = summarizeOutcomes(results);
    const summary = {
      ...baseSummary,
      ...outcomeSummary,
      status: "completed",
      durationMs: Date.now() - startedAt.getTime(),
      results,
    };

    logger.info("NFT transfer reconciliation batch completed", {
      event: "nft_reconciliation_batch_completed",
      chain: summary.chain,
      network: summary.network,
      batchLimit: summary.batchLimit,
      totalScanned: summary.totalScanned,
      confirmedSuccessCount: summary.confirmedSuccessCount,
      confirmedFailedCount: summary.confirmedFailedCount,
      stillPendingCount: summary.stillPendingCount,
      notFoundYetCount: summary.notFoundYetCount,
      skippedCount: summary.skippedCount,
      errorCount: summary.errorCount,
      durationMs: summary.durationMs,
      trigger: summary.trigger,
    });

    return summary;
  } catch (error) {
    const summary = {
      ...baseSummary,
      status: "error",
      errorCount: 1,
      durationMs: Date.now() - startedAt.getTime(),
      error: {
        message: normalizeString(error?.message, "NFT reconciliation batch failed"),
        status: error?.status || null,
      },
    };

    logger.error("NFT transfer reconciliation batch failed", {
      event: "nft_reconciliation_batch_failed",
      chain: summary.chain,
      network: summary.network,
      batchLimit: summary.batchLimit,
      totalScanned: summary.totalScanned,
      confirmedSuccessCount: summary.confirmedSuccessCount,
      confirmedFailedCount: summary.confirmedFailedCount,
      stillPendingCount: summary.stillPendingCount,
      notFoundYetCount: summary.notFoundYetCount,
      skippedCount: summary.skippedCount,
      errorCount: summary.errorCount,
      durationMs: summary.durationMs,
      trigger: summary.trigger,
      error: summary.error.message,
      statusCode: summary.error.status,
    });

    return summary;
  } finally {
    activeRunState = null;
  }
}

function startNftTransferReconciliationRunner(options = {}) {
  if (reconciliationTimeoutHandle) {
    logger.info("NFT transfer reconciliation runner already started", {
      event: "nft_reconciliation_runner_already_started",
      chain: runnerConfig?.chain || DEFAULT_CHAIN,
      network: runnerConfig?.network || DEFAULT_NETWORK,
      intervalMs: runnerConfig?.intervalMs || DEFAULT_INTERVAL_MS,
      batchLimit: runnerConfig?.batchLimit || DEFAULT_BATCH_LIMIT,
    });

    return {
      started: true,
      alreadyStarted: true,
      ...runnerConfig,
    };
  }

  runnerConfig = resolveRunnerConfig(options);

  if (!runnerConfig.enabled) {
    logger.info("NFT transfer reconciliation runner disabled", {
      event: "nft_reconciliation_runner_disabled",
      enabled: false,
      enabledSource: runnerConfig.enabledSource,
      chain: runnerConfig.chain,
      network: runnerConfig.network,
      intervalMs: runnerConfig.intervalMs,
      batchLimit: runnerConfig.batchLimit,
    });

    return {
      started: false,
      alreadyStarted: false,
      ...runnerConfig,
    };
  }

  function scheduleNextRun(delayMs = runnerConfig.intervalMs) {
    reconciliationTimeoutHandle = setTimeout(async () => {
      try {
        await runNftTransferReconciliationBatch({
          chain: runnerConfig.chain,
          network: runnerConfig.network,
          limit: runnerConfig.batchLimit,
          trigger: "timeout",
        });
      } finally {
        if (reconciliationTimeoutHandle && runnerConfig?.enabled) {
          scheduleNextRun(runnerConfig.intervalMs);
        }
      }
    }, delayMs);

    if (typeof reconciliationTimeoutHandle.unref === "function") {
      reconciliationTimeoutHandle.unref();
    }
  }

  scheduleNextRun(runnerConfig.intervalMs);

  logger.info("NFT transfer reconciliation runner started", {
    event: "nft_reconciliation_runner_started",
    enabled: true,
    enabledSource: runnerConfig.enabledSource,
    chain: runnerConfig.chain,
    network: runnerConfig.network,
    intervalMs: runnerConfig.intervalMs,
    intervalSource: runnerConfig.intervalSource,
    batchLimit: runnerConfig.batchLimit,
    batchLimitSource: runnerConfig.batchLimitSource,
  });

  void runNftTransferReconciliationBatch({
    chain: runnerConfig.chain,
    network: runnerConfig.network,
    limit: runnerConfig.batchLimit,
    trigger: "startup",
  });

  return {
    started: true,
    alreadyStarted: false,
    ...runnerConfig,
  };
}

function stopNftTransferReconciliationRunner() {
  if (!reconciliationTimeoutHandle) {
    return {
      stopped: false,
      activeRunInProgress: Boolean(activeRunState),
    };
  }

  clearTimeout(reconciliationTimeoutHandle);
  reconciliationTimeoutHandle = null;

  logger.info("NFT transfer reconciliation runner stopped", {
    event: "nft_reconciliation_runner_stopped",
    chain: runnerConfig?.chain || DEFAULT_CHAIN,
    network: runnerConfig?.network || DEFAULT_NETWORK,
    activeRunInProgress: Boolean(activeRunState),
  });

  runnerConfig = null;

  return {
    stopped: true,
    activeRunInProgress: Boolean(activeRunState),
  };
}

module.exports = {
  runNftTransferReconciliationBatch,
  startNftTransferReconciliationRunner,
  stopNftTransferReconciliationRunner,
};
