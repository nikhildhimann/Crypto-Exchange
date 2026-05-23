const transaction = require("./transaction");

async function submitWithdrawal(input) {
  return transaction.executeTransfer(input);
}

module.exports = {
  submitWithdrawal,
};

