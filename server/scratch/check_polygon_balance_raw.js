const axios = require("axios");

async function checkBalanceRaw() {
  const address = "0x05100261409AF59047fB4C3aD18B3d21230d9B38";
  const rpcs = [
    "https://polygon-mainnet.g.alchemy.com/v2/6QeIS9Ayz3Ps06Ei1pNz9", // From .env
    "https://polygon-rpc.com",
    "https://rpc-mainnet.maticvigil.com",
  ];

  for (const rpc of rpcs) {
    try {
      const response = await axios.post(rpc, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }, { timeout: 10000 });

      console.log(`RPC: ${rpc}`);
      console.log(`Result: ${JSON.stringify(response.data)}`);
      if (response.data.result) {
        const balanceWei = BigInt(response.data.result);
        console.log(`Balance: ${balanceWei.toString()} wei (${(Number(balanceWei) / 1e18).toFixed(18)} POL)`);
      }
      console.log("-------------------");
    } catch (e) {
      console.log(`RPC: ${rpc} - Error: ${e.message}`);
    }
  }
}

checkBalanceRaw();
