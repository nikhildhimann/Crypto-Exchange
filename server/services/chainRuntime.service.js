const logger = require("../common/utils/logger");
const { getEnabledChains } = require("../config/chains");
const runtimeState = require("./runtimeState");

function initializeRuntimeChains() {
  const registry = require("../Modules/chainAdapters/registry");
  const configuredChains = getEnabledChains();
  runtimeState.initializeChains(configuredChains);

  for (const chain of configuredChains) {
    if (!registry.hasAdapter(chain.code)) {
      runtimeState.disableChain(chain.code, "No runtime-ready chain adapter is registered", {
        label: chain.label,
        networks: chain.supportedNetworks.map((network) => network.code),
      });
      logger.warn("Chain disabled during startup", {
        event: "chain_disabled_startup",
        chain: chain.code,
        label: chain.label,
        reason: "missing_adapter",
      });
      continue;
    }

    runtimeState.markChainActive(chain.code, {
      label: chain.label,
      networks: chain.supportedNetworks.map((network) => network.code),
    });
    logger.info("Chain initialized", {
      event: "chain_initialized",
      chain: chain.code,
      label: chain.label,
      networks: chain.supportedNetworks.map((network) => network.code),
    });
  }

  logger.info("Runtime chains resolved", {
    event: "runtime_chains_ready",
    activeChains: runtimeState.listActiveChains().map((entry) => entry.chain),
    disabledChains: runtimeState
      .listChainStatuses()
      .filter((entry) => entry.status === "disabled")
      .map((entry) => ({ chain: entry.chain, reason: entry.reason })),
  });
}

function handleChainRuntimeFailure(chainCode, error, metadata = {}) {
  const normalizedCode = String(chainCode || "").toLowerCase();
  const message = error instanceof Error ? error.message : String(error || "Unknown chain failure");

  runtimeState.disableChain(normalizedCode, message, metadata);
  logger.error("Chain disabled after runtime failure", {
    event: "chain_disabled_runtime",
    chain: normalizedCode,
    reason: message,
    ...metadata,
  });
}

module.exports = {
  initializeRuntimeChains,
  handleChainRuntimeFailure,
};
