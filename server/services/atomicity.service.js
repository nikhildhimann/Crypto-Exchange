const crypto = require("crypto");

const logger = require("../common/utils/logger");
const securityConfig = require("../config/security");
const { AppError } = require("../helpers/errors");
const { normalizeTxHash } = require("../common/utils/txHash");
const redis = require("./cache/redis.service");

const LOCK_RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;
const DEFAULT_OPERATION_LOCK_TTL_MS = 120000;
const DEFAULT_EVENT_LOCK_TTL_MS = 120000;

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeAddressLike(value) {
  return normalizeString(value);
}

function normalizeChain(value) {
  return normalizeString(value).toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function sortValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function hashIdentity(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function buildScopedKey(category, scope, identity) {
  return redis.getKey("atomic", category, scope, hashIdentity(identity));
}

function createProtectionUnavailableError(scope) {
  return new AppError(`${scope} protection is unavailable`, {
    status: 503,
    code: "INTERNAL_ERROR",
  });
}

function assertProtectionAvailable(scope) {
  const redisRequired = String(process.env.REDIS_REQUIRED_IN_PRODUCTION || "false").toLowerCase() === "true";
  if (!redisRequired) {
    return;
  }

  const status = redis.getStatus();
  if (status.enabled) {
    return;
  }

  throw createProtectionUnavailableError(scope);
}

function buildSendOperationIdentity(input = {}) {
  if (normalizeString(input.idempotencyKey)) {
    return {
      mode: "explicit_idempotency_key",
      scope: "transaction_send",
      key: normalizeString(input.idempotencyKey),
    };
  }

  return {
    mode: "derived_request_fingerprint",
    scope: "transaction_send",
    userId: normalizeString(input.userId),
    walletId: normalizeString(input.walletId),
    chain: normalizeChain(input.chain),
    network: normalizeChain(input.network),
    toAddress: normalizeAddressLike(input.toAddress || input.destinationAddress),
    amount: normalizeString(input.amount),
    asset: normalizeString(input.asset).toUpperCase(),
    executionParams: sortValue(input.executionParams || {}),
  };
}

function buildWithdrawalOperationIdentity(input = {}) {
  if (normalizeString(input.idempotencyKey)) {
    return {
      mode: "explicit_idempotency_key",
      scope: "withdrawal_request",
      key: normalizeString(input.idempotencyKey),
    };
  }

  return {
    mode: "derived_request_fingerprint",
    scope: "withdrawal_request",
    userId: normalizeString(input.userId),
    walletId: normalizeString(input.walletId),
    chain: normalizeChain(input.chain),
    network: normalizeChain(input.network),
    destinationAddress: normalizeAddressLike(input.destinationAddress || input.toAddress),
    amount: normalizeString(input.amount),
    asset: normalizeString(input.asset).toUpperCase(),
    executionParams: sortValue(input.executionParams || {}),
  };
}

function buildChainEventIdentity(input = {}) {
  const normalizedAddress = normalizeAddressLike(
    input.address || input.toAddress || input.destinationAddress,
  );

  return {
    scope: "chain_event",
    chain: normalizeChain(input.chain),
    txHash: normalizeTxHash(input.txHash),
    address: normalizedAddress,
    walletId: normalizedAddress ? "" : normalizeString(input.walletId),
  };
}

async function readCompletedResult(scope, identity, { required = true } = {}) {
  return redis.getJson(buildScopedKey("result", scope, identity), { required });
}

async function storeCompletedResult(scope, identity, payload, options = {}) {
  if (payload === undefined || payload === null) {
    return null;
  }

  return redis.setJson(buildScopedKey("result", scope, identity), payload, {
    ttlMs: options.ttlMs || securityConfig.idempotencyTtlMs,
    required: options.required !== false,
  });
}

async function acquireLock({
  scope,
  identity,
  ttlMs = DEFAULT_OPERATION_LOCK_TTL_MS,
  required = true,
  logContext = {},
}) {
  const lockKey = buildScopedKey("lock", scope, identity);
  const token = crypto.randomUUID();
  const result = await redis.set(lockKey, token, {
    ttlMs,
    nx: true,
    required,
  });

  const acquired = result === "OK";
  if (!acquired) {
    logger.info("Atomic lock already held", {
      scope,
      ...logContext,
    });
  }

  return {
    acquired,
    key: lockKey,
    token,
    scope,
    ttlMs,
    required,
  };
}

async function releaseLock(lock) {
  if (!lock?.acquired) {
    return false;
  }

  try {
    const released = await redis.eval(
      LOCK_RELEASE_SCRIPT,
      1,
      [lock.key, lock.token],
      { required: false },
    );
    return Number(released || 0) > 0;
  } catch (error) {
    logger.warn("Failed to release atomic lock", {
      scope: lock.scope,
      error: error?.message || "Unknown lock release error",
    });
    return false;
  }
}

async function withLock(options, callback) {
  const required = options.required !== false;

  if (required) {
    assertProtectionAvailable(options.scope);
  }

  const lock = await acquireLock({
    scope: options.scope,
    identity: options.identity,
    ttlMs: options.ttlMs || DEFAULT_EVENT_LOCK_TTL_MS,
    required,
    logContext: options.logContext,
  });

  if (!lock.acquired) {
    if (typeof options.onBusy === "function") {
      return options.onBusy();
    }

    throw AppError.conflict(options.busyMessage || "Another matching operation is already in progress");
  }

  try {
    return await callback(lock);
  } finally {
    await releaseLock(lock);
  }
}

async function withIdempotentOperation(options, callback) {
  const required = options.required !== false;

  if (required) {
    assertProtectionAvailable(options.scope);
  }

  const completed = await readCompletedResult(options.scope, options.identity, { required });
  if (completed) {
    logger.info("Replaying completed idempotent operation", {
      scope: options.scope,
      ...(options.logContext || {}),
    });

    return options.loadResult ? options.loadResult(completed) : completed;
  }

  const lock = await acquireLock({
    scope: options.scope,
    identity: options.identity,
    ttlMs: options.ttlMs || DEFAULT_OPERATION_LOCK_TTL_MS,
    required,
    logContext: options.logContext,
  });

  if (!lock.acquired) {
    const completedAfterRace = await readCompletedResult(options.scope, options.identity, {
      required,
    });
    if (completedAfterRace) {
      logger.info("Replaying completed idempotent operation after race", {
        scope: options.scope,
        ...(options.logContext || {}),
      });
      return options.loadResult ? options.loadResult(completedAfterRace) : completedAfterRace;
    }

    if (typeof options.onBusy === "function") {
      return options.onBusy();
    }

    throw AppError.conflict(options.busyMessage || "A matching request is already being processed");
  }

  try {
    const result = await callback(lock);

    if (typeof options.storeResult === "function") {
      const payload = await options.storeResult(result);
      await storeCompletedResult(options.scope, options.identity, payload, {
        ttlMs: options.completedTtlMs || securityConfig.idempotencyTtlMs,
        required,
      });
    }

    return result;
  } finally {
    await releaseLock(lock);
  }
}

module.exports = {
  DEFAULT_EVENT_LOCK_TTL_MS,
  DEFAULT_OPERATION_LOCK_TTL_MS,
  stableStringify,
  hashIdentity,
  buildScopedKey,
  assertProtectionAvailable,
  buildSendOperationIdentity,
  buildWithdrawalOperationIdentity,
  buildChainEventIdentity,
  withLock,
  withIdempotentOperation,
};
