const jwt = require("jsonwebtoken");

const logger = require("../common/utils/logger");
const securityConfig = require("../config/security");
const User = require("../Modules/user/model");
const sessionService = require("../Modules/security/session.service");
const { AppError } = require("../helpers/errors");

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

function logAuthFailure(req, reason, error) {
  logger.warn("User token verification failed", {
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

  if (message === "Invalid token type") {
    return "wrong_token_type";
  }

  if (message === "Invalid token subject") {
    return "wrong_subject";
  }

  return "invalid_access_token";
}

function isLegacyCompatibleTokenClaims(decoded = {}) {
  return !Object.prototype.hasOwnProperty.call(decoded, "iss") &&
    !Object.prototype.hasOwnProperty.call(decoded, "aud");
}

function verifyUserAccessToken(token) {
  try {
    return jwt.verify(token, securityConfig.jwtSecret, {
      issuer: securityConfig.jwtIssuer,
      audience: securityConfig.jwtAudienceUser,
    });
  } catch (strictError) {
    const legacyDecoded = jwt.verify(token, securityConfig.jwtSecret);

    if (!isLegacyCompatibleTokenClaims(legacyDecoded)) {
      throw strictError;
    }

    return legacyDecoded;
  }
}

function assertUserTokenClaims(decoded = {}) {
  const allowedTypes = new Set([
    securityConfig.userAccessTokenType,
    ...securityConfig.legacyUserAccessTokenTypes,
  ]);
  const tokenType = String(decoded.tokenType || "").trim();
  const subjectType = String(decoded.subjectType || "").trim();
  const subject = String(decoded.sub || "").trim();
  const userId = String(decoded.userId || "").trim();

  if (!tokenType || !allowedTypes.has(tokenType)) {
    throw AppError.unauthorized("Invalid token type");
  }

  if (subjectType && subjectType !== securityConfig.userSubjectType) {
    throw AppError.unauthorized("Invalid token subject");
  }

  if (!userId) {
    throw AppError.unauthorized("Invalid token subject");
  }

  if (subject && subject !== userId) {
    throw AppError.unauthorized("Invalid token subject");
  }

  return decoded;
}

async function authenticateAccessToken(token) {
  const decoded = assertUserTokenClaims(verifyUserAccessToken(token));
  const user = await User.findById(decoded.userId).select("-seedCipherText");

  if (!user) {
    throw AppError.unauthorized("User not found for this token");
  }

  if (user.status !== "active") {
    throw AppError.forbidden("Wallet owner profile is not active");
  }

  if (decoded.sessionId) {
    await sessionService.assertSessionIsActive(decoded.sessionId, user._id);
  }

  return {
    decoded,
    user,
    authSessionId: decoded.sessionId || "",
    principal: {
      _id: user._id,
      publicAddress: user.publicAddress || null,
      role: user.role || "user",
      status: user.status,
      primaryChain: user.primaryChain,
    },
  };
}

async function verifyToken(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      throw AppError.unauthorized("Authorization header with Bearer token is required");
    }

    const authentication = await authenticateAccessToken(token);
    req.authSessionId = authentication.authSessionId;
    req.user = authentication.principal;

    return next();
  } catch (error) {
    logAuthFailure(req, getFailureReason(error), error);

    return next(
      error.status ? error : AppError.unauthorized("Invalid or expired access token"),
    );
  }
}

verifyToken.getBearerToken = getBearerToken;
verifyToken.verifyUserAccessToken = verifyUserAccessToken;
verifyToken.assertUserTokenClaims = assertUserTokenClaims;
verifyToken.authenticateAccessToken = authenticateAccessToken;

module.exports = verifyToken;
