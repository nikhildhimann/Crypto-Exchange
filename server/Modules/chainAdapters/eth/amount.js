const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { getConfiguredChainConfig } = require("../../../config/chains");
const { AppError } = require("../../../helpers/errors");

const { decimals = 18 } = getConfiguredChainConfig("eth") || {};

module.exports = {
  normalizeDisplayAmount(value) {
    return normalizeDecimalAmount(value, decimals);
  },
  toBaseUnits(value) {
    try {
      return parseUnitsToBase(value, decimals);
    } catch (_error) {
      throw AppError.validation("Invalid ETH amount");
    }
  },
  fromBaseUnits(value) {
    try {
      return formatUnitsFromBase(value, decimals);
    } catch (_error) {
      throw AppError.validation("Invalid ETH base unit amount");
    }
  },
};
