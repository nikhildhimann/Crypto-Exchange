const IORedis = require("ioredis");

const logger = require("../common/utils/logger");

const DEFAULT_PREFIX = "walletapp";
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5000;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getRedisConfig() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim() || "development";
  const requiredInProduction = parseBoolean(
    process.env.REDIS_REQUIRED_IN_PRODUCTION,
    false,
  );

  return {
    url: String(process.env.REDIS_URL || "").trim(),
    prefix: String(process.env.REDIS_PREFIX || DEFAULT_PREFIX).trim() || DEFAULT_PREFIX,
    tlsEnabled: parseBoolean(process.env.REDIS_TLS, false),
    connectTimeoutMs: parsePositiveInteger(
      process.env.REDIS_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS,
    ),
    commandTimeoutMs: parsePositiveInteger(
      process.env.REDIS_COMMAND_TIMEOUT_MS,
      DEFAULT_COMMAND_TIMEOUT_MS,
    ),
    nodeEnv,
    requiredInProduction,
    required: nodeEnv === "production" && requiredInProduction,
  };
}

function getSafeRedisTarget(url) {
  if (!url) {
    return "not-configured";
  }

  try {
    const parsed = new URL(url);
    const port =
      parsed.port ||
      (parsed.protocol === "rediss:" ? "6380" : parsed.protocol === "redis:" ? "6379" : "");
    const pathname = String(parsed.pathname || "").replace(/^\/+/, "");
    const database = pathname || "0";

    return `${parsed.protocol}//${parsed.hostname}${port ? `:${port}` : ""}/${database}`;
  } catch (_error) {
    return "configured";
  }
}

function normalizeKeyPart(value) {
  return String(value ?? "")
    .trim()
    .replace(/^:+|:+$/g, "");
}

class RedisManager {
  constructor() {
    this.client = null;
    this.connectionPromise = null;
    this.status = "idle";
    this.ready = false;
    this.disabledReason = "";
    this.lastErrorMessage = "";
    this.lastReconnectLogAt = 0;
  }

  get config() {
    return getRedisConfig();
  }

  get enabled() {
    return this.ready;
  }

  get configured() {
    return Boolean(this.config.url);
  }

  isReady() {
    return this.ready;
  }

  isRequired() {
    return this.config.required;
  }

  getStatus() {
    return {
      configured: this.configured,
      enabled: this.enabled,
      ready: this.ready,
      required: this.isRequired(),
      status: this.status,
      disabledReason: this.disabledReason || null,
      target: getSafeRedisTarget(this.config.url),
      prefix: this.config.prefix,
    };
  }

  buildKey(...parts) {
    const normalizedParts = [this.config.prefix, ...parts]
      .map(normalizeKeyPart)
      .filter(Boolean);

    return normalizedParts.join(":");
  }

  getKey(...parts) {
    return this.buildKey(...parts);
  }

