const logger = require("../common/utils/logger");
const securityConfig = require("../config/security");
const redis = require("../config/redis");
const { AppError } = require("../helpers/errors");

const degradedModeLogCache = new Map();
const DEGRADED_LOG_TTL_MS = 60_000;

function normalizeKeyPart(value, fallback = "") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9:_-]/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function getRequestPath(req) {
  const routePath = Array.isArray(req.route?.path)
    ? req.route.path.join("|")
    : req.route?.path;
  const resolvedPath = `${req.baseUrl || ""}${routePath || req.path || req.originalUrl || "/"}`;

  return resolvedPath
    .split("?")[0]
    .replace(/\/+$/, "") || "/";
}

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)[0];

  return normalizeKeyPart(forwardedFor || req.ip || "unknown", "unknown");
}

function buildDescriptor(dimension, value) {
  const normalizedValue = normalizeKeyPart(value);
  if (!normalizedValue) {
    return null;
  }

  return {
    dimension: normalizeKeyPart(dimension, "scope"),
    value: normalizedValue,
  };
}

function dedupeDescriptors(descriptors = []) {
  const seen = new Set();

  return descriptors.filter((descriptor) => {
    if (!descriptor?.dimension || !descriptor?.value) {
      return false;
    }

    const key = `${descriptor.dimension}:${descriptor.value}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getRateLimitUnavailableError(message = "Rate limiting temporarily unavailable") {
  return AppError.rateLimited(message);
}

function logDegradedMode(scope, req) {
  const cacheKey = `${scope}:${getRequestPath(req)}`;
  const now = Date.now();
  const existing = degradedModeLogCache.get(cacheKey);

  if (existing && existing > now) {
    return;
  }

  degradedModeLogCache.set(cacheKey, now + DEGRADED_LOG_TTL_MS);
  logger.warn("Rate limiter running without Redis enforcement", {
    scope,
    path: getRequestPath(req),
    method: req.method,
    ip: getClientIp(req),
    requestId: req.requestId || null,
    redis: redis.getStatus(),
  });
}

async function incrementCounter(key, windowMs, windowStart, { required = false } = {}) {
  const now = Date.now();
  const resetAt = windowStart + windowMs;
  const ttlMs = Math.max(resetAt - now, 1);

  return redis.execute(
    "rate_limit_counter",
    async (client) => {
      const count = Number(await client.incr(key));

      if (count === 1) {
        await client.pexpire(key, ttlMs);
      }

      const remainingTtl = Number(await client.pttl(key));

      return {
        count,
        resetAt:
          Date.now() + (remainingTtl > 0 ? remainingTtl : ttlMs),
      };
    },
    {
      count: 0,
      resetAt,
    },
    { required },
  );
}

function buildRedisRateLimitKey({
  req,
  scope,
  keySuffix,
  descriptor,
  windowStart,
}) {
  const routeKey = normalizeKeyPart(`${req.method}:${getRequestPath(req)}`, "route");

  return redis.getKey(
    "rate-limit",
    scope,
    keySuffix,
    routeKey,
    descriptor.dimension,
    descriptor.value,
    String(windowStart),
  );
}

function shouldFailClosed({ failClosed }) {
  const redisRequired = String(process.env.REDIS_REQUIRED_IN_PRODUCTION || "false").toLowerCase() === "true";
  if (!redisRequired) {
    return false;
  }
  return Boolean(failClosed);
}

const keyResolvers = {
  ip(req) {
    return dedupeDescriptors([buildDescriptor("ip", getClientIp(req))]);
  },
  authSession(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
      buildDescriptor("device", req.body?.deviceId),
    ]);
  },
  authRefresh(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
      buildDescriptor("device", req.body?.deviceId),
    ]);
  },
  superadminAuth(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
      buildDescriptor("email", req.body?.email),
      buildDescriptor("device", req.body?.deviceId),
    ]);
  },
  authenticatedUser(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
      buildDescriptor("user", req.user?._id),
      buildDescriptor("device", req.body?.deviceId),
    ]);
  },
  accountMutation(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
      buildDescriptor("user", req.user?._id),
      buildDescriptor("account", req.body?.accountId || req.params?.id),
    ]);
  },
  walletMutation(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
      buildDescriptor("user", req.user?._id),
      buildDescriptor("wallet", req.body?.walletId || req.params?.walletId),
      buildDescriptor("account", req.body?.accountId),
    ]);
  },
  transaction(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
      buildDescriptor("user", req.user?._id),
      buildDescriptor("wallet", req.body?.walletId || req.params?.walletId),
    ]);
  },
  withdrawal(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
      buildDescriptor("user", req.user?._id),
      buildDescriptor("wallet", req.body?.walletId),
    ]);
  },
  webhook(req) {
    return dedupeDescriptors([
      buildDescriptor("ip", getClientIp(req)),
    ]);
  },
};

const profiles = {
  globalGeneral: {
    scope: "general",
    keySuffix: "global",
    windowMs: securityConfig.rateLimitWindowMs,
    maxRequests: securityConfig.rateLimitMaxRequests,
    message: "Too many requests",
    resolveDescriptors: keyResolvers.ip,
    failClosed: false,
  },
  authStrict: {
    scope: "auth",
    windowMs: securityConfig.authRateLimitWindowMs,
    maxRequests: securityConfig.authRateLimitMaxRequests,
    message: "Too many authentication attempts",
    resolveDescriptors: keyResolvers.authSession,
    failClosed: true,
  },
  authModerate: {
    scope: "auth-refresh",
    windowMs: securityConfig.authRateLimitWindowMs,
    maxRequests: securityConfig.authRateLimitMaxRequests,
    message: "Too many authentication attempts",
    resolveDescriptors: keyResolvers.authRefresh,
    failClosed: true,
  },
  superadminAuthStrict: {
    scope: "superadmin-auth",
    windowMs: securityConfig.superadminAuthRateLimitWindowMs,
    maxRequests: securityConfig.superadminAuthRateLimitMaxRequests,
    message: "Too many superadmin authentication attempts",
    resolveDescriptors: keyResolvers.superadminAuth,
    failClosed: true,
  },
  walletMutationStrict: {
    scope: "wallet-mutation",
    windowMs: securityConfig.walletMutationRateLimitWindowMs,
    maxRequests: securityConfig.walletMutationRateLimitMaxRequests,
    message: "Too many wallet mutation requests",
    resolveDescriptors: keyResolvers.walletMutation,
    failClosed: true,
  },
  accountMutationStrict: {
    scope: "account-mutation",
    windowMs: securityConfig.walletMutationRateLimitWindowMs,
    maxRequests: securityConfig.walletMutationRateLimitMaxRequests,
    message: "Too many account mutation requests",
    resolveDescriptors: keyResolvers.accountMutation,
    failClosed: true,
  },
  transactionStrict: {
    scope: "transaction",
    windowMs: securityConfig.transactionRateLimitWindowMs,
    maxRequests: securityConfig.transactionRateLimitMaxRequests,
    message: "Too many transaction requests",
    resolveDescriptors: keyResolvers.transaction,
    failClosed: true,
  },
  webhookFlood: {
    scope: "webhook",
    windowMs: securityConfig.rateLimitWindowMs,
    maxRequests: securityConfig.rateLimitMaxRequests,
    message: "Too many webhook requests",
    resolveDescriptors: keyResolvers.webhook,
    failClosed: true,
  },
};

function createRateLimiter(options = {}) {
  const config = {
    ...profiles.globalGeneral,
    ...options,
  };

  return async function rateLimiter(req, res, next) {
    const scope = normalizeKeyPart(config.scope || config.keySuffix || "general", "general");

    try {
      const redisAvailable = redis.isReady();
      const failClosed = shouldFailClosed(config);

      if (!redisAvailable) {
        if (failClosed) {
          return next(
            getRateLimitUnavailableError("Rate limiting temporarily unavailable"),
          );
        }

        logDegradedMode(scope, req);
        return next();
      }

      const descriptors = dedupeDescriptors(
        typeof config.resolveDescriptors === "function"
          ? config.resolveDescriptors(req)
          : keyResolvers.ip(req),
      );
      const activeDescriptors = descriptors.length ? descriptors : keyResolvers.ip(req);
      const currentWindowStart = Math.floor(Date.now() / config.windowMs) * config.windowMs;

      const results = [];
      for (const descriptor of activeDescriptors) {
        const redisKey = buildRedisRateLimitKey({
          req,
          scope,
          keySuffix: config.keySuffix || "default",
          descriptor,
          windowStart: currentWindowStart,
        });

        const result = await incrementCounter(redisKey, config.windowMs, currentWindowStart, {
          required: failClosed,
        });
        results.push(result);
      }

      const highestCount = results.reduce(
        (max, entry) => Math.max(max, Number(entry?.count || 0)),
        0,
      );
      const resetAt = results.reduce(
        (min, entry) => Math.min(min, Number(entry?.resetAt || 0) || Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER,
      );
      const remaining = Math.max(config.maxRequests - highestCount, 0);

      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader(
        "X-RateLimit-Reset",
        Math.ceil((resetAt === Number.MAX_SAFE_INTEGER ? Date.now() : resetAt) / 1000),
      );

      if (highestCount > config.maxRequests) {
        logger.warn("Rate limit exceeded", {
          scope,
          keySuffix: config.keySuffix || "default",
          path: getRequestPath(req),
          method: req.method,
          requestId: req.requestId || null,
          ip: getClientIp(req),
          userId: req.user?._id ? String(req.user._id) : null,
          superadminId: req.superadmin?._id ? String(req.superadmin._id) : null,
        });
        return next(AppError.rateLimited(config.message));
      }

      return next();
    } catch (error) {
      if (error?.status) {
        return next(error);
      }

      logger.error("Rate limiter execution failed", {
        scope,
        path: getRequestPath(req),
        method: req.method,
        requestId: req.requestId || null,
        error: error?.message || "Unknown rate limiter error",
      });

      if (shouldFailClosed(config)) {
        return next(
          getRateLimitUnavailableError("Rate limiting temporarily unavailable"),
        );
      }

      logDegradedMode(scope, req);
      return next();
    }
  };
}

module.exports = createRateLimiter(profiles.globalGeneral);
module.exports.createRateLimiter = createRateLimiter;
module.exports.profiles = profiles;
module.exports.keyResolvers = keyResolvers;
