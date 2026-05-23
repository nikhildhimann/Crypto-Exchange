const logger = require("../../common/utils/logger");

const walletRefreshInFlight = new Map();
const activeRefreshMap = new Map();
const lastRefreshTime = new Map();
const SUPPORTED_CHAIN = "polygon";
const REFRESH_COOLDOWN_MS = 10000;

function getWalletRefreshKey({ userId, walletId, chain }) {
  return `${String(userId)}:${String(walletId)}:${String(chain || SUPPORTED_CHAIN).toLowerCase()}`;
}

function normalizeReason(reason, fallback = "manual_refresh") {
  const normalized = String(reason || fallback).trim().toLowerCase();
  return normalized || fallback;
}

function getCooldownRemainingMs(key) {
  const now = Date.now();
  const last = lastRefreshTime.get(key) || 0;
  return Math.max(0, REFRESH_COOLDOWN_MS - (now - last));
}

function shouldAllowRefresh(key) {
  if (getCooldownRemainingMs(key) > 0) {
    return false;
  }

  lastRefreshTime.set(key, Date.now());
  return true;
}

function isRefreshInProgress(key) {
  return activeRefreshMap.get(key) === true;
}

async function safeRefresh(key, context, fn) {
  if (isRefreshInProgress(key)) {
    logger.warn("REFRESH BLOCKED - already in progress", context);
    return {
      skipped: true,
      reason: "already_in_progress",
    };
  }

  activeRefreshMap.set(key, true);

  try {
    return await fn();
  } finally {
    activeRefreshMap.delete(key);
  }
}

function scheduleWalletNftRefresh({
  userId,
  walletId,
  chain = SUPPORTED_CHAIN,
  reason = "manual_refresh",
  force = true,
} = {}) {
  const normalizedChain = String(chain || SUPPORTED_CHAIN)
    .trim()
    .toLowerCase();

  if (!userId || !walletId || normalizedChain !== SUPPORTED_CHAIN) {
    const result = {
      scheduled: false,
      reason: "unsupported_or_missing_target",
    };
    const promise = Promise.resolve(result);
    promise.refreshSchedule = result;
    return promise;
  }

  const key = getWalletRefreshKey({
    userId,
    walletId,
    chain: normalizedChain,
  });
  const normalizedReason = normalizeReason(reason);
  const context = {
    userId: String(userId),
    walletId: String(walletId),
    chain: normalizedChain,
    reason: normalizedReason,
    force,
  };

  if (walletRefreshInFlight.has(key) || isRefreshInProgress(key)) {
    logger.warn("REFRESH BLOCKED - already in progress", context);
    const result = {
      scheduled: false,
      alreadyInFlight: true,
      skipped: true,
      reason: "already_in_progress",
    };
    const promise = Promise.resolve(result);
    promise.refreshSchedule = result;
    return promise;
  }

  if (!shouldAllowRefresh(key)) {
    const cooldownRemainingMs = getCooldownRemainingMs(key);
    logger.warn("REFRESH SKIPPED - cooldown", {
      ...context,
      cooldownRemainingMs,
    });

    const result = {
      scheduled: false,
      alreadyInFlight: false,
      skipped: true,
      reason: "cooldown",
      cooldownRemainingMs,
    };
    const promise = Promise.resolve(result);
    promise.refreshSchedule = result;
    return promise;
  }

  logger.info("REFRESH SCHEDULED", {
    ...context,
    timestamp: new Date().toISOString(),
  });

  const task = {
    latestReason: normalizedReason,
  };

  task.promise = safeRefresh(key, context, async () => {
    logger.info("REFRESH EXECUTED", {
      walletId: String(walletId),
      source: normalizedReason,
      timestamp: Date.now(),
    });

    const nftService = require("./service");
    return await nftService.syncWalletNFTs({
      userId,
      walletId,
      force,
      trigger: normalizedReason,
    });
  })
    .then((result) => {
      logger.info("NFT wallet refresh completed", {
        event: "nft_wallet_refresh_completed",
        ...context,
        skipped: Boolean(result?.skipped),
      });

      return result;
    })
    .catch((error) => {
      logger.warn("NFT wallet refresh failed", {
        event: "nft_wallet_refresh_failed",
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => {
      walletRefreshInFlight.delete(key);
    });

  task.promise.refreshSchedule = {
    scheduled: true,
    alreadyInFlight: false,
    skipped: false,
    reason: normalizedReason,
  };

  walletRefreshInFlight.set(key, task);
  return task.promise;
}

function isWalletRefreshInFlight({ userId, walletId, chain = SUPPORTED_CHAIN }) {
  const key = getWalletRefreshKey({
    userId,
    walletId,
    chain,
  });

  return walletRefreshInFlight.has(key) || isRefreshInProgress(key);
}

function getWalletRefreshGateState({ userId, walletId, chain = SUPPORTED_CHAIN }) {
  const key = getWalletRefreshKey({
    userId,
    walletId,
    chain,
  });

  return {
    inFlight: isWalletRefreshInFlight({ userId, walletId, chain }),
    cooldownRemainingMs: getCooldownRemainingMs(key),
  };
}

module.exports = {
  scheduleWalletNftRefresh,
  isWalletRefreshInFlight,
  getWalletRefreshGateState,
};
