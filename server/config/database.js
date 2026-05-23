const mongoose = require("mongoose");
const appConfig = require("./app");
const logger = require("../common/utils/logger");
const runtimeState = require("../services/runtimeState");
const Transaction = require("../Modules/transaction/model");
const Withdrawal = require("../Modules/withdrawal/model");
const Swap = require("../Modules/swap/model");
const TreasuryWallet = require("../Modules/treasury/model");
const Wallet = require("../Modules/wallet/model");
const User = require("../Modules/user/model");
const Account = require("../Modules/accounts/model");

let connected = false;

async function ensureCollectionsExist() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection not available");
  }

  const requiredCollections = [
    'transactions',
    'withdrawals',
    'swaps',
    'treasurywallets',
    'wallets',
    'users',
    'accounts'
  ];

  for (const collectionName of requiredCollections) {
    try {
      const collections = await db.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        logger.info(`Creating collection: ${collectionName}`, {
          event: "database_collection_create",
          collection: collectionName
        });
        await db.createCollection(collectionName);
      }
    } catch (error) {
      logger.warn(`Could not ensure collection ${collectionName} exists`, {
        event: "database_collection_check_failed",
        collection: collectionName,
        error: error.message
      });
      // Continue - some MongoDB setups might not allow explicit collection creation
    }
  }
}

async function connectDB() {
  if (connected) {
    return mongoose.connection;
  }

  if (!process.env.DB_URI) {
    logger.warn("DB_URI is not configured, database connection skipped");
    return null;
  }

  try {
    await mongoose.connect(process.env.DB_URI, {
      autoIndex: appConfig.nodeEnv !== "production",
    });
    connected = true;
    logger.info("MongoDB connected", {
      event: "database_connected",
      host: mongoose.connection.host || "",
      name: mongoose.connection.name || "",
    });

    // Ensure required collections exist before creating indexes
    await ensureCollectionsExist();

    await Transaction.ensureTransactionIndexes();
    await Withdrawal.ensureWithdrawalIndexes();
    await Swap.ensureSwapIndexes();

    return mongoose.connection;
  } catch (error) {
    logger.error("MongoDB connection failed", {
      event: "database_connection_failed",
      error: error.message,
    });
    throw error;
  }
}

function getDatabaseStatus() {
  return {
    connected,
    readyState: mongoose.connection.readyState,
    status: runtimeState.connectionStateToStatus(mongoose.connection.readyState),
    host: mongoose.connection.host || "",
    name: mongoose.connection.name || "",
  };
}

module.exports = connectDB;
module.exports.getDatabaseStatus = getDatabaseStatus;
