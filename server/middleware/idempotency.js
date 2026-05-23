const logger = require("../common/utils/logger");
const securityConfig = require("../config/security");
const redis = require("../services/cache/redis.service");
const atomicityService = require("../services/atomicity.service");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const IDEMPOTENCY_SCOPE = "http_request";

function buildRequestFingerprint(req) {
  return atomicityService.hashIdentity({
    method: req.method,
    path: req.originalUrl || req.url || "",
    query: req.query || {},
    body: req.body && typeof req.body === "object" ? req.body : String(req.body || ""),
  });
}

function buildRecordKey(req, key) {
  return atomicityService.buildScopedKey(IDEMPOTENCY_SCOPE, key, {
    method: req.method,
    path: req.originalUrl || req.url || "",
  });
}

function buildResponsePayload(payload, req) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  return {
    ...payload,
    requestId: req.requestId,
  };
}

module.exports = async function idempotency(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  const key = String(req.headers["idempotency-key"] || "").trim();
  if (!key) {
    return next();
  }

  const recordKey = buildRecordKey(req, key);
  const fingerprint = buildRequestFingerprint(req);

  try {
    atomicityService.assertProtectionAvailable("Idempotency");
    const existing = await redis.getJson(recordKey, { required: true });

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        logger.warn("Duplicate idempotency key rejected for mismatched payload", {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl || req.url || "",
        });

        return res.status(409).json({
          success: false,
          message: "Idempotency key already used for a different request",
          errorCode: "IDEMPOTENCY_CONFLICT",
          requestId: req.requestId,
        });
      }

      if (existing.state === "completed" && existing.response) {
        logger.info("Replaying completed idempotent HTTP response", {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl || req.url || "",
        });

        return res
          .status(Number(existing.statusCode || 200))
          .json(buildResponsePayload(existing.response, req));
      }

      logger.info("Duplicate in-flight HTTP request blocked by idempotency layer", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl || req.url || "",
      });

      return res.status(409).json({
        success: false,
        message: "Duplicate request blocked by idempotency layer",
        errorCode: "IDEMPOTENCY_CONFLICT",
        requestId: req.requestId,
      });
    }

    const started = await redis.setJson(
      recordKey,
      {
        state: "processing",
        fingerprint,
        startedAt: new Date().toISOString(),
        requestId: req.requestId,
      },
      {
        ttlMs: securityConfig.idempotencyTtlMs,
        nx: true,
        required: true,
      },
    );

    if (started !== "OK") {
      const afterRace = await redis.getJson(recordKey, { required: true });
      if (afterRace?.state === "completed" && afterRace.fingerprint === fingerprint) {
        return res
          .status(Number(afterRace.statusCode || 200))
          .json(buildResponsePayload(afterRace.response, req));
      }

      return res.status(409).json({
        success: false,
        message: "Duplicate request blocked by idempotency layer",
        errorCode: "IDEMPOTENCY_CONFLICT",
        requestId: req.requestId,
      });
    }

    req.idempotency = {
      key,
      recordKey,
      fingerprint,
    };

    const originalJson = res.json.bind(res);
    let handledSuccessfulJsonResponse = false;

    res.json = function idempotentJson(payload) {
      if (req.idempotency && res.statusCode >= 200 && res.statusCode < 300) {
        handledSuccessfulJsonResponse = true;

        void redis
          .setJson(
            recordKey,
            {
              state: "completed",
              fingerprint,
              statusCode: res.statusCode,
              response: payload,
              completedAt: new Date().toISOString(),
            },
            {
              ttlMs: securityConfig.idempotencyTtlMs,
              required: true,
            },
          )
          .catch((error) => {
            logger.error("Failed to persist completed idempotent response", {
              requestId: req.requestId,
              method: req.method,
              path: req.originalUrl || req.url || "",
              error: error.message,
            });

            return redis.del(recordKey, { required: false }).catch(() => 0);
          });
      }

      return originalJson(payload);
    };

    res.on("finish", () => {
      if (!req.idempotency) {
        return;
      }

      if (res.statusCode >= 200 && res.statusCode < 300 && handledSuccessfulJsonResponse) {
        return;
      }

      void redis.del(recordKey, { required: false }).catch(() => 0);
    });

    return next();
  } catch (error) {
    logger.error("Idempotency middleware unavailable", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url || "",
      error: error.message,
    });

    return res.status(503).json({
      success: false,
      message: "Request deduplication is temporarily unavailable",
      errorCode: "IDEMPOTENCY_UNAVAILABLE",
      requestId: req.requestId,
    });
  }
};
