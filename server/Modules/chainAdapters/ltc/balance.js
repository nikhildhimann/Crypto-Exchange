const client = require("./client");
const wallet = require("./wallet");
const { AppError } = require("../../../helpers/errors");

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
  let address;
  const network = client.normalizeNetwork(input.network);

  try {
    address = wallet.normalizeAddress(input.address, network);
  } catch (_error) {
    throw AppError.validation("Invalid LTC address");
  }

  try {
    const ltcClient = client.getClient(network);
    const [summary, utxos] = await Promise.all([
      ltcClient.fetchAddressSummary(address),
      ltcClient.fetchAddressUtxos(address).catch(() => []),
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
        baseUrl: ltcClient.baseUrl,
        chainStats: summary?.chain_stats || {},
        mempoolStats: summary?.mempool_stats || {},
        confirmedBalance: confirmedBalance.toString(),
        unconfirmedBalance: unconfirmedBalance.toString(),
        utxoCount: Array.isArray(utxos) ? utxos.length : 0,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to fetch LTC balance", {
      status: 502,
      errors: {
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

module.exports = {
  fetchBalance,
};
