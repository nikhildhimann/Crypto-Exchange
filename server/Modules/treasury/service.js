const TreasuryWallet = require("./model");

async function listTreasuryWallets() {
  return TreasuryWallet.find({}).sort({ chain: 1, asset: 1 });
}

module.exports = {
  listTreasuryWallets,
};
