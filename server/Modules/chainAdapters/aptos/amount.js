const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { getChainConfig } = require("../../../config/chains");
const { AppError } = require("../../../helpers/errors");

const { decimals } = getChainConfig("aptos");

function normalizeDisplayAmount(value) {
  try {
    return normalizeDecimalAmount(value, decimals);
  } catch (_error) {
    throw AppError.validation("Invalid APT amount");
  }
}

function toBaseUnits(value) {
  try {
    return parseUnitsToBase(normalizeDisplayAmount(value), decimals);
  } catch (_error) {
    throw AppError.validation("Invalid APT amount");
  }
}

function fromBaseUnits(value) {
  const normalized = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw AppError.validation("Invalid APT base unit amount");
  }

  try {
    return formatUnitsFromBase(normalized, decimals);
  } catch (_error) {
    throw AppError.validation("Invalid APT base unit amount");
  }
}

module.exports = {
  normalizeDisplayAmount,
  toBaseUnits,
  fromBaseUnits,
};
