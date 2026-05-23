const { createPendingMethod } = require("../pending");

module.exports = {
  normalizeExecutionParams: createPendingMethod("Template execution param normalization is not implemented"),
  validateDestination: createPendingMethod("Template destination validation is not implemented"),
  estimateTransfer: createPendingMethod("Template transfer estimation is not implemented"),
  executeTransfer: createPendingMethod("Template transfer execution is not implemented"),
  fetchHistory: createPendingMethod("Template history fetch is not implemented"),
};
