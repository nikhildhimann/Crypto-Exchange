const { AppError } = require("../../../helpers/errors");
const client = require("./client");
const wallet = require("./wallet");

function normalizeBaseUnitBalance(value) {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) ? normalized : "0";
}

async function fetchBalance(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const address = wallet.normalizeAddress(input.address);

  try {
    const response = await client.getClient(normalizedNetwork).getBalance(address);
    const baseUnitBalance = normalizeBaseUnitBalance(response?.totalBalance);

    return {
      exists: true,
      confirmed: true,
      baseUnitBalance,
      availableBaseUnits: baseUnitBalance,
      rentExemptMinimumBaseUnits: "0",
      tokenBalances: [],
      raw: {
        address,
        network: normalizedNetwork,
        coinType: response?.coinType || null,
        coinObjectCount: Number(response?.coinObjectCount) || 0,
        lockedBalance:
          response?.lockedBalance && typeof response.lockedBalance === "object"
            ? response.lockedBalance
            : {},
        sdk: response,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to fetch SUI balance", {
      status: 502,
      errors: {
        address,
        network: normalizedNetwork,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

module.exports = {
  fetchBalance,
};
