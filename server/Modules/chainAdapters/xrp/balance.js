const client = require("./client");
const {
  extractProviderReason,
  isXrpAccountNotActivatedError,
} = require("./errors");
const amount = require("./amount");

const DEFAULT_XRP_BASE_RESERVE = "1";
const DEFAULT_XRP_OWNER_RESERVE = "0.2";

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

function normalizeReserveXrpValue(value, fallbackValue) {
  const normalized = String(value ?? "").trim();
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : fallbackValue;
}

async function resolveAccountReserveBaseUnits(xrplClient, ownerCount = 0) {
  const normalizedOwnerCount = Math.max(Number(ownerCount) || 0, 0);

  try {
    const response = await xrplClient.request({
      command: "server_info",
    });
    const validatedLedger =
      response?.result?.info?.validated_ledger &&
      typeof response.result.info.validated_ledger === "object"
        ? response.result.info.validated_ledger
        : {};
    const reserveBaseXrp = normalizeReserveXrpValue(
      validatedLedger.reserve_base_xrp ?? validatedLedger.reserveBaseXRP,
      DEFAULT_XRP_BASE_RESERVE,
    );
    const reserveIncrementXrp = normalizeReserveXrpValue(
      validatedLedger.reserve_inc_xrp ?? validatedLedger.reserveIncXRP,
      DEFAULT_XRP_OWNER_RESERVE,
    );

    return (
      BigInt(amount.toBaseUnits(reserveBaseXrp)) +
      BigInt(normalizedOwnerCount) * BigInt(amount.toBaseUnits(reserveIncrementXrp))
    ).toString();
  } catch (_error) {
    return (
      BigInt(amount.toBaseUnits(DEFAULT_XRP_BASE_RESERVE)) +
      BigInt(normalizedOwnerCount) * BigInt(amount.toBaseUnits(DEFAULT_XRP_OWNER_RESERVE))
    ).toString();
  }
}

async function fetchBalance(input) {
  const xrplClient = await client.getClient(input.network);

  try {
    const response = await xrplClient.request({
      command: "account_info",
      account: input.address,
      ledger_index: "validated",
    });

    if (!response.result?.account_data) {
      return buildCanonicalBalance({
        exists: false,
        confirmed: false,
        raw: response,
      });
    }

    const accountData = response.result.account_data;
    const balance = accountData.Balance || "0";
    const rentExemptMinimumBaseUnits = await resolveAccountReserveBaseUnits(
      xrplClient,
      accountData.OwnerCount,
    );

    return buildCanonicalBalance({
      baseUnitBalance: balance,
      availableBaseUnits: balance,
      rentExemptMinimumBaseUnits,
      exists: true,
      confirmed: response.result.ledger_current_index > 0,
      raw: response,
    });
  } catch (error) {
    if (isXrpAccountNotActivatedError(error)) {
      return buildCanonicalBalance({
        exists: false,
        confirmed: false,
        raw: {
          providerMessage: extractProviderReason(error) || null,
          activationStatus: "pending_activation",
          onChainExists: false,
        },
      });
    }

    throw new Error(`Failed to fetch XRP balance: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
};
