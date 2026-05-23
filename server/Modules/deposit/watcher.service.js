const { AppError } = require("../../helpers/errors");

async function watchDeposits() {
  throw AppError.notImplemented("Deposit watching requires chain listener implementation");
}

module.exports = {
  watchDeposits,
};
