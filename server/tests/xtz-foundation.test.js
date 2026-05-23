const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getChainEnvironmentConfig,
  getConfiguredChainConfig,
  getSupportedChainCodes,
  isChainConfigured,
  isChainEnabled,
} = require("../config/chains");
const { listSupportedChainMetadata } = require("../common/utils/chain");

test("XTZ foundation config is present and enabled", () => {
  const chain = getConfiguredChainConfig("xtz");

  assert.ok(chain);
  assert.equal(isChainConfigured("xtz"), true);
  assert.equal(isChainEnabled("xtz"), true);
  assert.equal(chain.code, "xtz");
  assert.equal(chain.label, "Tezos");
  assert.equal(chain.nativeAssetSymbol, "XTZ");
  assert.equal(chain.decimals, 6);
  assert.equal(chain.baseUnitName, "mutez");
  assert.deepEqual(
    chain.supportedNetworks.map((network) => network.code),
    ["mainnet", "ghostnet"],
  );
  assert.equal(getSupportedChainCodes().includes("xtz"), true);
});

test("XTZ is now visible in supported chain metadata", () => {
  const supportedChains = listSupportedChainMetadata();
  const env = getChainEnvironmentConfig("xtz");

  assert.equal(supportedChains.some((chain) => chain.code === "xtz"), true);
  assert.deepEqual(
    env.vars.map((entry) => entry.name),
    ["XTZ_DEFAULT_NETWORK", "XTZ_MAINNET_RPC_URL", "XTZ_GHOSTNET_RPC_URL"],
  );
});
