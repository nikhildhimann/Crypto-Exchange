const { createChainAdapter } = require("../factory");

module.exports = createChainAdapter("doge", {
  metadata: {
    implementationStatus: "active",
    isPlaceholder: false,
    label: "Dogecoin",
    nativeAssetSymbol: "DOGE",
    decimals: 8,
    baseUnitName: "koinu",
  },
  client: require("./client"),
  amount: require("./amount"),
  wallet: require("./wallet"),
  balance: require("./balance"),
  transaction: require("./transaction"),
  deposit: require("./deposit"),
  mapper: require("./mapper"),
  qr: require("./qr"),
  withdrawal: require("./withdrawal"),
});