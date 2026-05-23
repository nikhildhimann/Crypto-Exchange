const transaction = require("./transaction");

async function watchDeposits(input) {
  const entries = await transaction.fetchHistory({
    network: input.network,
    address: input.address,
    limit: input.limit || 50,
  });

  return entries.filter((entry) => {
    // TzKT operation object
    return (
      entry &&
      entry.type === "transaction" &&
      entry.target &&
      entry.target.address === input.address
    );
  });
}

module.exports = {
  watchDeposits,
};
