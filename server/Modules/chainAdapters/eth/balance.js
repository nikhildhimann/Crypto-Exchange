const { getAddress } = require("ethers");

const client = require("./client");

function buildCanonicalBalance({
  baseUnitBalance = "0",
  availableBaseUnits = "0",
  rentExemptMinimumBaseUnits = "0",
  exists = false,
  confirmed = false,
  raw = {},
} = {}) {
  return {
    baseUnitBalance: String(baseUnitBalance),
    availableBaseUnits: String(availableBaseUnits),
    rentExemptMinimumBaseUnits: String(rentExemptMinimumBaseUnits),
    exists: Boolean(exists),
    confirmed: Boolean(confirmed),
    raw: raw && typeof raw === "object" ? raw : {},
  };
}

async function fetchBalance(input) {
  try {
    const address = getAddress(String(input.address || "").trim());
    const { balance, blockNumber, chainId, rpcUrl } = await client.withProviderFallback(
      input.network,
      "fetching ETH balance",
      async ({ provider, chainId: candidateChainId, rpcUrl: candidateRpcUrl }) => {
        const [resolvedBalance, resolvedBlockNumber] = await Promise.all([
          provider.getBalance(address),
          provider.getBlockNumber(),
        ]);

        return {
          balance: resolvedBalance,
          blockNumber: resolvedBlockNumber,
          chainId: candidateChainId,
          rpcUrl: candidateRpcUrl,
        };
      },
    );

    return buildCanonicalBalance({
      baseUnitBalance: balance.toString(),
      availableBaseUnits: balance.toString(),
      rentExemptMinimumBaseUnits: "0",
      exists: true,
      confirmed: Number.isInteger(blockNumber) && blockNumber >= 0,
      raw: {
        address,
        chainId,
        blockNumber,
        rpcUrl,
      },
    });
  } catch (error) {
    throw new Error(`Failed to fetch ETH balance: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
};
