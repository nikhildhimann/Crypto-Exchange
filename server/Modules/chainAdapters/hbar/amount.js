const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { AppError } = require("../../../helpers/errors");

const DECIMALS = 8;

function normalizeDisplayAmount(value) {
  try {
    return normalizeDecimalAmount(value, DECIMALS);
  } catch (_error) {
    throw AppError.validation("Invalid HBAR amount");
  }
}

function toBaseUnits(value) {
  try {
    return parseUnitsToBase(normalizeDisplayAmount(value), DECIMALS);
  } catch (_error) {
    throw AppError.validation("Invalid HBAR amount");
  }
}

function fromBaseUnits(value) {
  const normalized = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw AppError.validation("Invalid HBAR base unit amount");
  }

  try {
    return formatUnitsFromBase(normalized, DECIMALS);
  } catch (_error) {
    throw AppError.validation("Invalid HBAR base unit amount");
  }
}

module.exports = {
  normalizeDisplayAmount,
  toBaseUnits,
  fromBaseUnits,
};