  createClient() {
    const config = this.config;

    return new IORedis(config.url, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      commandTimeout: config.commandTimeoutMs,
      connectTimeout: config.connectTimeoutMs,
      tls: config.tlsEnabled ? {} : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 250, 2000);
        const now = Date.now();

        if (times === 1 || now - this.lastReconnectLogAt >= 30000) {
          this.lastReconnectLogAt = now;
          logger.warn("Redis reconnect scheduled", {
            attempts: times,
            delayMs: delay,
            target: getSafeRedisTarget(config.url),
          });
        }

        return delay;
      },
    });
  }

  attachListeners(client) {
    client.on("connect", () => {
      this.status = "connecting";
    });

    client.on("ready", () => {
      this.ready = true;
      this.status = "ready";
      this.disabledReason = "";
      this.lastErrorMessage = "";
      logger.info("Redis connection ready", {
        target: getSafeRedisTarget(this.config.url),
        prefix: this.config.prefix,
      });
    });

    client.on("error", (error) => {
      this.ready = false;
      this.status = "error";
      this.disabledReason = error?.message || "Redis client error";

      if (this.lastErrorMessage !== this.disabledReason) {
        this.lastErrorMessage = this.disabledReason;
        logger.error("Redis client error", {
          target: getSafeRedisTarget(this.config.url),
          error: this.disabledReason,
        });
      }
    });

    client.on("end", () => {
      this.ready = false;
      this.status = "ended";
      if (!this.disabledReason) {
        this.disabledReason = "Redis connection closed";
      }
      logger.warn("Redis connection closed", {
        target: getSafeRedisTarget(this.config.url),
      });
    });
  }

  async initialize() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const config = this.config;
    const target = getSafeRedisTarget(config.url);

    if (!config.url) {
      this.ready = false;
      this.status = "disabled";
      this.disabledReason = "REDIS_URL is not configured";

      const message = "Redis is not configured; distributed cache features are disabled";
      if (config.required) {
        throw new Error(`${message} in production because REDIS_REQUIRED_IN_PRODUCTION=true`);
      }

      logger.warn(message, {
        target,
        required: config.required,
      });
      return this.getStatus();
    }

    this.connectionPromise = (async () => {
      try {
        this.status = "connecting";
        this.client = this.createClient();
        this.attachListeners(this.client);

        logger.info("Connecting to Redis", {
          target,
          tlsEnabled: config.tlsEnabled,
          required: config.required,
        });

        await this.client.connect();
        await this.client.ping();

        return this.getStatus();
      } catch (error) {
        this.ready = false;
        this.status = "unavailable";
        this.disabledReason = error?.message || "Redis connection failed";

        if (this.client) {
          this.client.disconnect();
          this.client = null;
        }

        const message = "Redis connection unavailable";
        logger[config.required ? "error" : "warn"](message, {
          target,
          required: config.required,
          error: this.disabledReason,
        });

        if (config.required) {
          throw new Error(`${message}: ${this.disabledReason}`);
        }

        return this.getStatus();
      } finally {
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  async quit() {
    if (!this.client) {
      return;
    }

    const client = this.client;
    this.client = null;
    this.ready = false;
    this.status = "closing";
    this.disabledReason = "Redis shutdown in progress";

    try {
      await client.quit();
      this.status = "closed";
      logger.info("Redis client closed cleanly", {
        target: getSafeRedisTarget(this.config.url),
      });
    } catch (error) {
      client.disconnect();
      this.status = "closed";
      logger.warn("Redis client closed with forced disconnect", {
        target: getSafeRedisTarget(this.config.url),
        error: error?.message || "Unknown Redis shutdown error",
      });
    }
  }

  assertAvailable(operation = "Redis operation") {
    if (this.client && this.ready) {
      return this.client;
    }

    throw new Error(`${operation} requires Redis, but Redis is not available`);
  }

  async execute(operation, action, fallback, { required = false } = {}) {
    if (!this.client || !this.ready) {
      if (required) {
        this.assertAvailable(operation);
      }
      return fallback;
    }

    try {
      return await action(this.client);
    } catch (error) {
      const message = error?.message || `${operation} failed`;
      logger.error("Redis command failed", {
        operation,
        error: message,
        status: this.status,
      });

      if (required) {
        throw new Error(`Redis command failed during ${operation}: ${message}`);
      }

      return fallback;
    }
  }

  async ping(options = {}) {
    return this.execute("ping", (client) => client.ping(), "PONG", options);
  }

  async get(key, options = {}) {
    return this.execute("get", (client) => client.get(key), null, options);
  }

  async set(key, value, options = {}) {
    const commandOptions = [];

    if (Number.isInteger(options.ttlSeconds) && options.ttlSeconds > 0) {
      commandOptions.push("EX", options.ttlSeconds);
    }

    if (Number.isInteger(options.ttlMs) && options.ttlMs > 0) {
      commandOptions.push("PX", options.ttlMs);
    }

    if (options.nx) {
      commandOptions.push("NX");
    }

    if (options.xx) {
      commandOptions.push("XX");
    }

    return this.execute(
      "set",
      (client) => client.set(key, value, ...commandOptions),
      "OK",
      options,
    );
  }

  async setex(key, ttlSeconds, value, options = {}) {
    return this.execute(
      "setex",
      (client) => client.set(key, value, "EX", ttlSeconds),
      "OK",
      options,
    );
  }

  async del(key, options = {}) {
    return this.execute("del", (client) => client.del(key), 0, options);
  }

  async exists(key, options = {}) {
    return this.execute("exists", (client) => client.exists(key), 0, options);
  }

  async incr(key, options = {}) {
    return this.execute("incr", (client) => client.incr(key), 0, options);
  }

  async expire(key, ttlSeconds, options = {}) {
    return this.execute("expire", (client) => client.expire(key, ttlSeconds), 0, options);
  }

  async setnx(key, value, ttlSeconds = 0, options = {}) {
    const fallback = 0;

    return this.execute(
      "setnx",
      async (client) => {
        if (Number.isInteger(ttlSeconds) && ttlSeconds > 0) {
          const result = await client.set(key, value, "EX", ttlSeconds, "NX");
          return result === "OK" ? 1 : 0;
        }

        return client.setnx(key, value);
      },
      fallback,
      options,
    );
  }

  async getJson(key, options = {}) {
    const value = await this.get(key, options);
    if (value === null || value === undefined || value === "") {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      logger.warn("Redis JSON parse failed", {
        operation: "getJson",
        error: error?.message || "Invalid JSON payload",
      });

      if (options.required) {
        throw new Error(`Redis JSON parse failed: ${error?.message || "Invalid JSON payload"}`);
      }

      return null;
    }
  }

  async setJson(key, value, options = {}) {
    return this.set(key, JSON.stringify(value), options);
  }

  async eval(script, numberOfKeys, args = [], options = {}) {
    const normalizedArgs = Array.isArray(args) ? args : [args];

    return this.execute(
      "eval",
      (client) => client.eval(script, numberOfKeys, ...normalizedArgs),
      null,
      options,
    );
  }
}

module.exports = new RedisManager();
