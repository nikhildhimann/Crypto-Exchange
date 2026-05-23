const { AppError } = require("../../../helpers/errors");

async function submitWithdrawal() {
  throw AppError.notImplemented("ETH withdrawals will be added in Phase 2");
}

module.exports = {
  submitWithdrawal,
};
