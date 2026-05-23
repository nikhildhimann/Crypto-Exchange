const transactionService = require("./service");

async function previewTransaction(payload) {
  return transactionService.previewTransfer(payload);
}

module.exports = {
  previewTransaction,
};
