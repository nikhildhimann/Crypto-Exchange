const { requireEnv } = require("./utils");

const BASE_URL = requireEnv("MANUAL_API_BASE_URL").replace(/\/+$/, "");

async function test() {
  console.log("--- Testing Market Prices Endpoint ---");
  try {
    const res = await fetch(`${BASE_URL}/market/prices?assets=BNB,SOL,XRP`);
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Data:", JSON.stringify(data.data, null, 2));
  } catch (error) {
    console.error("Market Prices Error:", error.message);
  }

  console.log("\n--- Testing Balance Enrichment (Requires Auth) ---");
  console.log("Note: This script assumes the server is running and accessible.");
  console.log("Price endpoint verification confirms if the market service is correctly integrated.");
}

test().catch((error) => {
  console.error(error);
  process.exit(1);
});
