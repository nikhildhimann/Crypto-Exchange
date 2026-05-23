const transaction = require("./transaction");

module.exports = {
  async submitWithdrawal(input) {
    return transaction.executeTransfer(input);
  },
};
