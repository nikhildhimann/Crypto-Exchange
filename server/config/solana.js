const { getChainConfig } = require("./chains");

const runtimeDefaultNetwork = getChainConfig("solana")?.defaultNetwork || "mainnet";

module.exports = {
  defaultNetwork: process.env.SOLANA_DEFAULT_NETWORK || runtimeDefaultNetwork,
  commitment: process.env.SOLANA_COMMITMENT || "confirmed",
  rpcRetry: {
    maxAttempts: Number(process.env.SOLANA_RPC_MAX_ATTEMPTS || 4),
    baseDelayMs: Number(process.env.SOLANA_RPC_BASE_DELAY_MS || 500),
  },
  history: {
    parsedBatchSize: Number(process.env.SOLANA_HISTORY_BATCH_SIZE || 10),
  },
  networks: {
    mainnet: String(process.env.SOLANA_MAINNET_URL || "").trim(),
    testnet: String(process.env.SOLANA_TESTNET_URL || "").trim(),
  },
};
