require("dotenv").config({ path: "../../.env" });
const mongoose = require("mongoose");
const axios = require("axios");
const marketplaceService = require("../../Modules/nft/marketplace.service");
const NftListing = require("../../Modules/nft/nftListing.model");
const NftOrder = require("../../Modules/nft/nftOrder.model");

// Use standard collection for connectivity check
const TEST_COLLECTION_SLUG = "boredapeyachtclub"; 
const TEST_CONTRACT_POLYGON = "0x2953399124f0cbb46d2cbacd8a89cf0599974963"; // OpenSea Shared Storefront or similar

async function run() {
  console.log("\nStarting Manual NFT Marketplace Checks (OpenSea/Seaport)...\n");
  let passed = 0;
  let total = 5;

  // 1. Connect MongoDB
  if (!process.env.DB_URI) {
    console.error("❌ FAILED: DB_URI not found in env");
    process.exit(1);
  }
  await mongoose.connect(process.env.DB_URI);
  console.log("✅ Connected to MongoDB\n");

  // CHECK 1 — ENV variables
  try {
    process.stdout.write("CHECK 1 - ENV variables present: ");
    const vars = [
      "OPENSEA_API_KEY", 
      "ALCHEMY_API_KEY", 
      "OPENSEA_BASE_URL", 
      "NFT_MARKETPLACE_DEFAULT_CHAIN"
    ];
    const missing = vars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      console.log(`❌ FAILED (Missing: ${missing.join(", ")})`);
    } else {
      console.log("✅ PASSED");
      passed++;
    }
  } catch (err) {
    console.log(`❌ FAILED (${err.message})`);
  }

  // CHECK 2 — OpenSea API reachable
  try {
    process.stdout.write("CHECK 2 - OpenSea API reachable: ");
    const baseUrl = process.env.OPENSEA_BASE_URL || "https://api.opensea.io/api/v2";
    
    const response = await axios.get(`${baseUrl}/collections/${TEST_COLLECTION_SLUG}/stats`, {
      headers: { "x-api-key": process.env.OPENSEA_API_KEY },
      timeout: 15000
    });
    
    if (response.status === 200) {
      console.log("✅ PASSED");
      passed++;
    } else {
      console.log(`❌ FAILED (Status: ${response.status})`);
    }
  } catch (err) {
    const msg = err.response?.data?.detail || err.message;
    console.log(`❌ FAILED (${msg})`);
    if (err.response?.status === 403) {
      console.log("   (TIP: Check if your OPENSEA_API_KEY is valid and not rate-limited)");
    }
  }

  // CHECK 3 — Browse Polygon listings
  try {
    process.stdout.write("CHECK 3 - Browse Polygon listings: ");
    // Searching for a known active collection on Polygon
    const result = await marketplaceService.getMarketplaceListings({
      contractAddress: TEST_CONTRACT_POLYGON,
      chain: "polygon",
      limit: 5
    });
    
    if (result && Array.isArray(result.items)) {
      console.log(`✅ PASSED (Found ${result.items.length} items)`);
      passed++;
    } else {
      console.log("❌ FAILED (Invalid items array)");
    }
  } catch (err) {
    console.log(`❌ FAILED (${err.message})`);
  }

  // CHECK 4 — Floor price with fallback
  try {
    process.stdout.write("CHECK 4 - Floor price (OS/Alchemy): ");
    const result = await marketplaceService.getFloorPrice({
      contractAddress: TEST_CONTRACT_POLYGON,
      chain: "polygon"
    });
    
    if (result === null) {
      console.log("✅ PASSED (Floor: NULL - Acceptable for non-indexed collections)");
      passed++;
    } else if (result.floorPriceMatic !== undefined) {
      console.log(`✅ PASSED (Floor: ${result.floorPriceMatic} MATIC via ${result.source})`);
      passed++;
    } else {
      console.log("❌ FAILED (Unexpected response format)");
    }
  } catch (err) {
    console.log(`❌ FAILED (${err.message})`);
  }

  // CHECK 5 — DB connectivity
  try {
    process.stdout.write("CHECK 5 - DB models accessible: ");
    const count = await NftListing.countDocuments();
    console.log(`✅ PASSED (Found ${count} local listings)`);
    passed++;
  } catch (err) {
    console.log(`❌ FAILED (${err.message})`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${passed}/${total} checks passed.`);
  console.log("=".repeat(60) + "\n");

  if (passed < total) {
    console.log("NOTE: Some external API checks might fail due to rate limits or invalid keys.");
    console.log("      Ensure OPENSEA_API_KEY and ALCHEMY_API_KEY are correct.\n");
  }

  console.log("CHECK 6 — Manual Route Verification");
  console.log("1. Start server: npm run dev");
  console.log("2. Run: curl -X GET http://localhost:6001/api/nft/marketplace/listings?contractAddress=" + TEST_CONTRACT_POLYGON);
  console.log("\nVerify that you see a JSON response with status: success.\n");

  await mongoose.disconnect();
  process.exit(passed === total ? 0 : 1);
}

run().catch(err => {
  console.error("\nFATAL ERROR DURING TEST:", err);
  process.exit(1);
});
