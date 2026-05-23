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
    const { provider, chainId, rpcUrl } = await client.assertProviderReady(input.network);
    const address = getAddress(String(input.address || "").trim());
    const [balance, blockNumber, transactionCount] = await Promise.all([
      provider.getBalance(address),
      provider.getBlockNumber(),
      provider.getTransactionCount(address),
    ]);
    const exists = balance > 0n || transactionCount > 0;

    return buildCanonicalBalance({
      baseUnitBalance: balance.toString(),
      availableBaseUnits: balance.toString(),
      rentExemptMinimumBaseUnits: "0",
      exists,
      confirmed: Number.isInteger(blockNumber) && blockNumber >= 0,
      raw: {
        address,
        chainId,
        blockNumber,
        transactionCount,
        rpcUrl,
      },
    });
  } catch (error) {
    throw new Error(`Failed to fetch AVAX balance: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
};
