const { JsonRpcProvider, formatEther } = require("ethers");

async function checkBalance() {
  const address = "0x05100261409AF59047fB4C3aD18B3d21230d9B38";
  const rpcs = [
    "https://polygon-mainnet.g.alchemy.com/v2/6QeIS9Ayz3Ps06Ei1pNz9", // From .env
    "https://polygon-rpc.com",
    "https://rpc-mainnet.maticvigil.com",
  ];

  for (const rpc of rpcs) {
    try {
      const provider = new JsonRpcProvider(rpc);
      const balance = await provider.getBalance(address);
      const block = await provider.getBlockNumber();
      console.log(`RPC: ${rpc}`);
      console.log(`Balance: ${formatEther(balance)} POL`);
      console.log(`Block: ${block}`);
      console.log("-------------------");
    } catch (e) {
      console.log(`RPC: ${rpc} - Error: ${e.message}`);
    }
  }
}

checkBalance();
