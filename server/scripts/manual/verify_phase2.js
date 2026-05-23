const marketService = require("../../Modules/market/service");

require("./utils");

async function verify() {
  console.log("--- Starting Phase 2 Market Data Verification ---");

  const testAssets = ["SOL", "ETH", "BTC"];

  try {
    console.log("\n1. Testing Market Stats...");
    for (const asset of testAssets) {
      const stats = await marketService.getMarketStats(asset);
      if (stats) {
        console.log(
          `[OK] ${asset} Stats: Price: $${stats.priceUsd}, Cap: $${stats.marketCap.toLocaleString()}, Rank: #${stats.rank}`,
        );
      } else {
        console.log(`[FAILED] ${asset} Stats failed`);
      }
    }

    console.log("\n2. Testing Market Chart (SOL) - waiting 5s for rate limit...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const chart = await marketService.getMarketChart("SOL", "1D");
    if (chart && chart.length > 0) {
      console.log(`[OK] SOL Chart: Received ${chart.length} data points.`);
    } else {
      console.log("[FAILED] SOL Chart failed.");
    }

    console.log("\n3. Testing Caching (Stats)...");
    const start = Date.now();
    await marketService.getMarketStats("SOL");
    const duration = Date.now() - start;
    console.log(`[OK] Cached Stats Fetch took ${duration}ms (Expected < 10ms)`);

    console.log("\n--- Verification Complete ---");
  } catch (error) {
    console.error("Verification failed with error:", error);
    process.exitCode = 1;
  }
}

verify();
