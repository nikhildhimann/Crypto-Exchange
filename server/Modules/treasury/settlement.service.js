const { AppError } = require("../../helpers/errors");

async function settleTreasury() {
  throw AppError.notImplemented("Treasury settlement needs business rules before implementation");
}

module.exports = {
  settleTreasury,
};
