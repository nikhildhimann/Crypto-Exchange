const { getConfiguredChainConfig } = require("../../config/chains");

function buildAdapterMetadata(code, extra = {}) {
  const chain = getConfiguredChainConfig(code);
  if (!chain) {
    throw new Error(`[chainAdapters] Cannot build adapter metadata for unsupported chain "${code}"`);
  }

  return Object.freeze({
    ...chain,
    name: chain.label,
    capabilities: Array.isArray(extra.capabilities) ? extra.capabilities : [],
    ...extra,
    code: chain.code,
    label: chain.label,
  });
}

module.exports = {
  buildAdapterMetadata,
};
