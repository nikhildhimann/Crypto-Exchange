const { AppError } = require("../../../helpers/errors");

// 1 XTZ = 1,000,000 mutez
function normalizeDisplayAmount(baseUnits) {
  if (baseUnits === undefined || baseUnits === null) return "0.0";
  const num = Number(baseUnits) / 1000000;
  return Number.isNaN(num) ? "0.0" : num.toString();
}

function toBaseUnits(displayAmount) {
  if (displayAmount === undefined || displayAmount === null) return "0";
  const num = Number(displayAmount) * 1000000;
  return Number.isNaN(num) ? "0" : Math.floor(num).toString();
}

function fromBaseUnits(baseUnits) {
  return normalizeDisplayAmount(baseUnits);
}

module.exports = {
  normalizeDisplayAmount,
  toBaseUnits,
  fromBaseUnits
};
