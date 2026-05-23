const logger = require("../common/utils/logger");
const { AccountId, Hbar, PrivateKey } = require("@hashgraph/sdk");
const { AppError } = require("../helpers/errors");
const swapConfig = require("./swap");
const {
  assertSupportedChainNetwork,
  getEnabledChains,
  listConfiguredChains,
} = require("./chains");

const PLACEHOLDER_VALUE_PATTERN =
  /(change[-_ ]?me|replace[-_ ]?with|your[_-]|example\.com|your_key_here|placeholder|dummy)/i;

function parseCommaSeparatedValues(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateCorsOriginAllowlist(value) {
  const origins = parseCommaSeparatedValues(value);

  if (!origins.length) {
    return "CORS_ORIGIN must contain at least one allowed origin";
  }

  if (origins.includes("*")) {
    return "CORS_ORIGIN wildcard (*) is not allowed when credentials are enabled";
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return "CORS_ORIGIN entries must use http or https";
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");
      if (
        parsed.origin !== normalizedOrigin ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      ) {
        return "CORS_ORIGIN entries must be exact origins without paths, query strings, or fragments";
      }
    } catch (_error) {
      return "CORS_ORIGIN entries must be valid absolute origins";
    }
  }

  return null;
}

const CORE_REQUIRED_ENV_VARS = {
  DEMO_MODE: {
    description: "Disable automated external API-heavy workers for demo deployments",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  APP_NAME: {
    description: "Application name used in logs and health responses",
    minLength: 1,
  },
  DEFAULT_CHAIN: {
    description: "Default enabled chain code",
    validate(value) {
      const supportedChainCodes = new Set(
        listConfiguredChains().map((chain) => String(chain.code || "").toLowerCase()),
      );
      const normalized = String(value || "").trim().toLowerCase();

      if (!supportedChainCodes.has(normalized)) {
        return `must be one of: ${Array.from(supportedChainCodes).sort().join(", ")}`;
      }

      return null;
    },
  },
  JWT_SECRET: {
    description: "JWT secret for session authentication",
    minLength: 32,
  },
  SUPERADMIN_JWT_SECRET: {
    description: "Dedicated JWT secret for superadmin authentication",
    minLength: 32,
    optional(env) {
      return String(env.NODE_ENV || "").trim() !== "production";
    },
  },
  ENCRYPTION_KEY: {
    description: "Encryption key for mnemonic storage",
    minLength: 32,
  },
  DB_URI: {
    description: "MongoDB connection URI",
    pattern: /^mongodb(\+srv)?:\/\//,
  },
  NODE_ENV: {
    description: "Environment (development/production)",
    pattern: /^(development|production)$/,
  },
  PORT: {
    description: "Server port",
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return "PORT must be an integer between 1 and 65535";
      }

      return null;
    },
  },
  BODY_LIMIT: {
    description: "Maximum request body size for Express parsers",
    pattern: /^\d+(b|kb|mb|gb)$/i,
  },
  API_PREFIX: {
    description: "API prefix for routes",
    pattern: /^\/[A-Za-z0-9/_-]*$/,
  },
  REQUEST_LOGGING_ENABLED: {
    description: "Enable or disable structured HTTP request logs",
    pattern: /^(true|false)$/i,
  },
  QUEUE_ENABLED: {
    description: "Enable background job scheduler",
    pattern: /^(true|false)$/i,
  },
  JOBS_ENABLED: {
    description: "Primary toggle for background job scheduler",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  DEPOSIT_WATCHER_ENABLED: {
    description: "Enable deposit watcher job",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  WITHDRAWAL_STATUS_ENABLED: {
    description: "Enable withdrawal status job",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  BALANCE_SYNC_ENABLED: {
    description: "Enable balance sync job",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  SESSION_CLEANUP_ENABLED: {
    description: "Enable session cleanup job",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  TREASURY_RECONCILE_ENABLED: {
    description: "Enable treasury reconcile job",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  NFT_RECONCILIATION_ENABLED: {
    description: "Enable NFT transfer reconciliation runner",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  NFT_HISTORY_SYNC_ENABLED: {
    description: "Enable NFT history sync worker",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  NFT_RECONCILIATION_INTERVAL_MS: {
    description: "NFT transfer reconciliation runner interval in milliseconds",
    optional: true,
    validate(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 3600000) {
        return "must be an integer between 1000 and 3600000";
      }

      return null;
    },
  },
  NFT_RECONCILIATION_BATCH_LIMIT: {
    description: "NFT transfer reconciliation batch size",
    optional: true,
    validate(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
        return "must be an integer between 1 and 100";
      }

      return null;
    },
  },
  OPENSEA_API_KEY: {
    description: "OpenSea API v2 key for NFT marketplace",
    minLength: 8,
    optional: (env) => env.NFT_MARKETPLACE_ENABLED !== "true",
  },
  OPENSEA_BASE_URL: {
    description: "OpenSea V2 API base URL",
    optional: true,
    validate(value) {
      if (!value) return null;
      try {
        new URL(value);
        return null;
      } catch (e) {
        return "must be a valid URL";
      }
    }
  },
  NFT_MARKETPLACE_ENABLED: {
    description: "Enable/disable NFT marketplace features",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  NFT_MARKETPLACE_DEFAULT_CHAIN: {
    description: "Default chain for marketplace operations",
    optional: true,
    validate(value) {
      if (!value) return null;
      const valid = ["polygon", "ethereum", "base"];
      if (!valid.includes(value.toLowerCase())) {
        return `must be one of: ${valid.join(", ")}`;
      }
      return null;
    }
  },
  NFT_LISTING_MIN_PRICE_MATIC: {
    description: "Minimum NFT listing price in MATIC",
    optional: true,
    validate(value) {
      const parsed = Number.parseFloat(String(value || "").trim());
      if (Number.isNaN(parsed) || parsed <= 0) {
        return "must parse to a positive float";
      }
      return null;
    },
  },
  NFT_LISTING_MAX_PRICE_MATIC: {
    description: "Maximum NFT listing price in MATIC",
    optional: true,
    validate(value) {
      const parsed = Number.parseFloat(String(value || "").trim());
      if (Number.isNaN(parsed) || parsed <= 0) {
        return "must parse to a positive float";
      }
      return null;
    },
  },
  NFT_BUY_MAX_PRICE_FLOOR_MULTIPLIER: {
    description: "Max price multiplier vs floor price before rejecting a buy",
    optional: true,
    validate(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return "must parse to a positive integer >= 1";
      }
      return null;
    },
  },
  CORS_ORIGIN: {
    description: "Comma-separated exact origin allowlist for CORS",
    validate: validateCorsOriginAllowlist,
  },
  ALCHEMY_API_KEY: {
    description: "Alchemy API key (NFT floor price fallback)",
    minLength: 8,
    optional: (env) => env.NFT_MARKETPLACE_ENABLED !== "true",
    validate(value) {
      const normalized = String(value || "").trim();
      if (normalized && /\s/.test(normalized)) {
        return "must not contain whitespace";
      }

      return null;
    },
  },
  ALCHEMY_POLYGON_NFT_BASE_URL: {
    description: "Optional override for Polygon Alchemy NFT API base URL",
    optional: true,
    validate(value) {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return null;
      }

      try {
        const parsed = new URL(normalized);
        if (!/alchemy\.com$/i.test(parsed.hostname)) {
          return "must point to an Alchemy host";
        }

        if (!/\/nft\/v3\/[^/]+\/?$/.test(parsed.pathname)) {
          return "must look like https://polygon-mainnet.g.alchemy.com/nft/v3/<apiKey>";
        }

        if (parsed.search || parsed.hash) {
          return "must not include query strings or fragments";
        }
      } catch (_error) {
        return "must be a valid absolute URL";
      }

      return null;
    },
  },
  NFT_SYNC_TTL_SECONDS: {
    description: "NFT sync cache TTL in seconds",
    optional: true,
    validate(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 86400) {
        return "must be an integer between 1 and 86400";
      }

      return null;
    },
  },
  NFT_PAGE_SIZE: {
    description: "Alchemy NFT page size",
    optional: true,
    validate(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
        return "must be an integer between 1 and 100";
      }

      return null;
    },
  },
  ALCHEMY_NFT_MAX_PAGES: {
    description: "Maximum provider pages to fetch during NFT sync",
    optional: true,
    validate(value) {
      const parsed = Number.parseInt(String(value || "").trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 250) {
        return "must be an integer between 1 and 250";
      }

      return null;
    },
  },
};

const RECOMMENDED_ENV_VARS = {
  PLATFORM_TRANSFER_SETTLEMENT_MODE: {
    description:
      "Platform transfer settlement mode (metadata_only, onchain, or local_internal)",
    pattern: /^(metadata_only|onchain|local_internal)$/,
  },
};

const JWT_METADATA_ENV_VARS = {
  JWT_ISSUER: {
    description: "JWT issuer for access token signing and verification",
    minLength: 1,
    optional: true,
  },
  JWT_AUDIENCE_USER: {
    description: "JWT audience for user access tokens",
    minLength: 1,
    optional: true,
  },
  JWT_AUDIENCE_SUPERADMIN: {
    description: "JWT audience for superadmin access tokens",
    minLength: 1,
    optional: true,
  },
};

const SOCKET_ENV_VARS = {
  SOCKET_ALLOWED_ORIGINS: {
    description:
      "Comma-separated exact origin allowlist for Socket.IO handshakes; falls back to CORS_ORIGIN when omitted",
    validate: validateCorsOriginAllowlist,
    optional: true,
  },
  SOCKET_ALLOW_CREDENTIALS: {
    description: "Enable or disable credential support for Socket.IO CORS",
    pattern: /^(true|false)$/i,
    optional: true,
  },
};

function validateBase6432ByteKey(value) {
  try {
    const decoded = Buffer.from(String(value || "").trim(), "base64");
    if (decoded.length !== 32) {
      return "must decode to exactly 32 bytes";
    }
  } catch (_error) {
    return "must be a valid base64-encoded 32-byte key";
  }

  return null;
}

const HSTS_ENV_VARS = {
  ENABLE_HSTS: {
    description: "Enable Strict-Transport-Security on secure production requests",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  HSTS_MAX_AGE: {
    description: "HSTS max-age in seconds",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return "must be a non-negative integer in seconds";
      }

      return null;
    },
  },
  HSTS_INCLUDE_SUBDOMAINS: {
    description: "Include subdomains in the HSTS policy",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  HSTS_PRELOAD: {
    description: "Advertise the HSTS preload directive",
    pattern: /^(true|false)$/i,
    optional: true,
  },
};

const WEBHOOK_ENV_VARS = {
  TRON_WEBHOOK_SECRET: {
    description: "Shared secret for authenticating Tron webhook requests",
    minLength: 32,
    optional(env) {
      return env.NODE_ENV !== "production";
    },
  },
  BTC_WEBHOOK_SECRET: {
    description: "Shared secret for authenticating BTC webhook requests",
    minLength: 32,
    optional(env) {
      return env.NODE_ENV !== "production";
    },
  },
  WEBHOOK_TIMESTAMP_TOLERANCE: {
    description: "Allowed webhook timestamp drift in milliseconds",
    optional(env) {
      return env.NODE_ENV !== "production";
    },
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return "must be a positive integer in milliseconds";
      }

      return null;
    },
  },
};

