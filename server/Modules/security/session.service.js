const crypto = require("crypto");

const Session = require("../user/session.model");
const securityConfig = require("../../config/security");
const { AppError } = require("../../helpers/errors");

function hashRefreshTokenSecret(tokenSecret) {
  return crypto
    .createHash("sha256")
    .update(`${securityConfig.jwtSecret}:${String(tokenSecret || "")}`)
    .digest("hex");
}

function buildRefreshToken(tokenId, tokenSecret) {
  return `${tokenId}.${tokenSecret}`;
}

function parseRefreshToken(refreshToken) {
  if (typeof refreshToken !== "string") {
    throw AppError.unauthorized("Refresh token is required");
  }

  const [tokenId, tokenSecret] = refreshToken.trim().split(".");
  if (!tokenId || !tokenSecret) {
    throw AppError.unauthorized("Refresh token is invalid");
  }

  return { tokenId, tokenSecret };
}

function timingSafeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getSessionExpiryDate() {
  return new Date(Date.now() + securityConfig.refreshTokenTtlMs);
}

function normalizeSessionMetadata(input = {}) {
  return {
    deviceId: input.deviceId || "",
    deviceLabel: input.deviceLabel || "",
    platform: input.platform || "",
    appVersion: input.appVersion || "",
    biometricCapable: Boolean(input.biometricCapable),
    ipAddress: input.ipAddress || "",
    userAgent: input.userAgent || "",
    metadata:
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? input.metadata
        : {},
  };
}

function serializeSession(session, { currentSessionId = "" } = {}) {
  if (!session) {
    return null;
  }

  return {
    sessionId: session.tokenId,
    deviceId: session.deviceId || "",
    deviceLabel: session.deviceLabel || "",
    platform: session.platform || "",
    appVersion: session.appVersion || "",
    biometricCapable: Boolean(session.biometricCapable),
    ipAddress: session.ipAddress || "",
    userAgent: session.userAgent || "",
    status: session.status,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    revokedReason: session.revokedReason || "",
    isCurrent: currentSessionId ? currentSessionId === session.tokenId : false,
    metadata: session.metadata || {},
  };
}

function createRefreshTokenParts() {
  return {
    tokenId: crypto.randomUUID(),
    tokenSecret: crypto.randomBytes(48).toString("hex"),
  };
}

async function markSessionExpired(session) {
  if (!session || session.status === "expired") {
    return session;
  }

  session.status = "expired";
  session.revokedAt = session.revokedAt || new Date();
  session.revokedReason = session.revokedReason || "expired";
  await session.save();
  return session;
}

function assertSessionUsable(session) {
  if (!session) {
    throw AppError.unauthorized("Refresh session was not found");
  }

  if (session.status !== "active" || session.revokedAt) {
    throw AppError.unauthorized("Refresh session is no longer active");
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw AppError.unauthorized("Refresh session has expired");
  }

  return session;
}

async function createRefreshSession({ userId, ...metadata } = {}) {
  // Refresh tokens stay opaque to clients and only their hash is persisted.
  const normalizedMetadata = normalizeSessionMetadata(metadata);
  const { tokenId, tokenSecret } = createRefreshTokenParts();
  const session = await Session.create({
    userId,
    tokenId,
    refreshTokenHash: hashRefreshTokenSecret(tokenSecret),
    expiresAt: getSessionExpiryDate(),
    lastUsedAt: new Date(),
    status: "active",
    ...normalizedMetadata,
  });

  return {
    session,
    refreshToken: buildRefreshToken(tokenId, tokenSecret),
  };
}

