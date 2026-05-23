const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("../../../common/utils/amount");

// Replace this value with the chain's native asset decimals when implementing the adapter.
// normalizeDisplayAmount performs strict precision validation and will reject extra decimals.
const DECIMALS = 0;

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
