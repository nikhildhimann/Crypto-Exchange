const { AppError } = require("../../helpers/errors");

async function syncBalances() {
  throw AppError.notImplemented("Balance sync requires chain adapter RPC integration");
}

module.exports = {
  syncBalances,
};
