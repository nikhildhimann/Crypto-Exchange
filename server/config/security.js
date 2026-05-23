const crypto = require("crypto");

const logger = require("../common/utils/logger");

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

function parseInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

let developmentSuperadminJwtSecret = "";
let hasWarnedAboutDevelopmentSuperadminSecret = false;

function resolveDedicatedSuperadminSecret() {
  const configuredSecret = String(process.env.SUPERADMIN_JWT_SECRET || "").trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv !== "production") {
    if (!developmentSuperadminJwtSecret) {
      developmentSuperadminJwtSecret = crypto.randomBytes(64).toString("hex");
    }

    if (!hasWarnedAboutDevelopmentSuperadminSecret) {
      hasWarnedAboutDevelopmentSuperadminSecret = true;
      logger.warn(
        "SUPERADMIN_JWT_SECRET is missing outside production; using an isolated ephemeral development secret and existing superadmin sessions will reset on restart",
      );
    }

    return developmentSuperadminJwtSecret;
  }

  return "";
}

module.exports = {
  jwtSecret: String(process.env.JWT_SECRET || "").trim(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  accessTokenExpiresIn:
    process.env.ACCESS_TOKEN_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "1d",
  refreshTokenTtlMs: Number(process.env.REFRESH_TOKEN_TTL_MS || 30 * 24 * 60 * 60 * 1000),
  superadminJwtSecret: resolveDedicatedSuperadminSecret(),
  superadminAccessTokenExpiresIn:
    process.env.SUPERADMIN_ACCESS_TOKEN_EXPIRES_IN ||
    process.env.ACCESS_TOKEN_EXPIRES_IN ||
    process.env.JWT_EXPIRES_IN ||
    "15m",
  jwtIssuer: String(process.env.JWT_ISSUER || "wallet-backend").trim() || "wallet-backend",
  jwtAudienceUser:
    String(process.env.JWT_AUDIENCE_USER || "wallet-users").trim() || "wallet-users",
  jwtAudienceSuperadmin:
    String(process.env.JWT_AUDIENCE_SUPERADMIN || "wallet-superadmins").trim() ||
    "wallet-superadmins",
  userAccessTokenType: "user_access",
  legacyUserAccessTokenTypes: ["access"],
  userSubjectType: "user",
  superadminAccessTokenType: "superadmin_access",
  superadminSubjectType: "superadmin",
  superadminRefreshTokenTtlMs: Number(
    process.env.SUPERADMIN_REFRESH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000,
  ),
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 10),
  encryptionKey: String(process.env.ENCRYPTION_KEY || "").trim(),
  roles: ["superadmin", "admin", "user"],
  superadminRoles: ["superadmin", "admin"],
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120),
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000),
  authRateLimitMaxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || 10),
  superadminAuthRateLimitWindowMs: Number(
    process.env.SUPERADMIN_AUTH_RATE_LIMIT_WINDOW_MS ||
      process.env.AUTH_RATE_LIMIT_WINDOW_MS ||
      60_000,
  ),
  superadminAuthRateLimitMaxRequests: Number(
    process.env.SUPERADMIN_AUTH_RATE_LIMIT_MAX_REQUESTS ||
      process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ||
      10,
  ),
  transactionRateLimitWindowMs: Number(process.env.TRANSACTION_RATE_LIMIT_WINDOW_MS || 60_000),
  transactionRateLimitMaxRequests: Number(process.env.TRANSACTION_RATE_LIMIT_MAX_REQUESTS || 30),
  walletMutationRateLimitWindowMs: Number(process.env.WALLET_MUTATION_RATE_LIMIT_WINDOW_MS || 60_000),
  walletMutationRateLimitMaxRequests: Number(process.env.WALLET_MUTATION_RATE_LIMIT_MAX_REQUESTS || 10),
  idempotencyTtlMs: Number(process.env.IDEMPOTENCY_TTL_MS || 15 * 60 * 1000),
  superadminMaxConcurrentSessions: Number(
    process.env.SUPERADMIN_MAX_CONCURRENT_SESSIONS || 5,
  ),
  sessionInactivityTimeoutMs: Number(
    process.env.SESSION_INACTIVITY_TIMEOUT_MS || 30 * 60 * 1000,
  ),
  queryTimeoutMs: Number(process.env.QUERY_TIMEOUT_MS || 30 * 1000),
  maxQueryStringLength: Number(process.env.MAX_QUERY_STRING_LENGTH || 2000),
  captcha: {
    provider: String(process.env.CAPTCHA_PROVIDER || "none").trim().toLowerCase() || "none",
    secretKey: String(process.env.CAPTCHA_SECRET_KEY || "").trim(),
    verifyTimeoutMs: Number(process.env.CAPTCHA_VERIFY_TIMEOUT_MS || 5000),
    enforceOnAuth: parseBoolean(process.env.CAPTCHA_ENFORCE_ON_AUTH, false),
    enforceOnAnonSession: parseBoolean(process.env.CAPTCHA_ENFORCE_ON_ANON_SESSION, false),
    enforceOnWalletImport: parseBoolean(process.env.CAPTCHA_ENFORCE_ON_WALLET_IMPORT, false),
  },
  withdrawalRisk: {
    maxPerTx: String(process.env.WITHDRAWAL_MAX_PER_TX || "50000").trim() || "50000",
    maxPerHour: String(process.env.WITHDRAWAL_MAX_PER_HOUR || "100000").trim() || "100000",
    maxPerDay: String(process.env.WITHDRAWAL_MAX_PER_DAY || "300000").trim() || "300000",
    maxCountPerHour: parseInteger(process.env.WITHDRAWAL_MAX_COUNT_PER_HOUR, 3),
    maxCountPerDay: parseInteger(process.env.WITHDRAWAL_MAX_COUNT_PER_DAY, 10),
    newDestinationCooldownMinutes: parseInteger(
      process.env.WITHDRAWAL_NEW_DESTINATION_COOLDOWN_MINUTES,
      60,
    ),
    reviewHighAmount:
      String(process.env.WITHDRAWAL_REVIEW_HIGH_AMOUNT || "40000").trim() || "40000",
    blockOnRisk: parseBoolean(process.env.WITHDRAWAL_BLOCK_ON_RISK, false),
    requireReviewOnNewDestination: parseBoolean(
      process.env.WITHDRAWAL_REQUIRE_REVIEW_ON_NEW_DESTINATION ??
        process.env.WITHDRAWAL_NEW_DESTINATION_REQUIRE_REVIEW,
      true,
    ),
  },
};
