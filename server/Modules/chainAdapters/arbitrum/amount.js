const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { getChainConfig } = require("../../../config/chains");
const { AppError } = require("../../../helpers/errors");

const { decimals = 18 } = getChainConfig("arbitrum") || {};

module.exports = {
  normalizeDisplayAmount(value) {
    return normalizeDecimalAmount(value, decimals);
  },
  toBaseUnits(value) {
    try {
      return parseUnitsToBase(value, decimals);
    } catch (_error) {
      throw AppError.validation("Invalid Arbitrum amount");
    }
  },
  fromBaseUnits(value) {
    try {
      return formatUnitsFromBase(value, decimals);
    } catch (_error) {
      throw AppError.validation("Invalid Arbitrum base unit amount");
    }
  },
};