const transactionService = require("./service");

async function executeTransaction(payload) {
  return transactionService.sendTransaction(payload);
}

module.exports = {
  executeTransaction,
};
