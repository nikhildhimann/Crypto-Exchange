const { AppError } = require("../../helpers/errors");

async function getKey() {
  throw AppError.notImplemented("KMS integration will be added after infrastructure selection");
}

module.exports = {
  getKey,
};
