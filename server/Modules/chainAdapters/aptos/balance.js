const { AppError } = require("../../../helpers/errors");
const client = require("./client");
const wallet = require("./wallet");

function normalizeBaseUnitBalance(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
      throw new AppError("Aptos provider returned an invalid balance value", {
        status: 502,
        errors: {
          value,
        },
      });
    }

    return String(Math.trunc(value));
  }

  const normalized = String(value ?? "0").trim();
  if (/^\d+$/.test(normalized)) {
    return normalized;
  }

  throw new AppError("Aptos provider returned an invalid balance value", {
    status: 502,
    errors: {
      value: normalized,
    },
  });
}

async function fetchBalance(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(
    input.network || client.DEFAULT_NETWORK,
  );
  const address = wallet.normalizeAddress(input.address);

  try {
    const aptosClient = client.getClient(normalizedNetwork);
    const [accountInfo, rawBalance] = await Promise.all([
      aptosClient.getAccountInfo(address),
      aptosClient.getBalance(address),
    ]);
    const baseUnitBalance = normalizeBaseUnitBalance(rawBalance);

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
        sequenceNumber: accountInfo?.sequence_number || null,
        authenticationKey: accountInfo?.authentication_key || null,
        sdkBalance: rawBalance,
        sdkAccountInfo: accountInfo,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const status = Number(error?.status);
    const reason = String(error?.data?.message || error?.message || "").trim();
    if (status === 404 || /account not found/i.test(reason)) {
      return {
        exists: false,
        confirmed: true,
        baseUnitBalance: "0",
        availableBaseUnits: "0",
        rentExemptMinimumBaseUnits: "0",
        tokenBalances: [],
        raw: {
          address,
          network: normalizedNetwork,
          sdkError: reason || null,
        },
      };
    }

    throw new AppError("Failed to fetch APT balance", {
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