const REDIS_ENV_VARS = {
  REDIS_URL: {
    description: "Redis connection URL for shared security and cache coordination",
    pattern: /^rediss?:\/\//i,
    optional(env) {
      return !(
        String(env.NODE_ENV || "").trim() === "production" &&
        String(env.REDIS_REQUIRED_IN_PRODUCTION || "").trim().toLowerCase() === "true"
      );
    },
  },
  REDIS_PREFIX: {
    description: "Redis key prefix namespace",
    minLength: 1,
    optional: true,
  },
  REDIS_TLS: {
    description: "Enable TLS for Redis connections",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  REDIS_CONNECT_TIMEOUT_MS: {
    description: "Redis connection timeout in milliseconds",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return "must be a positive integer in milliseconds";
      }

      return null;
    },
  },
  REDIS_COMMAND_TIMEOUT_MS: {
    description: "Redis command timeout in milliseconds",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return "must be a positive integer in milliseconds";
      }

      return null;
    },
  },
  REDIS_REQUIRED_IN_PRODUCTION: {
    description: "Fail startup when Redis is unavailable in production",
    pattern: /^(true|false)$/i,
    optional: true,
  },
};

const CAPTCHA_ENV_VARS = {
  CAPTCHA_PROVIDER: {
    description: "Captcha provider (none, turnstile, hcaptcha, recaptcha)",
    pattern: /^(none|turnstile|hcaptcha|recaptcha)$/i,
    optional: true,
  },
  CAPTCHA_SECRET_KEY: {
    description: "Secret key used to verify captcha tokens",
    minLength: 8,
    optional(env) {
      const provider = String(env.CAPTCHA_PROVIDER || "none").trim().toLowerCase();
      const enforced =
        String(env.CAPTCHA_ENFORCE_ON_AUTH || "").trim().toLowerCase() === "true" ||
        String(env.CAPTCHA_ENFORCE_ON_ANON_SESSION || "").trim().toLowerCase() === "true" ||
        String(env.CAPTCHA_ENFORCE_ON_WALLET_IMPORT || "").trim().toLowerCase() === "true";

      return provider === "none" || !enforced;
    },
  },
  CAPTCHA_VERIFY_TIMEOUT_MS: {
    description: "Timeout for captcha verification requests in milliseconds",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return "must be a positive integer in milliseconds";
      }

      return null;
    },
  },
  CAPTCHA_ENFORCE_ON_AUTH: {
    description: "Enable captcha enforcement for auth login routes",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  CAPTCHA_ENFORCE_ON_ANON_SESSION: {
    description: "Enable captcha enforcement for anonymous session creation routes",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  CAPTCHA_ENFORCE_ON_WALLET_IMPORT: {
    description: "Enable captcha enforcement for wallet/account import routes",
    pattern: /^(true|false)$/i,
    optional: true,
  },
};

const SECRETS_HYGIENE_ENV_VARS = {
  AES_SECRET_KEY_BASE64: {
    description: "Optional base64-encoded 32-byte AES key for seed encryption",
    optional: true,
    validate: validateBase6432ByteKey,
  },
  ENCRYPTION_KEY_BASE64: {
    description: "Optional base64-encoded 32-byte AES key alias for seed encryption",
    optional: true,
    validate: validateBase6432ByteKey,
  },
};

const WITHDRAWAL_RISK_ENV_VARS = {
  WITHDRAWAL_MAX_PER_TX: {
    description: "Maximum allowed amount per single withdrawal request",
    pattern: /^\d+(\.\d+)?$/,
    optional: true,
  },
  WITHDRAWAL_MAX_PER_HOUR: {
    description: "Maximum total withdrawal amount allowed per rolling hour",
    pattern: /^\d+(\.\d+)?$/,
    optional: true,
  },
  WITHDRAWAL_MAX_PER_DAY: {
    description: "Maximum total withdrawal amount allowed per rolling day",
    pattern: /^\d+(\.\d+)?$/,
    optional: true,
  },
  WITHDRAWAL_MAX_COUNT_PER_HOUR: {
    description: "Maximum number of withdrawal requests allowed per rolling hour",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return "must be a non-negative integer";
      }

      return null;
    },
  },
  WITHDRAWAL_MAX_COUNT_PER_DAY: {
    description: "Maximum number of withdrawal requests allowed per rolling day",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return "must be a non-negative integer";
      }

      return null;
    },
  },
  WITHDRAWAL_NEW_DESTINATION_COOLDOWN_MINUTES: {
    description: "Cooldown window in minutes applied to newly seen withdrawal destinations",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return "must be a non-negative integer in minutes";
      }

      return null;
    },
  },
  WITHDRAWAL_REVIEW_HIGH_AMOUNT: {
    description: "Amount threshold above which withdrawals require review",
    pattern: /^\d+(\.\d+)?$/,
    optional: true,
  },
  WITHDRAWAL_BLOCK_ON_RISK: {
    description: "Block severe withdrawal risk combinations instead of holding for review",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  WITHDRAWAL_REQUIRE_REVIEW_ON_NEW_DESTINATION: {
    description: "Require manual review for new withdrawal destinations during cooldown",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  WITHDRAWAL_NEW_DESTINATION_REQUIRE_REVIEW: {
    description: "Legacy alias for requiring review on new withdrawal destinations",
    pattern: /^(true|false)$/i,
    optional: true,
  },
};

const SWAP_ENV_VARS = {
  SWAP_ENABLED: {
    description: "Enable native-to-native swap preview functionality",
    pattern: /^(true|false)$/i,
    optional: true,
  },
  SWAP_PREVIEW_TTL_SECONDS: {
    description: "Seconds before a swap quote expires",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return "must be a positive integer number of seconds";
      }

      return null;
    },
  },
  SWAP_SERVICE_FEE_BPS: {
    description: "Swap service fee in basis points",
    optional: true,
    validate(value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) {
        return "must be an integer between 0 and 10000";
      }

      return null;
    },
  },
  SWAP_MIN_USD_EQUIVALENT: {
    description: "Minimum allowed swap size in USD equivalent",
    optional: true,
    pattern: /^\d+(\.\d+)?$/,
  },
  SWAP_MAX_USD_EQUIVALENT: {
    description: "Maximum allowed swap size in USD equivalent",
    optional: true,
    pattern: /^\d+(\.\d+)?$/,
  },
  SWAP_SYSTEM_WALLETS: {
    description:
      "JSON object of native treasury swap wallets keyed by runtime-supported chain:network for source collection and destination payout",
    optional(env) {
      return String(env.SWAP_ENABLED || "").trim().toLowerCase() !== "true";
    },
  },
};

