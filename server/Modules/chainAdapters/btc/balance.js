const client = require("./client");
const wallet = require("./wallet");

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

function normalizeStatValue(value) {
  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : String(value ?? "0").trim();

  if (!/^-?\d+$/.test(normalized)) {
    return 0n;
  }

  return BigInt(normalized);
}

function computeNetBalance(stats = {}) {
  return normalizeStatValue(stats.funded_txo_sum) - normalizeStatValue(stats.spent_txo_sum);
}

async function fetchBalance(input) {
  const address = String(input.address || "").trim();
  const network = client.normalizeNetwork(input.network);

  if (!wallet.validateAddress(address, network)) {
    throw new Error("Failed to fetch BTC balance: invalid BTC address");
  }

  try {
    const btcClient = client.getClient(network);
    const [summary, utxos] = await Promise.all([
      btcClient.fetchAddressSummary(address),
      btcClient.fetchAddressUtxos(address).catch(() => []),
    ]);
    const confirmedBalance = computeNetBalance(summary?.chain_stats);
    const unconfirmedBalance = computeNetBalance(summary?.mempool_stats);
    const totalBalance = confirmedBalance + unconfirmedBalance;
    const used =
      Number(summary?.chain_stats?.tx_count || 0) > 0 ||
      Number(summary?.mempool_stats?.tx_count || 0) > 0;

    return buildCanonicalBalance({
      baseUnitBalance: totalBalance.toString(),
      availableBaseUnits: confirmedBalance.toString(),
      rentExemptMinimumBaseUnits: "0",
      exists: used,
      confirmed: true,
      raw: {
        address,
        network,
        baseUrl: btcClient.baseUrl,
        chainStats: summary?.chain_stats || {},
        mempoolStats: summary?.mempool_stats || {},
        confirmedBalance: confirmedBalance.toString(),
        unconfirmedBalance: unconfirmedBalance.toString(),
        utxoCount: Array.isArray(utxos) ? utxos.length : 0,
      },
    });
  } catch (error) {
    throw new Error(`Failed to fetch BTC balance: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
};
