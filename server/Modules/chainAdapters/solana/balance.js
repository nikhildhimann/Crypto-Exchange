const { PublicKey } = require("@solana/web3.js");

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
  const connection = client.getClient(input.network);

  try {
    const [lamports, rentExemptMinimumLamports] = await Promise.all([
      client.withRpcRetry(input.network, "fetching Solana balance", () =>
        connection.getBalance(new PublicKey(input.address), "confirmed"),
      ),
      client.withRpcRetry(input.network, "fetching Solana rent exemption minimum", () =>
        connection.getMinimumBalanceForRentExemption(0, "confirmed"),
      ),
    ]);

    const available = lamports > rentExemptMinimumLamports
      ? lamports - rentExemptMinimumLamports
      : 0;

    return buildCanonicalBalance({
      baseUnitBalance: lamports.toString(),
      availableBaseUnits: available.toString(),
      rentExemptMinimumBaseUnits: rentExemptMinimumLamports.toString(),
      exists: true,
      confirmed: true,
      raw: {
        lamports,
        rentExemptMinimumLamports,
      },
    });
  } catch (error) {
    if (error.message && error.message.includes("could not find account")) {
      return buildCanonicalBalance({
        exists: false,
        confirmed: false,
        raw: {},
      });
    }

    throw new Error(`Failed to fetch Solana balance: ${error.message}`);
  }
}

async function fetchBalances(input) {
  const { network, addresses } = input;
  if (!Array.isArray(addresses) || !addresses.length) return [];
  
  const connection = client.getClient(network);

  try {
    const publicKeys = addresses.map((addr) => new PublicKey(addr));
    
    const [accountsInfo, rentExemptMinimumLamports] = await Promise.all([
      client.withRpcRetry(network, "fetching batched Solana balances", () =>
        connection.getMultipleAccountsInfo(publicKeys, "confirmed"),
      ),
      client.withRpcRetry(network, "fetching Solana rent exemption minimum", () =>
        connection.getMinimumBalanceForRentExemption(0, "confirmed"),
      ),
    ]);

    return addresses.map((address, index) => {
      const accountInfo = accountsInfo[index];

      if (!accountInfo) {
        return {
          address,
          balance: buildCanonicalBalance({
            baseUnitBalance: "0",
            availableBaseUnits: "0",
            rentExemptMinimumBaseUnits: rentExemptMinimumLamports?.toString() || "0",
            exists: false,
            confirmed: false,
            raw: {},
          }),
        };
      }

      const lamports = accountInfo.lamports;
      const available = lamports > rentExemptMinimumLamports
        ? lamports - rentExemptMinimumLamports
        : 0;

      return {
        address,
        balance: buildCanonicalBalance({
          baseUnitBalance: lamports.toString(),
          availableBaseUnits: available.toString(),
          rentExemptMinimumBaseUnits: rentExemptMinimumLamports.toString(),
          exists: true,
          confirmed: true,
          raw: {
            lamports,
            rentExemptMinimumLamports,
          },
        }),
      };
    });
  } catch (error) {
    throw new Error(`Failed to batch fetch Solana balances: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
  fetchBalances,
};