function normalizeRuntimeNetworkCodes(chain) {
  return new Set(
    Array.isArray(chain?.supportedNetworks)
      ? chain.supportedNetworks.map((network) => String(network.code || "").toLowerCase())
      : [],
  );
}

function shouldValidateChainEnvVar(entry, runtimeNetworks) {
  if (!Array.isArray(entry?.networks) || !entry.networks.length) {
    return true;
  }

  return entry.networks.some((network) =>
    runtimeNetworks.has(String(network || "").toLowerCase()));
}

function isEnvEntryOptional(config) {
  if (typeof config?.optional === "function") {
    return Boolean(config.optional(process.env));
  }

  return Boolean(config?.optional);
}

function applyProductionValidator(entry, value, errors) {
  if (process.env.NODE_ENV !== "production" || !entry?.productionValidator) {
    return;
  }

  const validator = String(entry.productionValidator).trim();

  if (validator === "mainnetUrl") {
    if (/(testnet|devnet|altnet)/i.test(String(value || ""))) {
      errors.push(
        `Production environment requires mainnet-compatible URLs for ${entry.name}`,
      );
    }

    return;
  }

  if (validator.startsWith("chainId:")) {
    const expected = validator.slice("chainId:".length);
    if (String(value || "").trim() !== expected) {
      errors.push(
        `Production environment requires ${entry.name} to equal ${expected}`,
      );
    }
  }
}

