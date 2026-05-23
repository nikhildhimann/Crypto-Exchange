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
    const [balance, blockNumber] = await Promise.all([
      provider.getBalance(address),
      provider.getBlockNumber(),
    ]);

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
    throw new Error(`Failed to fetch Polygon balance: ${error.message}`);
  }
}

async function fetchBalances(input) {
  const { network, addresses } = input;
  if (!Array.isArray(addresses) || !addresses.length) return [];

  // get the provider once for all these requests
  const { provider, chainId, rpcUrl } = await client.assertProviderReady(network);

  try {
    // get minimum block metric once for the entire batch
    const blockNumber = await provider.getBlockNumber();
    const confirmed = Number.isInteger(blockNumber) && blockNumber >= 0;

    // independently check each address but concurrently 
    return await Promise.all(
      addresses.map(async (rawAddress) => {
        try {
          const address = getAddress(String(rawAddress || "").trim());
          const balance = await provider.getBalance(address);

          return {
            address: rawAddress,
            balance: buildCanonicalBalance({
              baseUnitBalance: balance.toString(),
              availableBaseUnits: balance.toString(),
              rentExemptMinimumBaseUnits: "0",
              exists: true,
              confirmed,
              raw: {
                address,
                chainId,
                blockNumber,
                rpcUrl,
              },
            }),
          };
        } catch (error) {
          // If a single address fails (e.g. malformed), it drops gracefully into fallback flow
          throw new Error(`Polygon batch partial failure: ${error.message}`);
        }
      })
    );
  } catch (error) {
    throw new Error(`Failed to batch fetch Polygon balances: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
  fetchBalances,
};
