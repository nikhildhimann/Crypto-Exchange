const { AppError } = require("../../helpers/errors");

async function buildRecoveryPackage() {
  throw AppError.notImplemented("Recovery flow depends on final product policy and custody design");
}

module.exports = {
  buildRecoveryPackage,
};