async function validateRefreshSession(refreshToken) {
  const { tokenId, tokenSecret } = parseRefreshToken(refreshToken);
  const session = await Session.findOne({ tokenId }).select("+refreshTokenHash");

  if (!session) {
    throw AppError.unauthorized("Refresh session was not found");
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await markSessionExpired(session);
    throw AppError.unauthorized("Refresh session has expired");
  }

  if (session.status !== "active" || session.revokedAt) {
    throw AppError.unauthorized("Refresh session is no longer active");
  }

  if (!timingSafeEquals(session.refreshTokenHash, hashRefreshTokenSecret(tokenSecret))) {
    throw AppError.unauthorized("Refresh token is invalid");
  }

  return session;
}

async function rotateRefreshSession(refreshToken, metadata = {}) {
  const session = await validateRefreshSession(refreshToken);
  const normalizedMetadata = normalizeSessionMetadata(metadata);

  if (session.deviceId && normalizedMetadata.deviceId && session.deviceId !== normalizedMetadata.deviceId) {
    throw AppError.unauthorized("Refresh session device mismatch");
  }

  const { tokenSecret } = createRefreshTokenParts();

  session.refreshTokenHash = hashRefreshTokenSecret(tokenSecret);
  session.lastUsedAt = new Date();
  session.expiresAt = getSessionExpiryDate();

  if (normalizedMetadata.deviceId) {
    session.deviceId = normalizedMetadata.deviceId;
  }
  if (normalizedMetadata.deviceLabel) {
    session.deviceLabel = normalizedMetadata.deviceLabel;
  }
  if (normalizedMetadata.platform) {
    session.platform = normalizedMetadata.platform;
  }
  if (normalizedMetadata.appVersion) {
    session.appVersion = normalizedMetadata.appVersion;
  }
  if (Object.prototype.hasOwnProperty.call(metadata, "biometricCapable")) {
    session.biometricCapable = normalizedMetadata.biometricCapable;
  }
  if (normalizedMetadata.ipAddress) {
    session.ipAddress = normalizedMetadata.ipAddress;
  }
  if (normalizedMetadata.userAgent) {
    session.userAgent = normalizedMetadata.userAgent;
  }
  if (Object.keys(normalizedMetadata.metadata).length) {
    session.metadata = {
      ...(session.metadata || {}),
      ...normalizedMetadata.metadata,
    };
  }

  await session.save();

  return {
    session,
    refreshToken: buildRefreshToken(session.tokenId, tokenSecret),
  };
}

async function revokeSessionById(sessionId, { userId, reason = "revoked" } = {}) {
  const query = { tokenId: sessionId };
  if (userId) {
    query.userId = userId;
  }

  const session = await Session.findOne(query);
  if (!session) {
    return null;
  }

  if (session.status === "active" || !session.revokedAt) {
    session.status = "revoked";
    session.revokedAt = new Date();
    session.revokedReason = reason;
    await session.save();
  }

  return session;
}

async function revokeSessionByRefreshToken(refreshToken, reason = "revoked") {
  const session = await validateRefreshSession(refreshToken);
  return revokeSessionById(session.tokenId, { reason });
}

async function revokeAllUserSessions(userId, reason = "revoked") {
  const now = new Date();
  const result = await Session.updateMany(
    { userId, status: "active" },
    {
      $set: {
        status: "revoked",
        revokedAt: now,
        revokedReason: reason,
      },
    },
  );

  return result.modifiedCount || 0;
}

async function assertSessionIsActive(sessionId, userId = null) {
  if (!sessionId) {
    return null;
  }

  const query = { tokenId: sessionId };
  if (userId) {
    query.userId = userId;
  }

  const session = await Session.findOne(query);
  assertSessionUsable(session);
  return session;
}

async function listUserSessions(userId) {
  const sessions = await Session.find({ userId }).sort({ createdAt: -1 });
  return sessions.map((session) => serializeSession(session));
}

module.exports = {
  assertSessionIsActive,
  createRefreshSession,
  listUserSessions,
  parseRefreshToken,
  revokeAllUserSessions,
  revokeSessionById,
  revokeSessionByRefreshToken,
  rotateRefreshSession,
  serializeSession,
  validateRefreshSession,
};
