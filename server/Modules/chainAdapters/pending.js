const { AppError } = require("../../helpers/errors");

function createPendingMethod(message) {
  return async () => {
    throw AppError.notImplemented(message);
  };
}

function createPendingSyncMethod(message) {
  return () => {
    throw AppError.notImplemented(message);
  };
}

module.exports = {
  createPendingMethod,
  createPendingSyncMethod,
};
