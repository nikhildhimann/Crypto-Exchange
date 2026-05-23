const { createChainAdapter } = require("../factory");

module.exports = createChainAdapter("polygon", {
  metadata: {
    implementationStatus: "active",
    isPlaceholder: false,
  },
  client: require("./client"),
  amount: require("./amount"),
  wallet: require("./wallet"),
  transaction: require("./transaction"),
  balance: require("./balance"),
  deposit: require("./deposit"),
  withdrawal: require("./withdrawal"),
  qr: require("./qr"),
  mapper: require("./mapper"),
  nft: require("./nft"),
  nftTransfer: require("./nft.transfer"),
});
