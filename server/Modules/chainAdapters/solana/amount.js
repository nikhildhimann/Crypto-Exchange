const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");

const SOL_DECIMALS = 9;

module.exports = {
  normalizeDisplayAmount(value) {
    return normalizeDecimalAmount(value, SOL_DECIMALS);
  },
  toBaseUnits(value) {
    return parseUnitsToBase(value, SOL_DECIMALS);
  },
  fromBaseUnits(value) {
    return formatUnitsFromBase(value, SOL_DECIMALS);
  },
};
