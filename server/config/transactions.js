const { AppError } = require("../helpers/errors");

const SUPPORTED_PLATFORM_TRANSFER_SETTLEMENT_MODES = Object.freeze([
  "metadata_only",
  "onchain",
  "local_internal",
]);

function normalizeSettlementMode(value) {
  const normalized = String(value || "metadata_only").trim().toLowerCase();

  if (!SUPPORTED_PLATFORM_TRANSFER_SETTLEMENT_MODES.includes(normalized)) {
    throw AppError.validation(
      `Unsupported platform transfer settlement mode "${value}"`,
    );
  }

  return normalized;
}

const platformTransferSettlementMode = normalizeSettlementMode(
  process.env.PLATFORM_TRANSFER_SETTLEMENT_MODE || "metadata_only",
);

function useLocalInternalSettlement() {
  return platformTransferSettlementMode === "local_internal";
}

function useOnchainSettlementForPlatformTransfers() {
  return !useLocalInternalSettlement();
}

module.exports = Object.freeze({
  platformTransferSettlementMode,
  supportedPlatformTransferSettlementModes:
    SUPPORTED_PLATFORM_TRANSFER_SETTLEMENT_MODES,
  useLocalInternalSettlement,
  useOnchainSettlementForPlatformTransfers,
});
