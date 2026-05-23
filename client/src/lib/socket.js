import { io } from "socket.io-client";
import { runtimeConfig } from "./runtimeConfig";

const SOCKET_SINGLETON_KEY = "__auraRealtimeSocket";
const SOCKET_DEBUG_KEY = "__auraRealtimeSocketDebugAttached";

function normalizeString(value = "") {
  return String(value || "").trim();
}

function isProductionBuild() {
  return Boolean(import.meta?.env?.PROD);
}

function getConfiguredSocketUrl() {
  if (typeof import.meta !== "undefined" && import.meta?.env) {
    return import.meta.env.VITE_SOCKET_URL || "";
  }

  return "";
}

function isLoopbackHost(hostname = "") {
  const normalized = normalizeString(hostname).toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

export function resolveSocketUrl({ configuredSocketUrl = getConfiguredSocketUrl() } = {}) {
  const normalizedSocketUrl = normalizeString(configuredSocketUrl);

  if (!normalizedSocketUrl) {
    throw new Error("VITE_SOCKET_URL must be configured as an absolute URL");
  }

  let socketUrl;

  try {
    socketUrl = new URL(normalizedSocketUrl);
  } catch (_error) {
    throw new Error("VITE_SOCKET_URL must be a valid absolute URL");
  }

  if (isProductionBuild() && isLoopbackHost(socketUrl.hostname)) {
    throw new Error("VITE_SOCKET_URL cannot point to localhost in a production build");
  }

  return socketUrl.origin;
}

function createNoopSocket() {
  return {
    connected: false,
    connect() {},
    disconnect() {},
    emit() {},
    off() {},
    on() {},
  };
}

function createBrowserSocket(socketUrl) {
  return io(socketUrl, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: runtimeConfig.socketReconnectAttempts,
    reconnectionDelay: runtimeConfig.socketReconnectDelayMs,
    transports: ["websocket", "polling"],
  });
}

function getGlobalSocketStore() {
  if (typeof window === "undefined") {
    return null;
  }

  return window;
}

function getOrCreateSocket() {
  if (typeof window === "undefined") {
    return createNoopSocket();
  }

  const socketUrl = resolveSocketUrl();
  const globalStore = getGlobalSocketStore();
  const existingSocket = globalStore?.[SOCKET_SINGLETON_KEY] || null;

  if (existingSocket) {
    return existingSocket;
  }

  const nextSocket = createBrowserSocket(socketUrl);

  if (globalStore) {
    globalStore[SOCKET_SINGLETON_KEY] = nextSocket;
  }

  return nextSocket;
}

function attachDebugListeners(activeSocket) {
  if (typeof window === "undefined") {
    return;
  }

  const globalStore = getGlobalSocketStore();
  if (globalStore?.[SOCKET_DEBUG_KEY]) {
    return;
  }

  if (globalStore) {
    globalStore[SOCKET_DEBUG_KEY] = true;
  }

  activeSocket.on("connect", () => {
    console.log(
      "%c[Socket] Connected to Real-time API",
      "color: green; font-weight: bold",
    );
  });

  activeSocket.on("disconnect", (reason) => {
    console.log(
      "%c[Socket] Disconnected:",
      "color: orange; font-weight: bold",
      reason,
    );
  });

  activeSocket.on("connect_error", (error) => {
    console.error("[Socket] Connection Error:", error);
  });
}

export const socket = getOrCreateSocket();

if (typeof window !== "undefined") {
  attachDebugListeners(socket);
}
