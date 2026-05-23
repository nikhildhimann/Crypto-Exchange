const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");
const { getChainConfig } = require("../../../config/chains");

const { decimals } = getChainConfig("tron");

module.exports = {
  normalizeDisplayAmount(value) {
    return normalizeDecimalAmount(value, decimals);
  },
  toBaseUnits(value) {
    return parseUnitsToBase(value, decimals);
  },
  fromBaseUnits(value) {
    return formatUnitsFromBase(value, decimals);
  },
};
