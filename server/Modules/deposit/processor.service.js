const { AppError } = require("../../helpers/errors");

async function processDeposit() {
  throw AppError.notImplemented("Deposit processing rules are business-specific and pending");
}

module.exports = {
  processDeposit,
};
