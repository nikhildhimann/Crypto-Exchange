const { AppError } = require("../../helpers/errors");

async function reconcileTreasury() {
  throw AppError.notImplemented("Treasury reconciliation needs custody and source-of-truth rules");
}

module.exports = {
  reconcileTreasury,
};
