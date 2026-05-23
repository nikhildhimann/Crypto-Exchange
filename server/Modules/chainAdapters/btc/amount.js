const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");

const DECIMALS = 8;

module.exports = {
  normalizeDisplayAmount(value) {
    return normalizeDecimalAmount(value, DECIMALS);
  },
  toBaseUnits(value) {
    return parseUnitsToBase(value, DECIMALS);
  },
  fromBaseUnits(value) {
    return formatUnitsFromBase(value, DECIMALS);
  },
};
