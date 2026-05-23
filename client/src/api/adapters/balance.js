import { normalizeChainCode } from "../../config/chains";

function normalizeBaseUnitValue(value) {
  if (value === undefined || value === null || value === "") {
    return "0";
  }

  return String(value);
}

export function normalizeBalanceEntry(balance = {}) {
  const asset = String(balance.asset || balance.currency || "").trim();
  const availableBalance = String(balance.availableBalance ?? balance.balance ?? "0");
  const metadata = balance.metadata && typeof balance.metadata === "object" ? balance.metadata : {};

  return {
    ...balance,
    walletId: String(balance.walletId || ""),
    chain: normalizeChainCode(balance.chain),
    network: String(balance.network || "").toLowerCase(),
    asset,
    currency: String(balance.currency || asset),
    balance: String(balance.balance ?? availableBalance),
    availableBalance,
    onChainBalance: String(balance.onChainBalance ?? availableBalance),
    exists: Boolean(balance.exists),
    confirmed: Boolean(balance.confirmed),
    metadata: {
      ...metadata,
      availableBaseUnits: normalizeBaseUnitValue(metadata.availableBaseUnits),
      onChainBaseUnits: normalizeBaseUnitValue(metadata.onChainBaseUnits),
      minimumReserveBaseUnits: normalizeBaseUnitValue(metadata.minimumReserveBaseUnits),
    },
  };
}

export function normalizeBalanceListResponse(payload) {
  const items = Array.isArray(payload) ? payload : payload?.data;

  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((entry) => normalizeBalanceEntry(entry));
}

export function normalizeBalanceDetail(payload) {
  return normalizeBalanceEntry(payload);
}
