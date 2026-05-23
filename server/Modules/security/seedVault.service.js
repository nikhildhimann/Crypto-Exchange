const crypto = require("crypto");
const logger = require("../../common/utils/logger");
const securityConfig = require("../../config/security");
const { AppError } = require("../../helpers/errors");

function encryptSeed(seed) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", resolveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(seed), "utf8"), cipher.final()]);

  return {
    algorithm: "aes-256-gcm",
    cipherText: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}

function buildAuditContext(auditContext = {}) {
  if (!auditContext || typeof auditContext !== "object") {
    return {};
  }
  const normalized = {
    operation: String(auditContext.operation || "").trim(),
    requestId: auditContext.requestId || null,
    userId: auditContext.userId ? String(auditContext.userId) : null,
    walletId: auditContext.walletId ? String(auditContext.walletId) : null,
    transactionId: auditContext.transactionId ? String(auditContext.transactionId) : null,
    chain: String(auditContext.chain || "").trim(),
    network: String(auditContext.network || "").trim(),
    source: String(auditContext.source || "").trim(),
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== null && value !== ""),
  );
}

function logAuditEvent(level, message, auditContext = {}, extra = {}) {
  const metadata = {
    ...buildAuditContext(auditContext),
    ...extra,
  };

  if (!Object.keys(metadata).length) {
    return;
  }

  logger[level](message, metadata);
}

function decryptSeed(payload, options = {}) {
  const auditContext =
    options && typeof options === "object" ? options.auditContext || null : null;

  if (!payload) {
    logAuditEvent("warn", "Sensitive seed decrypt denied", auditContext, {
      reason: "missing_payload",
    });
    throw AppError.validation("Encrypted seed payload is required");
  }

  logAuditEvent("info", "Sensitive seed decrypt requested", auditContext);

  try {
    let decrypted;

    if (typeof payload === "string") {
      decrypted = decryptLegacySeed(payload);
    } else {
      const decipher = crypto.createDecipheriv(
        payload.algorithm || "aes-256-gcm",
        resolveEncryptionKey(),
        Buffer.from(payload.iv, "base64"),
      );

      decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

      decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.cipherText, "base64")),
        decipher.final(),
      ]).toString("utf8");
    }

    logAuditEvent("info", "Sensitive seed decrypt succeeded", auditContext);
    return decrypted;
  } catch (error) {
    logAuditEvent("warn", "Sensitive seed decrypt failed", auditContext, {
      reason: error instanceof AppError ? "validation_error" : "decrypt_failed",
      errorType: error instanceof Error ? error.name : "unknown_error",
    });
    throw error;
  }
}

function resolveEncryptionKey() {
  const base64Key =
    process.env.AES_SECRET_KEY_BASE64 || process.env.ENCRYPTION_KEY_BASE64 || null;

  if (base64Key) {
    const decoded = Buffer.from(base64Key, "base64");
    if (decoded.length !== 32) {
      throw new Error("AES secret key must decode to exactly 32 bytes");
    }

    return decoded;
  }

  return crypto.createHash("sha256").update(String(securityConfig.encryptionKey)).digest();
}

function decryptLegacySeed(payload) {
  const [ivHex, tagHex, encryptedHex] = String(payload).split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    resolveEncryptionKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  encryptSeed,
  decryptSeed,
};
