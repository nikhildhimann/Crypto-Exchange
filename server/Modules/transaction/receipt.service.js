function buildReceipt(transaction) {
  return {
    reference: transaction.txHash || String(transaction._id || ""),
    status: transaction.status,
    chain: transaction.chain,
    asset: transaction.asset,
    amount: transaction.amount,
    txHash: transaction.txHash,
  };
}

module.exports = {
  buildReceipt,
};
