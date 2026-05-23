// Register only adapters that are runtime-ready and should appear as active support.
// Placeholder adapters can remain in the repo without being exposed through runtime config.
module.exports = [
  require("./xrp"),
  require("./solana"),
  require("./bnb"),
  require("./avax"),
  require("./polygon"),
  require("./eth"),
  require("./arbitrum"),
  require("./btc"),
  require("./ada"),
  require("./ltc"),
  require("./sui"),
  require("./aptos"),
  require("./ton"),
  require("./hbar"),
  require("./tron"),
  require("./doge"),
  require("./xtz"),
];
