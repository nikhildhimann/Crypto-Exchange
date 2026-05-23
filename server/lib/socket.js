const { Server } = require("socket.io");

const appConfig = require("../config/app");
const logger = require("../common/utils/logger");

let io = null;

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function getAllowedOrigins() {
  return Array.isArray(appConfig.socketCorsOrigins) &&
    appConfig.socketCorsOrigins.length
    ? appConfig.socketCorsOrigins
    : Array.isArray(appConfig.corsOrigins)
      ? appConfig.corsOrigins
      : [];
}

function isAllowedCorsOrigin(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getAllowedOrigins();

  if (!normalizedOrigin) {
    return true;
  }

  if (!allowedOrigins.length) {
    return true;
  }

  return allowedOrigins.includes(normalizedOrigin);
}

function toPlainPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (typeof payload.toObject === "function") {
    return payload.toObject({ depopulate: true });
  }

  return { ...payload };
}

function normalizeTransactionPayload(transaction) {
  if (!transaction || typeof transaction !== "object") {
    return transaction;
  }

  const payload = toPlainPayload(transaction);

  [
    "_id",
    "id",
    "walletId",
    "userId",
    "accountId",
    "relatedTransactionId",
  ].forEach((field) => {
    if (payload[field] != null) {
      payload[field] = String(payload[field]);
    }
  });

  return payload;
}

function createCorsConfig() {
  return {
    origin(origin, callback) {
      if (!origin || isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }

      logger.warn("Socket origin rejected", {
        origin: normalizeOrigin(origin),
        allowedOrigins: getAllowedOrigins(),
      });
      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST"],
  };
}

function initializeSocket(httpServer) {
  if (io) {
    return io;
  }

  if (!httpServer) {
    logger.warn("Socket.IO initialization skipped: missing HTTP server", {
      event: "socket_init_skipped",
    });
    return null;
  }

  io = new Server(httpServer, {
    cors: createCorsConfig(),
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    logger.info("Socket client connected", {
      event: "socket_client_connected",
      socketId: socket.id,
      origin: normalizeOrigin(socket.handshake?.headers?.origin),
    });

    socket.on("disconnect", (reason) => {
      logger.info("Socket client disconnected", {
        event: "socket_client_disconnected",
        socketId: socket.id,
        reason: String(reason || ""),
      });
    });
  });

  logger.info("Socket.IO initialized", {
    event: "socket_initialized",
    transports: ["websocket", "polling"],
    allowedOrigins: getAllowedOrigins(),
  });

  return io;
}

function getIO() {
  return io || null;
}

function emit(eventName, payload) {
  const ioInstance = getIO();
  const normalizedEventName = String(eventName || "").trim();

  if (!ioInstance || !normalizedEventName) {
    return false;
  }

  try {
    ioInstance.emit(normalizedEventName, payload);
    return true;
  } catch (error) {
    logger.error("Socket emit failed", {
      event: "socket_emit_failed",
      eventName: normalizedEventName,
      error: error.message,
    });
    return false;
  }
}

async function closeSocket() {
  if (!io) {
    return;
  }

  const ioInstance = io;
  io = null;

  await new Promise((resolve) => {
    ioInstance.close(() => resolve());
  });

  logger.info("Socket.IO infrastructure closed", {
    event: "socket_closed",
  });
}

function emitTransactionNew(transaction) {
  return emit("transaction:new", normalizeTransactionPayload(transaction));
}

function emitTransactionUpdate(transaction) {
  return emit("transaction:update", normalizeTransactionPayload(transaction));
}

module.exports = {
  initializeSocket,
  getIO,
  emit,
  closeSocket,
  emitTransactionNew,
  emitTransactionUpdate,
};