function validateEnvEntry(varName, config, issues) {
  const value = process.env[varName];

  if (!value) {
    if (isEnvEntryOptional(config)) {
      return;
    }

    issues.missing.push(`${varName}: ${config.description}`);
    return;
  }

  if (config.minLength && value.length < config.minLength) {
    issues.invalid.push(
      `${varName}: must be at least ${config.minLength} characters long`,
    );
  }

  if (config.pattern && !config.pattern.test(value)) {
    issues.invalid.push(
      `${varName}: invalid format for ${config.description}`,
    );
  }

  if (PLACEHOLDER_VALUE_PATTERN.test(String(value || "").trim())) {
    issues.invalid.push(
      `${varName}: must be set to a real value and not a placeholder`,
    );
  }

  if (typeof config.validate === "function") {
    const validationResult = config.validate(value, process.env);

    if (typeof validationResult === "string" && validationResult.trim()) {
      issues.invalid.push(`${varName}: ${validationResult.trim()}`);
    }
  }

  const productionErrors = [];
  applyProductionValidator({ ...config, name: varName }, value, productionErrors);
  for (const entry of productionErrors) {
    issues.invalid.push(`${varName}: ${entry}`);
  }
}

function getDynamicChainEnvRequirements() {
  return getEnabledChains().flatMap((chain) => {
    const runtimeNetworks = normalizeRuntimeNetworkCodes(chain);
    const entries =
      Array.isArray(chain?.env?.vars) ? chain.env.vars : [];

    return entries
      .filter((entry) => shouldValidateChainEnvVar(entry, runtimeNetworks))
      .map((entry) => ({
        name: entry.name,
        config: entry,
      }));
  });
}

