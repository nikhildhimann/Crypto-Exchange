const { createPendingMethod } = require("../pending");

module.exports = {
  submitWithdrawal: createPendingMethod("Tron withdrawal is pending"),
};
