const { AppError } = require("../../../helpers/errors");
const client = require("./client");
const wallet = require("./wallet");

function normalizeTinybarBalance(value) {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) ? normalized : "0";
}

function buildPendingBalanceResponse(network, aliasAccountId) {
  return {
    exists: false,
    confirmed: true,
    baseUnitBalance: "0",
    availableBaseUnits: "0",
    rentExemptMinimumBaseUnits: "0",
    raw: {
      accountId: null,
      alias: aliasAccountId,
      evmAddress: null,
      publicKey: null,
      deleted: false,
      network,
      pendingActivation: true,
      activationStatus: "pending",
      mirror: null,
    },
  };
}

async function fetchCanonicalBalance(network, accountId, aliasAccountId = null) {
  const account = await client.getClient(network).requireAccount(accountId, {
    label: "HBAR account",
    notFoundMessage: "HBAR account could not be resolved on the selected network",
    deletedMessage: "HBAR account is deleted on the selected network",
  });
  const baseUnitBalance = normalizeTinybarBalance(account.tinybarBalance);

  return {
    exists: true,
    confirmed: true,
    baseUnitBalance,
    availableBaseUnits: baseUnitBalance,
    rentExemptMinimumBaseUnits: "0",
    raw: {
      accountId: account.accountId,
      alias: aliasAccountId || account.alias || null,
      evmAddress: account.evmAddress,
      publicKey: account.publicKey,
      deleted: false,
      network,
      pendingActivation: false,
      activationStatus: "active",
      mirror: account.raw,
    },
  };
}

async function fetchBalance(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const identifier = String(input.address || "").trim();

  if (!identifier) {
    throw AppError.validation("HBAR account identifier is required");
  }

  try {
    if (wallet.validateCanonicalAccountId(identifier)) {
      return fetchCanonicalBalance(normalizedNetwork, identifier);
    }

    if (!wallet.validateAliasAccountId(identifier)) {
      throw AppError.validation("Invalid HBAR account ID");
    }

    const aliasAccountId = client.normalizeAliasAccountId(identifier);
    const resolvedAccount = await client.getClient(normalizedNetwork).resolveAccount(
      aliasAccountId,
      { allowNotFound: true },
    );

    if (!resolvedAccount?.accountId) {
      return buildPendingBalanceResponse(normalizedNetwork, aliasAccountId);
    }

    if (resolvedAccount.deleted === true) {
      throw AppError.conflict("HBAR account is deleted on the selected network");
    }

    return fetchCanonicalBalance(
      normalizedNetwork,
      resolvedAccount.accountId,
      aliasAccountId,
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to resolve HBAR account balance", {
      status: 502,
      errors: {
        accountId: identifier,
        network: normalizedNetwork,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

module.exports = {
  fetchBalance,
};