function getRequiredEnvVars() {
  return {
    ...CORE_REQUIRED_ENV_VARS,
    ...SOCKET_ENV_VARS,
    ...HSTS_ENV_VARS,
    ...WEBHOOK_ENV_VARS,
    ...REDIS_ENV_VARS,
    ...CAPTCHA_ENV_VARS,
    ...SECRETS_HYGIENE_ENV_VARS,
    ...WITHDRAWAL_RISK_ENV_VARS,
    ...JWT_METADATA_ENV_VARS,
    ...Object.fromEntries(
      getDynamicChainEnvRequirements()
        .filter(({ config }) => !isEnvEntryOptional(config))
        .map(({ name, config }) => [name, config]),
    ),
  };
}

function validateHbarProvisioningEnv(errors) {
  const hbarChain = getEnabledChains().find((chain) => chain?.code === "hbar");
  if (!hbarChain) {
    return;
  }

  const runtimeNetworks = normalizeRuntimeNetworkCodes(hbarChain);
  const hbarInitialBalance = String(
    process.env.HBAR_ACCOUNT_CREATE_INITIAL_BALANCE || "",
  ).trim();

  for (const network of runtimeNetworks) {
    const operatorIdVar =
      network === "mainnet" ? "HBAR_MAINNET_OPERATOR_ID" : "HBAR_TESTNET_OPERATOR_ID";
    const operatorKeyVar =
      network === "mainnet" ? "HBAR_MAINNET_OPERATOR_KEY" : "HBAR_TESTNET_OPERATOR_KEY";
    const operatorId = process.env[operatorIdVar];
    const operatorKey = process.env[operatorKeyVar];
    const hasOperatorId = Boolean(String(operatorId || "").trim());
    const hasOperatorKey = Boolean(String(operatorKey || "").trim());

    if (!hasOperatorId || !hasOperatorKey) {
      errors.push(
        `${operatorIdVar} and ${operatorKeyVar} are required for real Hedera wallet creation on ${network}`,
      );
      continue;
    }

    try {
      AccountId.fromString(String(operatorId).trim());
    } catch (_error) {
      errors.push(`Environment variable ${operatorIdVar} must be a valid Hedera account ID`);
    }

    try {
      PrivateKey.fromString(String(operatorKey).trim());
    } catch (_error) {
      errors.push(
        `Environment variable ${operatorKeyVar} must be a valid Hedera private key for provisioning`,
      );
    }
  }

  if (!hbarInitialBalance) {
    errors.push(
      "Environment variable HBAR_ACCOUNT_CREATE_INITIAL_BALANCE is required for real Hedera wallet creation",
    );
    return;
  }

  try {
    const hbarAmount = Hbar.fromString(hbarInitialBalance);
    if (BigInt(hbarAmount.toTinybars().toString()) <= 0n) {
      errors.push("Environment variable HBAR_ACCOUNT_CREATE_INITIAL_BALANCE must be greater than zero");
    }
  } catch (_error) {
    errors.push(
      "Environment variable HBAR_ACCOUNT_CREATE_INITIAL_BALANCE must be a valid positive HBAR amount",
    );
  }
}

