const jwt = require("jsonwebtoken");

const logger = require("../common/utils/logger");
const securityConfig = require("../config/security");
const Superadmin = require("../Modules/superadmin/model");
const sessionService = require("../Modules/superadmin-auth/session.service");
const { AppError } = require("../helpers/errors");

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

function logAuthFailure(req, reason, error) {
  logger.warn("Superadmin token verification failed", {
    reason,
    requestId: req.requestId || null,
    path: req.originalUrl || req.url || "",
    method: req.method,
    ip: req.ip || null,
    error: error?.message || "",
  });
}

function getFailureReason(error) {
  const message = String(error?.message || "");
  if (message.startsWith("jwt audience invalid")) {
    return "wrong_audience";
  }

  if (message.startsWith("jwt issuer invalid")) {
    return "wrong_issuer";
  }

  if (message === "Invalid superadmin token type") {
    return "wrong_token_type";
  }

  return "invalid_superadmin_access_token";
}

function isLegacyCompatibleTokenClaims(decoded = {}) {
  return !Object.prototype.hasOwnProperty.call(decoded, "iss") &&
    !Object.prototype.hasOwnProperty.call(decoded, "aud") &&
    !Object.prototype.hasOwnProperty.call(decoded, "sub");
}

function verifySuperadminAccessToken(token) {
  try {
    return jwt.verify(token, securityConfig.superadminJwtSecret, {
      issuer: securityConfig.jwtIssuer,
      audience: securityConfig.jwtAudienceSuperadmin,
    });
  } catch (strictError) {
    const legacyDecoded = jwt.verify(token, securityConfig.superadminJwtSecret);

    if (!isLegacyCompatibleTokenClaims(legacyDecoded)) {
      throw strictError;
    }

    return legacyDecoded;
  }
}

function assertSuperadminTokenClaims(decoded = {}) {
  const tokenType = String(decoded.tokenType || "").trim();
  const subjectType = String(decoded.subjectType || "").trim();
  const subject = String(decoded.sub || "").trim();
  const superadminId = String(decoded.superadminId || "").trim();

  if (tokenType !== securityConfig.superadminAccessTokenType) {
    throw AppError.unauthorized("Invalid superadmin token type");
  }

  if (subjectType !== securityConfig.superadminSubjectType) {
    throw AppError.unauthorized("Invalid superadmin token type");
  }

  if (!superadminId) {
    throw AppError.unauthorized("Invalid superadmin token type");
  }

  if (subject && subject !== superadminId) {
    throw AppError.unauthorized("Invalid superadmin token type");
  }

  return decoded;
}

async function authenticateSuperadminAccessToken(token) {
  const decoded = assertSuperadminTokenClaims(verifySuperadminAccessToken(token));
  const superadmin = await Superadmin.findById(decoded.superadminId);

  if (!superadmin) {
    throw AppError.unauthorized("Superadmin not found for this token");
  }

  if (!securityConfig.superadminRoles.includes(superadmin.role)) {
    throw AppError.forbidden("Superadmin role is not allowed");
  }

  if (superadmin.status !== "active") {
    throw AppError.forbidden("Superadmin account is not active");
  }

  if (decoded.sessionId) {
    await sessionService.assertSessionIsActive(decoded.sessionId, superadmin._id);
  }

  return {
    decoded,
    superadmin,
    superadminSessionId: decoded.sessionId || "",
    principal: {
      _id: superadmin._id,
      email: superadmin.email,
      role: superadmin.role,
      status: superadmin.status,
      mfaEnabled: Boolean(superadmin.mfaEnabled),
    },
  };
}

async function verifySuperadminToken(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      throw AppError.unauthorized("Authorization header with Bearer token is required");
    }

    const authentication = await authenticateSuperadminAccessToken(token);
    req.superadminSessionId = authentication.superadminSessionId;
    req.superadmin = authentication.principal;

    return next();
  } catch (error) {
    logAuthFailure(req, getFailureReason(error), error);

    return next(
      error.status ? error : AppError.unauthorized("Invalid or expired superadmin access token"),
    );
  }
}

verifySuperadminToken.getBearerToken = getBearerToken;
verifySuperadminToken.verifySuperadminAccessToken = verifySuperadminAccessToken;
verifySuperadminToken.assertSuperadminTokenClaims = assertSuperadminTokenClaims;
verifySuperadminToken.authenticateSuperadminAccessToken = authenticateSuperadminAccessToken;

module.exports = verifySuperadminToken;
