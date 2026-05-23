const { getAddress } = require("ethers");

const client = require("./client");
const {
  fetchConfiguredErc20TokenBalances,
} = require("../common/evmTokenBalances");

function buildCanonicalBalance({
  baseUnitBalance = "0",
  availableBaseUnits = "0",
  rentExemptMinimumBaseUnits = "0",
  exists = false,
  confirmed = false,
  tokenBalances = [],
  raw = {},
} = {}) {
  return {
    baseUnitBalance: String(baseUnitBalance),
    availableBaseUnits: String(availableBaseUnits),
    rentExemptMinimumBaseUnits: String(rentExemptMinimumBaseUnits),
    exists: Boolean(exists),
    confirmed: Boolean(confirmed),
    tokenBalances: Array.isArray(tokenBalances) ? tokenBalances : [],
    raw: raw && typeof raw === "object" ? raw : {},
  };
}

async function fetchBalance(input) {
  try {
    const network = client.normalizeNetwork(input.network);
    const address = getAddress(String(input.address || "").trim());
    const { provider, chainId, rpcUrl } = await client.assertProviderReady(network);
    const [balance, blockNumber] = await Promise.all([
      provider.getBalance(address),
      provider.getBlockNumber(),
    ]);
    const tokenBalances = await fetchConfiguredErc20TokenBalances({
      chain: "arbitrum",
      network,
      provider,
      address,
      blockNumber,
      rpcUrl,
    });

    return buildCanonicalBalance({
      baseUnitBalance: balance.toString(),
      availableBaseUnits: balance.toString(),
      rentExemptMinimumBaseUnits: "0",
      exists: true,
      confirmed: Number.isInteger(blockNumber) && blockNumber >= 0,
      tokenBalances,
      raw: {
        address,
        chainId,
        blockNumber,
        rpcUrl,
        tokenCount: tokenBalances.length,
      },
    });
  } catch (error) {
    throw new Error(`Failed to fetch Arbitrum balance: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
};
