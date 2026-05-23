const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { AppError } = require("../../../helpers/errors");

const DECIMALS = 8;

module.exports = {
  normalizeDisplayAmount(value) {
    try {
      return normalizeDecimalAmount(value, DECIMALS);
    } catch (_error) {
      throw AppError.validation("Invalid LTC amount");
    }
  },
  toBaseUnits(value) {
    try {
      return parseUnitsToBase(module.exports.normalizeDisplayAmount(value), DECIMALS);
    } catch (_error) {
      throw AppError.validation("Invalid LTC amount");
    }
  },
  fromBaseUnits(value) {
    const normalized = String(value ?? "0").trim();
    if (!/^-?\d+$/.test(normalized)) {
      throw AppError.validation("Invalid LTC base unit amount");
    }

    try {
      return formatUnitsFromBase(normalized, DECIMALS);
    } catch (_error) {
      throw AppError.validation("Invalid LTC base unit amount");
    }
  },
};
