const { getChainConfig } = require("./chains");

const runtimeDefaultNetwork = getChainConfig("xrp")?.defaultNetwork || "mainnet";

module.exports = {
  defaultNetwork: process.env.XRPL_DEFAULT_NETWORK || runtimeDefaultNetwork,
  networks: {
    mainnet: String(process.env.XRPL_MAINNET_URL || "").trim(),
    testnet: String(process.env.XRPL_TESTNET_URL || "").trim(),
  },
};
