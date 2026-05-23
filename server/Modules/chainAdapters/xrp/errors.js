const errorCodes = require("../../../common/constants/errorCodes");
const { AppError } = require("../../../helpers/errors");

const XRP_NOT_ACTIVATED_REASON = "xrp_account_not_activated";
const XRP_NOT_ACTIVATED_MESSAGE =
  "XRP wallet is not activated on-chain yet. Fund this XRP address first before previewing or sending transactions.";

function normalizeString(value) {
  return String(value || "").trim();
}

function extractProviderReason(error) {
  const candidates = [
    error?.data?.error_message,
    error?.data?.message,
    error?.response?.data?.error_message,
    error?.response?.data?.message,
    error?.error_message,
    error?.message,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function isXrpAccountNotActivatedError(error) {
  const reason = extractProviderReason(error).toLowerCase();

  return reason.includes("actnotfound") || reason.includes("account not found");
}

function buildXrpAccountNotActivatedError({
  address,
  network,
  operation = "transaction",
  providerError,
} = {}) {
  const providerMessage = extractProviderReason(providerError);

  return new AppError(XRP_NOT_ACTIVATED_MESSAGE, {
    status: 400,
    code: errorCodes.XRP_ACCOUNT_NOT_ACTIVATED,
    errors: {
      reason: XRP_NOT_ACTIVATED_REASON,
      chain: "xrp",
      network: normalizeString(network).toLowerCase() || null,
      address: normalizeString(address) || null,
      operation: normalizeString(operation) || null,
      onChainExists: false,
      activationStatus: "pending_activation",
      walletState: "not_activated_onchain",
      providerMessage: providerMessage || null,
    },
  });
}

module.exports = {
  XRP_NOT_ACTIVATED_MESSAGE,
  XRP_NOT_ACTIVATED_REASON,
  extractProviderReason,
  isXrpAccountNotActivatedError,
  buildXrpAccountNotActivatedError,
};
