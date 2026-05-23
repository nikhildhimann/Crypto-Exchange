const { createPendingMethod } = require("../pending");

module.exports = {
  watchDeposits: createPendingMethod("Tron deposit watcher is pending"),
};
