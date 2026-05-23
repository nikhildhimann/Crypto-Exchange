const {
  normalizeDecimalAmount,
  formatUnitsFromBase,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { AppError } = require("../../../helpers/errors");

const XRP_DECIMALS = 6;

function normalizeDisplayAmount(value) {
  return normalizeDecimalAmount(value, XRP_DECIMALS);
}

function toBaseUnits(value) {
  try {
    return parseUnitsToBase(String(value).trim(), XRP_DECIMALS);
  } catch (_error) {
    throw AppError.validation("Invalid XRP amount");
  }
}

function fromBaseUnits(value) {
  try {
    return formatUnitsFromBase(String(value), XRP_DECIMALS);
  } catch (_error) {
    throw AppError.validation("Invalid XRP base unit amount");
  }
}

module.exports = {
  normalizeDisplayAmount,
  toBaseUnits,
  fromBaseUnits,
};
