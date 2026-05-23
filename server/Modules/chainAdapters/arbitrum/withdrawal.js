const { AppError } = require("../../../helpers/errors");

async function submitWithdrawal() {
  throw AppError.notImplemented("Arbitrum withdrawals will be added in Phase 2");
}

module.exports = {
  submitWithdrawal,
};