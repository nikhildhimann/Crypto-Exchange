const jwt = require("jsonwebtoken");

const Superadmin = require("../superadmin/model");
const securityConfig = require("../../config/security");
const { AppError } = require("../../helpers/errors");
const { normalizePlainObjectInput } = require("../../helpers/sanitize");
const {
  normalizeSuperadminEmail,
  verifySuperadminPassword,
} = require("../superadmin/password.service");
const sessionService = require("./session.service");

function signAccessToken({ superadminId, sessionId, role }) {
  return jwt.sign(
    {
      sub: String(superadminId),
      superadminId: String(superadminId),
      sessionId: String(sessionId),
      role: String(role || "superadmin"),
      subjectType: securityConfig.superadminSubjectType,
      tokenType: securityConfig.superadminAccessTokenType,
    },
    securityConfig.superadminJwtSecret,
    {
      issuer: securityConfig.jwtIssuer,
      audience: securityConfig.jwtAudienceSuperadmin,
      expiresIn: securityConfig.superadminAccessTokenExpiresIn,
    },
  );
}

function buildSuperadminPayload(superadmin) {
  return {
    _id: String(superadmin._id),
    email: superadmin.email,
    role: superadmin.role,
    status: superadmin.status,
    mfaEnabled: Boolean(superadmin.mfaEnabled),
    lastLoginAt: superadmin.lastLoginAt,
    lastPasswordChangedAt: superadmin.lastPasswordChangedAt,
    metadata: superadmin.metadata || {},
    createdAt: superadmin.createdAt,
    updatedAt: superadmin.updatedAt,
  };
}

function buildAuthResponse({ superadmin, accessToken, refreshToken, session }) {
  const decoded = jwt.decode(accessToken) || {};
  const accessTokenExpiresAt = decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;
  const serializedSession = sessionService.serializeSession(session, {
    currentSessionId: session.tokenId,
  });
  const serializedSuperadmin = buildSuperadminPayload(superadmin);

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    sessionId: session.tokenId,
    superadminId: String(superadmin._id),
    accessTokenExpiresAt,
    refreshTokenExpiresAt: session.expiresAt,
    sessionExpiresAt: session.expiresAt,
    session: serializedSession,
    superadmin: serializedSuperadmin,
    role: serializedSuperadmin.role,
    roles: [serializedSuperadmin.role],
    permissions: [],
  };
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

async function assertSuperadminUsable(superadmin, { forLogin = false } = {}) {
  if (!superadmin) {
    throw AppError.unauthorized(forLogin ? "Invalid email or password" : "Superadmin not found");
  }

  if (!securityConfig.superadminRoles.includes(superadmin.role)) {
    throw AppError.forbidden("Superadmin role is not allowed");
  }

  if (superadmin.status !== "active") {
    if (forLogin) {
      throw AppError.unauthorized("Invalid email or password");
    }

    throw AppError.forbidden("Superadmin account is not active");
  }

  return superadmin;
}

async function login(payload = {}) {
  const email = normalizeSuperadminEmail(payload.email);
  const password = String(payload.password || "");

  const superadmin = await Superadmin.findOne({ email }).select("+passwordHash");
  if (!superadmin) {
    throw AppError.unauthorized("Invalid email or password");
  }

  if (!(await verifySuperadminPassword(password, superadmin.passwordHash))) {
    throw AppError.unauthorized("Invalid email or password");
  }

  await assertSuperadminUsable(superadmin, { forLogin: true });
  const maxConcurrent = securityConfig.superadminMaxConcurrentSessions || 5;
  const activeSessions = await sessionService.countActiveSessions(superadmin._id);

  if (activeSessions >= maxConcurrent) {
    await sessionService.revokeOldestActiveSessions(
      superadmin._id,
      activeSessions - maxConcurrent + 1,
      "session_limit_rebalanced",
    );
  }


  const { session, refreshToken } = await sessionService.createRefreshSession({
    superadminId: superadmin._id,
    ...normalizeSessionInput(payload),
  });

  superadmin.lastLoginAt = new Date();
  await superadmin.save();

  const accessToken = signAccessToken({
    superadminId: superadmin._id,
    sessionId: session.tokenId,
    role: superadmin.role,
  });

  return buildAuthResponse({
    superadmin,
    accessToken,
    refreshToken,
    session,
  });
}

async function refreshSession(payload = {}) {
  const refreshToken = String(payload.refreshToken || "");
  const { session, refreshToken: rotatedRefreshToken } = await sessionService.rotateRefreshSession(
    refreshToken,
    normalizeSessionInput(payload),
  );
  const superadmin = await Superadmin.findById(session.superadminId);

  await assertSuperadminUsable(superadmin);

  const accessToken = signAccessToken({
    superadminId: superadmin._id,
    sessionId: session.tokenId,
    role: superadmin.role,
  });

  return buildAuthResponse({
    superadmin,
    accessToken,
    refreshToken: rotatedRefreshToken,
    session,
  });
}

async function logout({ superadminId, sessionId, revokeAll = false }) {
  if (!superadminId) {
    throw AppError.unauthorized("Authenticated superadmin is required");
  }

  const revokedCount = revokeAll
    ? await sessionService.revokeAllSuperadminSessions(superadminId, "logout_all")
    : Number(Boolean(await sessionService.revokeSessionById(sessionId, {
        superadminId,
        reason: "logout",
      })));

  return {
    revokedCount,
    revokedScope: revokeAll ? "all" : "current",
  };
}

async function getCurrentSuperadmin(superadminId) {
  const superadmin = await Superadmin.findById(superadminId);
  await assertSuperadminUsable(superadmin);
  return buildSuperadminPayload(superadmin);
}

module.exports = {
  getCurrentSuperadmin,
  login,
  logout,
  refreshSession,
};
