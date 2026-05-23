const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { getChainConfig } = require("../../../config/chains");
const { AppError } = require("../../../helpers/errors");

const { decimals } = getChainConfig("ada");

function normalizeDisplayAmount(value) {
  try {
    return normalizeDecimalAmount(value, decimals);
  } catch (_error) {
    throw AppError.validation("Invalid ADA amount");
  }
}

function toBaseUnits(value) {
  try {
    return parseUnitsToBase(normalizeDisplayAmount(value), decimals);
  } catch (_error) {
    throw AppError.validation("Invalid ADA amount");
  }
}

function fromBaseUnits(value) {
  const normalized = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw AppError.validation("Invalid ADA base unit amount");
  }

  try {
    return formatUnitsFromBase(normalized, decimals);
  } catch (_error) {
    throw AppError.validation("Invalid ADA base unit amount");
  }
}

function resolveLovelaceBalance(amounts = []) {
  if (!Array.isArray(amounts)) {
    return "0";
  }

  const lovelaceEntry = amounts.find(
    (entry) => String(entry?.unit || "").trim().toLowerCase() === "lovelace",
  );

  const quantity = String(lovelaceEntry?.quantity || "0").trim();
  return /^\d+$/.test(quantity) ? quantity : "0";
}

module.exports = {
  normalizeDisplayAmount,
  toBaseUnits,
  fromBaseUnits,
  resolveLovelaceBalance,
};
