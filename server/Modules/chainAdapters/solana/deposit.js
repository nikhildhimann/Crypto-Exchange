const transaction = require("./transaction");

async function watchDeposits(input) {
  const entries = await transaction.fetchHistory({
    network: input.network,
    address: input.address,
    limit: input.limit || 50,
  });

  return entries.filter((entry) => {
    const instructions = entry?.parsedTransaction?.transaction?.message?.instructions || [];

    return instructions.some((instruction) => {
      const info = instruction?.parsed?.info || {};
      return (
        instruction?.program === "system" &&
        instruction?.parsed?.type === "transfer" &&
        String(info.destination || "") === String(input.address)
      );
    });
  });
}

module.exports = {
  watchDeposits,
};
