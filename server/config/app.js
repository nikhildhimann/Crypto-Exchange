const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

const systemFeeEnabled =
  process.env.SYSTEM_FEE_ENABLED === "true" &&
  process.env.PLATFORM_FEE_ENABLED === "true";
const demoConfig = require("./demo");
const requestLoggingEnabled =
  String(process.env.REQUEST_LOGGING_ENABLED || "").trim().toLowerCase() === "true";

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

function parseCorsOrigins(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((entry) => entry.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    ),
  );
}

module.exports = {
  appName: String(process.env.APP_NAME || "").trim(),
  nodeEnv: String(process.env.NODE_ENV || "").trim(),
  demoMode: demoConfig.enabled,
  port: Number(process.env.PORT),
  bodyLimit: String(process.env.BODY_LIMIT || "").trim(),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  socketCorsOrigins: parseCorsOrigins(process.env.SOCKET_ALLOWED_ORIGINS || process.env.CORS_ORIGIN),
  socketAllowCredentials: parseBoolean(process.env.SOCKET_ALLOW_CREDENTIALS, true),
  hsts: {
    enabled: parseBoolean(process.env.ENABLE_HSTS, true),
    maxAge: Number(process.env.HSTS_MAX_AGE || 31536000),
    includeSubdomains: parseBoolean(process.env.HSTS_INCLUDE_SUBDOMAINS, true),
    preload: parseBoolean(process.env.HSTS_PRELOAD, false),
  },
  apiPrefix: String(process.env.API_PREFIX || "").trim(),
  requestLoggingEnabled,
  systemWallet: {
    address: (process.env.SYSTEM_WALLET_ADDRESS || "").trim(),
    secret: (process.env.SYSTEM_WALLET_SECRET || "").trim(),
  },
  systemFee: {
    enabled: systemFeeEnabled,
  },
  platformFee: {
    enabled: systemFeeEnabled,
    type: process.env.PLATFORM_FEE_TYPE || "fixed",
    value: process.env.PLATFORM_FEE_VALUE || "0",
  },
};