function validateSystemWalletEnv(errors) {
  const systemFeeEnabled =
    process.env.SYSTEM_FEE_ENABLED === "true" &&
    process.env.PLATFORM_FEE_ENABLED === "true";

  if (!systemFeeEnabled) {
    return;
  }

  const address = String(process.env.SYSTEM_WALLET_ADDRESS || "").trim();
  const secret = String(process.env.SYSTEM_WALLET_SECRET || "").trim();

  if (!address || !secret) {
    errors.push(
      "SYSTEM_WALLET_ADDRESS and SYSTEM_WALLET_SECRET are required when system fee collection is enabled",
    );
    return;
  }

  if (
    PLACEHOLDER_VALUE_PATTERN.test(address) ||
    PLACEHOLDER_VALUE_PATTERN.test(secret)
  ) {
    errors.push(
      "SYSTEM_WALLET_ADDRESS and SYSTEM_WALLET_SECRET must be real values when system fee collection is enabled",
    );
  }
}

function validateSwapConfigEnv(errors, warnings) {
  const issues = swapConfig.getValidationIssues();

  for (const entry of issues.invalid) {
    errors.push(entry);
  }

  for (const entry of issues.warnings) {
    warnings.push(entry);
  }
}

function validateEnvironment() {
  const issues = {
    missing: [],
    invalid: [],
  };
  const warnings = [];
  const dynamicChainEnvRequirements = getDynamicChainEnvRequirements();
  const requiredEnvVars = getRequiredEnvVars();

  for (const [varName, config] of Object.entries(requiredEnvVars)) {
    validateEnvEntry(varName, config, issues);
  }

  for (const [varName, config] of Object.entries(RECOMMENDED_ENV_VARS)) {
    const value = process.env[varName];

    if (!value) {
      warnings.push(
        `Recommended environment variable ${varName} is missing: ${config.description}`,
      );
      continue;
    }

    if (config.pattern && !config.pattern.test(value)) {
      warnings.push(
        `Environment variable ${varName} has invalid format: ${config.description}`,
      );
    }
  }

  if (process.env.NODE_ENV !== "production") {
    for (const [varName, config] of Object.entries(WEBHOOK_ENV_VARS)) {
      if (!process.env[varName]) {
        warnings.push(
          `Webhook environment variable ${varName} is missing: ${config.description}`,
        );
      }
    }
  }

  if (!process.env.REDIS_URL) {
    warnings.push(
      "Redis is not configured; distributed cache and coordination features will run in degraded mode until REDIS_URL is provided",
    );
  }

  if (
    String(process.env.CAPTCHA_PROVIDER || "none").trim().toLowerCase() !== "none" &&
    !process.env.CAPTCHA_SECRET_KEY
  ) {
    warnings.push(
      "CAPTCHA_PROVIDER is configured but CAPTCHA_SECRET_KEY is missing; captcha enforcement will fail closed if enabled",
    );
  }

  for (const { name, config } of dynamicChainEnvRequirements.filter(({ config }) => isEnvEntryOptional(config))) {
    validateEnvEntry(name, config, issues);
  }

  if (process.env.JWT_SECRET === process.env.ENCRYPTION_KEY) {
    issues.invalid.push("JWT_SECRET / ENCRYPTION_KEY: must be different values for security");
  }

  if (
    process.env.JWT_SECRET &&
    process.env.SUPERADMIN_JWT_SECRET &&
    process.env.JWT_SECRET === process.env.SUPERADMIN_JWT_SECRET
  ) {
    issues.invalid.push(
      "JWT_SECRET / SUPERADMIN_JWT_SECRET: must be different values to preserve auth isolation",
    );
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 64) {
    if (process.env.NODE_ENV === "production") {
      issues.invalid.push("JWT_SECRET must be at least 64 characters in production");
    } else {
      warnings.push("JWT_SECRET should be at least 64 characters for better security");
    }
  }

  if (!process.env.SUPERADMIN_JWT_SECRET && process.env.NODE_ENV !== "production") {
    warnings.push(
      "SUPERADMIN_JWT_SECRET is missing outside production; an isolated ephemeral development secret will be used and superadmin sessions will reset on restart",
    );
  }

  if (process.env.SUPERADMIN_JWT_SECRET && process.env.SUPERADMIN_JWT_SECRET.length < 64) {
    if (process.env.NODE_ENV === "production") {
      issues.invalid.push(
        "SUPERADMIN_JWT_SECRET must be at least 64 characters in production",
      );
    } else {
      warnings.push("SUPERADMIN_JWT_SECRET should be at least 64 characters for better security");
    }
  }

  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 64) {
    if (process.env.NODE_ENV === "production") {
      issues.invalid.push("ENCRYPTION_KEY must be at least 64 characters in production");
    } else {
      warnings.push("ENCRYPTION_KEY should be at least 64 characters for better security");
    }
  }

  if (
    process.env.AES_SECRET_KEY_BASE64 &&
    process.env.ENCRYPTION_KEY_BASE64 &&
    String(process.env.AES_SECRET_KEY_BASE64).trim() !==
      String(process.env.ENCRYPTION_KEY_BASE64).trim()
  ) {
    issues.invalid.push(
      "AES_SECRET_KEY_BASE64 / ENCRYPTION_KEY_BASE64: must match when both are provided",
    );
  }

  if (
    String(process.env.HSTS_PRELOAD || "").trim().toLowerCase() === "true" &&
    String(process.env.HSTS_INCLUDE_SUBDOMAINS || "").trim().toLowerCase() !== "true"
  ) {
    issues.invalid.push(
      "HSTS_PRELOAD / HSTS_INCLUDE_SUBDOMAINS: preload requires includeSubDomains to be enabled",
    );
  }

  validateHbarProvisioningEnv(issues.invalid);
  validateSystemWalletEnv(issues.invalid);
  validateSwapConfigEnv(issues.invalid, warnings);

  if (warnings.length > 0) {
    logger.warn("Environment validation warnings", { warnings });
  }

  if (issues.missing.length > 0 || issues.invalid.length > 0) {
    logger.error("Environment validation failed", {
      missingEnv: issues.missing,
      invalidEnv: issues.invalid,
    });

    const messageSections = ["Environment validation failed."];

    if (issues.missing.length > 0) {
      messageSections.push("Missing required environment variables:");
      messageSections.push(...issues.missing.map((entry) => `- ${entry}`));
    }

    if (issues.invalid.length > 0) {
      messageSections.push("Invalid environment variables:");
      messageSections.push(...issues.invalid.map((entry) => `- ${entry}`));
    }

    throw AppError.internal(messageSections.join("\n"));
  }

  logger.info("Environment validation passed", {
    requiredVars: Object.keys(requiredEnvVars).length,
    recommendedVars: Object.keys(RECOMMENDED_ENV_VARS).length,
    warnings: warnings.length,
  });

  return {
    passed: true,
    warnings,
    requiredVars: Object.keys(requiredEnvVars),
    recommendedVars: Object.keys(RECOMMENDED_ENV_VARS),
    webhookVars: Object.keys(WEBHOOK_ENV_VARS),
    socketVars: Object.keys(SOCKET_ENV_VARS),
    hstsVars: Object.keys(HSTS_ENV_VARS),
    redisVars: Object.keys(REDIS_ENV_VARS),
    captchaVars: Object.keys(CAPTCHA_ENV_VARS),
    secretsHygieneVars: Object.keys(SECRETS_HYGIENE_ENV_VARS),
    withdrawalRiskVars: Object.keys(WITHDRAWAL_RISK_ENV_VARS),
    swapVars: Object.keys(SWAP_ENV_VARS),
    jwtMetadataVars: Object.keys(JWT_METADATA_ENV_VARS),
  };
}

function ensureMainnetOnly(network) {
  if (network !== "mainnet") {
    throw AppError.validation(`Only mainnet network is supported. Got: ${network}`);
  }

  return network;
}

function validateChainNetwork(chain, network) {
  try {
    const resolved = assertSupportedChainNetwork(chain, network);
    return {
      chain: resolved.chain,
      network: resolved.network,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error) {
      throw AppError.validation(error.message);
    }

    throw AppError.validation("Unsupported chain/network combination");
  }
}

module.exports = {
  validateEnvironment,
  ensureMainnetOnly,
  validateChainNetwork,
  getRequiredEnvVars,
  getDynamicChainEnvRequirements,
  REQUIRED_ENV_VARS: CORE_REQUIRED_ENV_VARS,
  RECOMMENDED_ENV_VARS,
  WEBHOOK_ENV_VARS,
  SOCKET_ENV_VARS,
  HSTS_ENV_VARS,
  REDIS_ENV_VARS,
  CAPTCHA_ENV_VARS,
  SECRETS_HYGIENE_ENV_VARS,
  WITHDRAWAL_RISK_ENV_VARS,
  SWAP_ENV_VARS,
  JWT_METADATA_ENV_VARS,
};
