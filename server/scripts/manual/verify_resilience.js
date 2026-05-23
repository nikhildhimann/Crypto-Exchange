const mongoose = require("mongoose");

const balanceService = require("../../Modules/balance/service");
const Wallet = require("../../Modules/wallet/model");
const { requireEnv } = require("./utils");

async function verify() {
  console.log("--- Starting REAL Balance Resilience Verification ---");
  let testWalletId = null;

  try {
    const dbUri = requireEnv("DB_URI");
    await mongoose.connect(dbUri);
    console.log("Connected to MongoDB.");

    const sampleWallet = await Wallet.findOne().lean();
    if (!sampleWallet) {
      console.log("No existing wallets found for sample userId.");
      return;
    }

    const userId = sampleWallet.userId;
    console.log(`Using User ID: ${userId}`);

    const bnbWallet = await Wallet.create({
      userId,
      chain: "bnb",
      network: "mainnet",
      address: "0x0000000000000000000000000000000000000001",
      publicKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
      asset: "BNB",
      label: "Resilience Test (BNB)",
      sourceType: "created",
      isImported: false,
      encryptedRecoveryPhrase: {
        algorithm: "aes-256-gcm",
        cipherText: "dummy",
        iv: "dummy",
        authTag: "dummy",
        keyVersion: 1,
      },
    });
    testWalletId = bnbWallet._id;
    console.log(`Created temporary BNB wallet: ${testWalletId}`);

    console.log("Calling listBalances()...");
    const balances = await balanceService.listBalances(userId);

    console.log(`\nResults (${balances.length} wallets):`);
    balances.forEach((balance, index) => {
      const status = balance.source === "error" ? "ERROR" : "LIVE";
      console.log(
        `${index + 1}. [${status}] ${balance.chain.toUpperCase()} (${balance.asset}): ${balance.balance} ${balance.asset} | Source: ${balance.source}`,
      );
      if (balance.source === "error") {
        console.log(`   Reason: ${balance.errors?.reason}`);
      }
      console.log(`   Price: $${balance.priceUsd}, Value: $${balance.fiatValue}`);
    });

    const bnbResult = balances.find((balance) => String(balance.walletId) === String(testWalletId));
    const liveResults = balances.filter((balance) => balance.chain !== "bnb" && balance.source === "live");

    if (bnbResult && bnbResult.source === "error" && liveResults.length > 0) {
      console.log(
        "\nVERIFICATION SUCCESS: Endpoint is resilient. BNB failed as expected with fallback while other wallets remained live.",
      );
    } else if (bnbResult && bnbResult.source === "error") {
      console.log("\nVERIFICATION PARTIAL: BNB failed with fallback. No other live wallets found to compare.");
    } else {
      console.log("\nVERIFICATION FAILED: Expected BNB to fail with source='error'.");
    }
  } catch (error) {
    console.error("\nCRITICAL FAILURE: The entire listBalances call threw an error:", error);
    process.exitCode = 1;
  } finally {
    if (testWalletId) {
      console.log(`\nCleaning up temporary wallet: ${testWalletId}`);
      await Wallet.deleteOne({ _id: testWalletId }).catch(() => null);
    }

    await mongoose.disconnect().catch(() => null);
  }
}

verify();
