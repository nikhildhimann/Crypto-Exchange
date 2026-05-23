const { Connection } = require("@solana/web3.js");

const { requireEnv } = require("./utils");

async function check() {
  const rpcUrl = requireEnv("SOLANA_MAINNET_URL");
  const txHash = requireEnv("MANUAL_SOLANA_TX_HASH");
  const connection = new Connection(rpcUrl, "confirmed");
  const tx = await connection.getParsedTransaction(txHash, {
    maxSupportedTransactionVersion: 0,
  });
  console.log(JSON.stringify(tx, null, 2));
}

check().catch((error) => {
  console.error(error);
  process.exit(1);
});
