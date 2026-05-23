const { ajModel } = require("../../common/classes/Model");
const { Schema } = require("mongoose");

const TX_HASH_UNIQUE_INDEX_NAME = "txHash_1_chain_1";
const TX_HASH_UNIQUE_INDEX_KEYS = { txHash: 1, chain: 1 };
const TX_HASH_UNIQUE_INDEX_OPTIONS = {
  name: TX_HASH_UNIQUE_INDEX_NAME,
  unique: true,
  partialFilterExpression: {
    txHash: {
      $exists: true,
      $type: "string",
      $gt: "",
    },
  },
};
const RISK_AMOUNT_WINDOW_INDEX = {
  name: "userId_1_chain_1_asset_1_status_1_createdAt_-1",
  fields: { userId: 1, chain: 1, asset: 1, status: 1, createdAt: -1 },
};
const RISK_DESTINATION_HISTORY_INDEX = {
  name: "userId_1_chain_1_destinationAddress_1_createdAt_-1",
  fields: { userId: 1, chain: 1, destinationAddress: 1, createdAt: -1 },
};

const schema = {
  userId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  accountId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "Account",
    required: false,
  },
  walletId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "Wallet",
    required: true,
  },
  chain: {
    type: String,
    required: true,
  },
  network: {
    type: String,
    default: "",
  },
  asset: {
    type: String,
    required: true,
  },
  amount: {
    type: String,
    required: true,
  },
  destinationAddress: {
    type: String,
    required: true,
  },
  executionParams: {
    type: Schema.Types.Mixed,
    default: {},
  },
  status: {
    type: String,
    default: "created",
  },
  reference: {
    type: String,
    required: true,
  },
  transactionId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "Transaction",
    required: false,
  },
  txHash: {
    type: String,
  },
  chainStatus: {
    type: String,
    default: "",
  },
  systemStatus: {
    type: String,
    default: "",
  },
  confirmedAt: {
    type: Date,
    required: false,
  },
  confirmed_at: {
    type: Date,
    required: false,
  },
  block_time: {
    type: Date,
    required: false,
  },
  failedAt: {
    type: Date,
    required: false,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
};

function hasExpectedTxHashIndex(indexDefinition = {}) {
  const partial = indexDefinition.partialFilterExpression || {};
  const txHashPartial = partial.txHash || {};

  return (
    indexDefinition?.name === TX_HASH_UNIQUE_INDEX_NAME &&
    indexDefinition?.unique === true &&
    txHashPartial.$exists === true &&
    txHashPartial.$type === "string" &&
    txHashPartial.$gt === ""
  );
}

async function ensureWithdrawalIndexes(WithdrawalModel) {
  if (!WithdrawalModel?.collection) {
    return;
  }

  try {
    let indexes = [];
  try {
    indexes = await WithdrawalModel.collection.indexes();
  } catch (error) {
    if (
      !error.message.includes("ns does not exist") &&
      !error.message.includes("ns not found") &&
      error.codeName !== "NamespaceNotFound" &&
      error.code !== 26
    ) {
      throw error;
    }
  }
    const existingTxHashIndex = indexes.find(
      (indexDefinition) => indexDefinition?.name === TX_HASH_UNIQUE_INDEX_NAME,
    );

    if (existingTxHashIndex && !hasExpectedTxHashIndex(existingTxHashIndex)) {
      await WithdrawalModel.collection.dropIndex(TX_HASH_UNIQUE_INDEX_NAME);
    }
  } catch (error) {
    // Collection might not exist yet, which is fine - we'll create it with indexes
    if (error.code !== 26) { // 26 = "ns does not exist"
      throw error;
    }
  }

  // These will create the collection if it doesn't exist
  await WithdrawalModel.collection.createIndex(
    TX_HASH_UNIQUE_INDEX_KEYS,
    TX_HASH_UNIQUE_INDEX_OPTIONS,
  );
  await WithdrawalModel.collection.createIndex(
    RISK_AMOUNT_WINDOW_INDEX.fields,
    {
      name: RISK_AMOUNT_WINDOW_INDEX.name,
      background: true,
    },
  );
  await WithdrawalModel.collection.createIndex(
    RISK_DESTINATION_HISTORY_INDEX.fields,
    {
      name: RISK_DESTINATION_HISTORY_INDEX.name,
      background: true,
    },
  );
}

const Withdrawal = new ajModel("Withdrawal", schema)
  .index({ userId: 1, createdAt: -1 })
  .index({ status: 1, createdAt: -1 })
  .index({ chain: 1, asset: 1, status: 1, createdAt: -1 })
  .index(RISK_AMOUNT_WINDOW_INDEX.fields, { name: RISK_AMOUNT_WINDOW_INDEX.name })
  .index({ txHash: 1 })
  .index(TX_HASH_UNIQUE_INDEX_KEYS, TX_HASH_UNIQUE_INDEX_OPTIONS)
  .index({ transactionId: 1 }, { unique: true, sparse: true })
  .index({ walletId: 1, status: 1 })
  .index(RISK_DESTINATION_HISTORY_INDEX.fields, { name: RISK_DESTINATION_HISTORY_INDEX.name })
  .getModel();

Withdrawal.ensureWithdrawalIndexes = () => ensureWithdrawalIndexes(Withdrawal);

module.exports = Withdrawal;
