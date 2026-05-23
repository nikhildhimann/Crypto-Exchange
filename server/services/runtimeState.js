const mongoose = require("mongoose");

const state = {
  server: {
    status: "initializing",
    startedAt: null,
    port: null,
  },
  jobs: {
    enabled: false,
    status: "idle",
  },
  chains: new Map(),
};

function connectionStateToStatus(readyState = mongoose.connection.readyState) {
  switch (readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "disconnected";
  }
}

function initializeChains(chains = []) {
  state.chains.clear();

  for (const chain of chains) {
    state.chains.set(chain.code, {
      chain: chain.code,
      label: chain.label,
      networks: Array.isArray(chain.supportedNetworks)
        ? chain.supportedNetworks.map((network) => network.code)
        : [],
      status: "active",
      reason: "",
      updatedAt: new Date().toISOString(),
    });
  }
}

function markChainActive(chainCode, metadata = {}) {
  const existing = state.chains.get(chainCode) || {
    chain: chainCode,
    label: chainCode,
    networks: [],
  };

  state.chains.set(chainCode, {
    ...existing,
    ...metadata,
    status: "active",
    reason: "",
    updatedAt: new Date().toISOString(),
  });
}

function disableChain(chainCode, reason, metadata = {}) {
  const existing = state.chains.get(chainCode) || {
    chain: chainCode,
    label: chainCode,
    networks: [],
  };

  state.chains.set(chainCode, {
    ...existing,
    ...metadata,
    status: "disabled",
    reason: String(reason || "disabled"),
    updatedAt: new Date().toISOString(),
  });
}

function isChainDisabled(chainCode) {
  return state.chains.get(String(chainCode || "").toLowerCase())?.status === "disabled";
}

function listChainStatuses() {
  return Array.from(state.chains.values());
}

function listActiveChains() {
  return listChainStatuses().filter((entry) => entry.status === "active");
}

function markServerStarted(port) {
  state.server = {
    status: "running",
    startedAt: new Date().toISOString(),
    port,
  };
}

function markServerStopping() {
  state.server.status = "stopping";
}

function markJobsState({ enabled, status }) {
  state.jobs = {
    enabled: Boolean(enabled),
    status: String(status || (enabled ? "active" : "disabled")),
  };
}

function getHealthSnapshot() {
  return {
    server: {
      ...state.server,
      uptimeSeconds: process.uptime(),
    },
    database: {
      status: connectionStateToStatus(),
      readyState: mongoose.connection.readyState,
    },
    jobs: {
      ...state.jobs,
    },
    chains: listChainStatuses(),
    activeChains: listActiveChains().map((entry) => entry.chain),
  };
}

module.exports = {
  initializeChains,
  markChainActive,
  disableChain,
  isChainDisabled,
  listChainStatuses,
  listActiveChains,
  markServerStarted,
  markServerStopping,
  markJobsState,
  getHealthSnapshot,
  connectionStateToStatus,
};
