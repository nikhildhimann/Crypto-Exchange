const { createChainAdapter } = require("../factory");

module.exports = createChainAdapter("replace-me", {
  amount: require("./amount"),
  wallet: require("./wallet"),
  client: require("./client"),
  transaction: require("./transaction"),
  balance: require("./balance"),
  deposit: require("./deposit"),
  withdrawal: require("./withdrawal"),
  qr: require("./qr"),
  mapper: require("./mapper"),
});
