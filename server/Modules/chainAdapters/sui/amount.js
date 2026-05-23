const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { getChainConfig } = require("../../../config/chains");
const { AppError } = require("../../../helpers/errors");

const { decimals } = getChainConfig("sui");

function normalizeDisplayAmount(value) {
  try {
    return normalizeDecimalAmount(value, decimals);
  } catch (_error) {
    throw AppError.validation("Invalid SUI amount");
  }
}

function toBaseUnits(value) {
  try {
    return parseUnitsToBase(normalizeDisplayAmount(value), decimals);
  } catch (_error) {
    throw AppError.validation("Invalid SUI amount");
  }
}

function fromBaseUnits(value) {
  const normalized = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw AppError.validation("Invalid SUI base unit amount");
  }

  try {
    return formatUnitsFromBase(normalized, decimals);
  } catch (_error) {
    throw AppError.validation("Invalid SUI base unit amount");
  }
}

module.exports = {
  normalizeDisplayAmount,
  toBaseUnits,
  fromBaseUnits,
};
