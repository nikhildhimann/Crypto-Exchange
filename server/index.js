const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
 

const appConfig = require("./config/app");
const connectDB = require("./config/database");
const queueConfig = require("./config/queue");
const redis = require("./config/redis");
const { validateEnvironment } = require("./config/envValidation");
const requestContext = require("./middleware/requestContext");
const securityHeaders = require("./middleware/securityHeaders");
const rateLimiter = require("./middleware/rateLimiter");
const idempotency = require("./middleware/idempotency");
const auditLogger = require("./middleware/auditLogger");
const errorHandler = require("./middleware/errorHandler");
const sanitizeRequest = require("./middleware/sanitizeRequest");
const rawBody = require("./middleware/rawBody");
const { success } = require("./common/utils/apiResponse");
const logger = require("./common/utils/logger");
const notificationRoutes = require("./Modules/notification/routes");
const runtimeState = require("./services/runtimeState");
const { initializeRuntimeChains } = require("./services/chainRuntime.service");
const { getHealthPayload } = require("./services/health.service");
const nftReconciliationRunner = require("./Modules/nft/reconciliation.runner");
const socket = require("./lib/socket");

const app = express();
const modulesPath = path.join(__dirname, "Modules");

function isAllowedCorsOrigin(origin) {
  return appConfig.corsOrigins.includes(String(origin || "").trim().replace(/\/+$/, ""));
}

// Global job scheduler instance
let jobScheduler = null;
let server = null;
let shuttingDown = false;

// Graceful shutdown function
async function gracefulShutdown(signal) {
  if (shuttingDown) {
    logger.warn("Graceful shutdown already in progress", {
      event: "shutdown_already_in_progress",
      signal,
    });
    return;
  }

  shuttingDown = true;
  runtimeState.markServerStopping();
  logger.info("Starting graceful shutdown", {
    event: "server_shutdown_start",
    signal,
  });
  
  try {
    // Stop job scheduler first
    if (jobScheduler && jobScheduler.scheduler) {
      logger.info("Stopping job scheduler", {
        event: "server_shutdown_jobs_stop",
      });
      jobScheduler.scheduler.stopAll();
    }

    await redis.quit();

    nftReconciliationRunner.stopNftTransferReconciliationRunner();

    // Close database connection
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState === 1) {
      logger.info("Closing database connection", {
        event: "server_shutdown_db_close",
      });
      await mongoose.connection.close();
    }

    await socket.closeSocket();

    // Close HTTP server
    if (server && server.listening) {
      logger.info("Closing HTTP server", {
        event: "server_shutdown_http_close",
      });
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }

    logger.info("Graceful shutdown completed", {
      event: "server_shutdown_complete",
      signal,
    });
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown", {
      event: "server_shutdown_error",
      signal,
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Enhanced startup sequence
async function startServer() {
  try {
    logger.info("Starting server initialization", {
      event: "server_start_initializing",
      environment: appConfig.nodeEnv,
      port: appConfig.port,
    });
    
    // Validate environment first
    logger.info("Validating environment variables", {
      event: "server_env_validation_start",
    });
    validateEnvironment();
    initializeRuntimeChains();
    const activeChains = runtimeState.listActiveChains().map((entry) => entry.chain);
    const disabledChains = runtimeState
      .listChainStatuses()
      .filter((entry) => entry.status === "disabled")
      .map((entry) => ({ chain: entry.chain, reason: entry.reason }));
    logger.info("Resolved runtime chain configuration", {
      event: "server_runtime_chains_resolved",
      activeChains,
      disabledChains,
    });

    logger.info("Initializing Redis foundation", {
      event: "server_redis_initialize_start",
      required: redis.isRequired(),
      configured: redis.configured,
    });
    await redis.initialize();
    logger.info("Redis foundation initialized", {
      event: "server_redis_initialize_complete",
      redis: redis.getStatus(),
    });

    // Connect to database first
    logger.info("Connecting to database", {
      event: "server_db_connect_start",
    });
    await connectDB();

    // Start HTTP server and bind to port
    server = app.listen(appConfig.port);

    // Specific error handling for the server (e.g., EADDRINUSE)
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`Port ${appConfig.port} is already in use. Please stop the process using it or choose a different port.`, {
          event: "server_port_conflict",
          port: appConfig.port,
        });
      } else {
        logger.error("Server binding error", {
          event: "server_binding_error",
          error: error.message,
        });
      }
      process.exit(1);
    });

    // Wait for the server to actually start listening before proceeding
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    runtimeState.markServerStarted(appConfig.port);
    logger.info("HTTP server listening", {
      event: "server_started",
      appName: appConfig.appName,
      port: appConfig.port,
      apiPrefix: appConfig.apiPrefix,
      activeChains,
      queueEnabled: Boolean(queueConfig.enabled),
      queueEnabledSource: queueConfig.enabledSource,
      jobsEnabled: Boolean(queueConfig.jobsEnabled),
    });

    // Start background jobs ONLY AFTER server is listening
    const nftHistorySyncWorker = require("./cron/nftHistorySync.worker");
    const nftHistoryWorkerState = nftHistorySyncWorker.start();
    if (nftHistoryWorkerState?.started) {
      logger.info("NFT history sync worker started", { event: "nft_cron_worker_registered" });
    }

    jobScheduler = require("./jobs/index");
    await jobScheduler.scheduler.startAll();

    // Initialize Socket.IO
    socket.initializeSocket(server);

    nftReconciliationRunner.startNftTransferReconciliationRunner();

    // Setup graceful shutdown handlers
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    return server;
  } catch (error) {
    logger.error("Failed to start server", {
      event: "server_start_failed",
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}



app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: appConfig.bodyLimit, verify: rawBody.capture }));
app.use(express.urlencoded({ extended: true, limit: appConfig.bodyLimit, verify: rawBody.capture }));
app.use(sanitizeRequest);
app.use(requestContext);
app.use(securityHeaders);
app.use(rateLimiter);
app.use(idempotency);
app.use(auditLogger);

app.get("/", (req, res) =>
  success(res, {
    message: `${appConfig.appName} is running`,
    data: {
      environment: appConfig.nodeEnv,
      version: "1.0.0",
    },
  }),
);

app.get("/health", (req, res) =>
  success(res, {
    message: "Health check successful",
    data: getHealthPayload(),
  }),
);

app.use(`${appConfig.apiPrefix}/notification`, notificationRoutes);
logger.info(`Loaded routes for ${appConfig.apiPrefix}/notification`);

if (fs.existsSync(modulesPath)) {
  fs.readdirSync(modulesPath).forEach((folder) => {
    if (folder === "notification") {
      return;
    }

    const routeFile = path.join(modulesPath, folder, "routes.js");
    if (!fs.existsSync(routeFile)) {
      return;
    }

    const router = require(routeFile);
    if (typeof router !== "function") {
      logger.warn(`Skipped module "${folder}" because routes.js does not export a router`);
      return;
    }

    app.use(`${appConfig.apiPrefix}/${folder}`, router);
    logger.info(`Loaded routes for ${appConfig.apiPrefix}/${folder}`);
  });
}

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    errorCode: "ROUTE_NOT_FOUND",
    requestId: req.requestId,
  });
});

app.use(errorHandler);

// Enhanced error handling
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    event: "uncaught_exception",
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", {
    event: "unhandled_rejection",
    reason: String(reason),
  });
  gracefulShutdown("unhandledRejection");
});

// Start the server
startServer();
