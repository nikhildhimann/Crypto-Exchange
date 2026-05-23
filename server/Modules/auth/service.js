const jwt = require("jsonwebtoken");

const User = require("../user/model");
const securityConfig = require("../../config/security");
const { defaultChain } = require("../../config/chains");
const { AppError } = require("../../helpers/errors");
const { normalizePlainObjectInput } = require("../../helpers/sanitize");
const accountService = require("../accounts/service");
const sessionService = require("../security/session.service");

async function cleanupLegacyNullUniqueFields() {
  await Promise.all([
    User.updateMany({ publicAddress: null }, { $unset: { publicAddress: 1 } }),
    User.updateMany({ seedFingerprint: null }, { $unset: { seedFingerprint: 1 } }),
  ]);
}

function signAccessToken({ userId, sessionId }) {
  return jwt.sign(
    {
      sub: String(userId),
      userId: String(userId),
      sessionId: String(sessionId),
      subjectType: securityConfig.userSubjectType,
      tokenType: securityConfig.userAccessTokenType,
    },
    securityConfig.jwtSecret,
    {
      issuer: securityConfig.jwtIssuer,
      audience: securityConfig.jwtAudienceUser,
      expiresIn: securityConfig.accessTokenExpiresIn,
    },
  );
}

function buildUserPayload(user) {
  return {
    _id: String(user._id),
    primaryChain: user.primaryChain,
    status: user.status,
    role: user.role,
  };
}

function buildAuthResponse({ user, accessToken, refreshToken, session }) {
  const decoded = jwt.decode(accessToken) || {};
  const accessTokenExpiresAt = decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;
  const serializedSession = sessionService.serializeSession(session, {
    currentSessionId: session.tokenId,
  });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    sessionId: session.tokenId,
    userId: String(user._id),
    expiresIn: securityConfig.accessTokenExpiresIn,
    accessTokenExpiresIn: securityConfig.accessTokenExpiresIn,
    accessTokenExpiresAt,
    refreshTokenExpiresAt: session.expiresAt,
    session: serializedSession,
    user: buildUserPayload(user),
  };
}

async function ensureUser() {
  await cleanupLegacyNullUniqueFields();

  return User.create({
    primaryChain: defaultChain,
    status: "active",
    role: "user",
  });
}

function normalizeSessionInput(payload = {}) {
  return {
    deviceId: payload.deviceId || "",
    deviceLabel: payload.deviceLabel || "",
    platform: payload.platform || "",
    appVersion: payload.appVersion || "",
    biometricCapable: Boolean(payload.biometricCapable),
    metadata: normalizePlainObjectInput(payload.metadata, {
      fieldName: "metadata",
    }),
    ipAddress: payload.ipAddress || "",
    userAgent: payload.userAgent || "",
  };
}

async function createSession(payload = {}) {
  const user = await ensureUser();
  await accountService.ensureDefaultAccountForUser(user._id);
  const { session, refreshToken } = await sessionService.createRefreshSession({
    userId: user._id,
    ...normalizeSessionInput(payload),
  });
  const accessToken = signAccessToken({
    userId: user._id,
    sessionId: session.tokenId,
  });

  const authResponse = buildAuthResponse({
    user,
    accessToken,
    refreshToken,
    session,
  });

  // console.log("=========================================");
  // console.log(`[AUTH] New Access Token generated for User ID: ${user._id}`);
  // console.log(`[AUTH] Access Token: ${accessToken}`);
  // console.log("=========================================");

  return authResponse;
}

async function refreshSession(payload = {}) {
  const refreshToken = String(payload.refreshToken || "");
  const { session, refreshToken: rotatedRefreshToken } = await sessionService.rotateRefreshSession(
    refreshToken,
    normalizeSessionInput(payload),
  );
  const user = await User.findById(session.userId);

  if (!user) {
    throw AppError.unauthorized("User not found for this refresh session");
  }

  if (user.status !== "active") {
    throw AppError.forbidden("Wallet owner profile is not active");
  }

  await accountService.ensureDefaultAccountForUser(user._id);

  const accessToken = signAccessToken({
    userId: user._id,
    sessionId: session.tokenId,
  });

  const authResponse = buildAuthResponse({
    user,
    accessToken,
    refreshToken: rotatedRefreshToken,
    session,
  });

  // console.log("=========================================");
  // console.log(`[AUTH] Access Token REFRESHED for User ID: ${user._id}`);
  // console.log(`[AUTH] Access Token: ${accessToken}`);
  // console.log("=========================================");

  return authResponse;
}

async function logout({ userId, sessionId, revokeAll = false }) {
  if (!userId) {
    throw AppError.unauthorized("Authenticated user is required");
  }

  const revokedCount = revokeAll
    ? await sessionService.revokeAllUserSessions(userId, "logout_all")
    : Number(Boolean(await sessionService.revokeSessionById(sessionId, {
      userId,
      reason: "logout",
    })));

  return {
    revokedCount,
    revokedScope: revokeAll ? "all" : "current",
  };
}

async function listSessions(userId, currentSessionId = "") {
  const sessions = await sessionService.listUserSessions(userId);
  return sessions.map((session) => ({
    ...session,
    isCurrent: currentSessionId ? session.sessionId === currentSessionId : session.isCurrent,
  }));
}

async function revokeSession({ userId, sessionId, currentSessionId = "" }) {
  if (!userId || !sessionId) {
    throw AppError.validation("sessionId is required");
  }

  const session = await sessionService.revokeSessionById(sessionId, {
    userId,
    reason: sessionId === currentSessionId ? "logout" : "revoked_by_user",
  });

  if (!session) {
    throw AppError.notFound("Session was not found");
  }

  return sessionService.serializeSession(session, { currentSessionId });
}

module.exports = {
  createSession,
  listSessions,
  logout,
  refreshSession,
  revokeSession,
};
