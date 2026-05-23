const crypto = require("crypto");

const logger = require("../common/utils/logger");

const replayCache = new Map();
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 300000;

function getHeaderValue(req, headerNames = []) {
  for (const headerName of headerNames) {
    const value = req.get(headerName);
    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeSignature(value) {
  return String(value || "")
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
}

function parseTimestamp(value) {
  const normalized = String(value || "").trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed < 1e12 ? parsed * 1000 : parsed;
}

function getTimestampToleranceMs() {
  const configured = Number(process.env.WEBHOOK_TIMESTAMP_TOLERANCE);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_TIMESTAMP_TOLERANCE_MS;
  }

  return configured;
}

function cleanupReplayCache(now) {
  for (const [key, expiresAt] of replayCache.entries()) {
    if (expiresAt <= now) {
      replayCache.delete(key);
    }
  }
}

function timingSafeMatch(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function rejectWebhook(req, res, chain, reason) {
  logger.warn("Rejected webhook request", {
    chain,
    reason,
    requestId: req.requestId || null,
    path: req.originalUrl || req.url || "",
    ip: req.ip || null,
  });

  return res.status(401).json({
    success: false,
    message: "Invalid webhook request",
  });
}

function createWebhookAuth({
  chain,
  secretEnvKey,
  signatureHeaders = ["x-webhook-signature"],
  timestampHeaders = ["x-webhook-timestamp"],
} = {}) {
  return function webhookAuth(req, res, next) {
    const secret = String(process.env[secretEnvKey] || "").trim();
    if (!secret) {
      return rejectWebhook(req, res, chain, "missing_secret");
    }

    if (!Buffer.isBuffer(req.rawBody)) {
      return rejectWebhook(req, res, chain, "missing_raw_body");
    }

    const timestampValue = getHeaderValue(req, timestampHeaders);
    if (!timestampValue) {
      return rejectWebhook(req, res, chain, "missing_timestamp");
    }

    const timestampMs = parseTimestamp(timestampValue);
    if (!timestampMs) {
      return rejectWebhook(req, res, chain, "invalid_timestamp");
    }

    const toleranceMs = getTimestampToleranceMs();
    const now = Date.now();
    if (Math.abs(now - timestampMs) > toleranceMs) {
      return rejectWebhook(req, res, chain, "expired_timestamp");
    }

    const signature = normalizeSignature(getHeaderValue(req, signatureHeaders));
    if (!signature || !/^[a-f0-9]{64}$/.test(signature)) {
      return rejectWebhook(req, res, chain, "missing_or_invalid_signature");
    }

    cleanupReplayCache(now);

    const replayKey = `${chain}:${signature}:${timestampMs}`;
    const replayExpiry = replayCache.get(replayKey);
    if (replayExpiry && replayExpiry > now) {
      return rejectWebhook(req, res, chain, "replay_detected");
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(req.rawBody)
      .digest("hex");

    if (!timingSafeMatch(signature, expectedSignature)) {
      return rejectWebhook(req, res, chain, "signature_mismatch");
    }

    replayCache.set(replayKey, now + toleranceMs);
    return next();
  };
}

module.exports = createWebhookAuth;
