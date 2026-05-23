const { AppError } = require("../../helpers/errors");

async function syncWalletBalance() {
  throw AppError.notImplemented("Wallet balance sync requires chain adapter implementation");
}

module.exports = {
  syncWalletBalance,
};
