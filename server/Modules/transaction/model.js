const { mongoose } = require("../../common/classes/Model");
const {
  defaultChain,
  getChainConfig,
  getConfiguredChainCodes,
  getConfiguredNetworkCodes,
} = require("../../config/chains");

function validateChainNetwork(network) {
  return getConfiguredNetworkCodes(this.chain || defaultChain).includes(
    String(network || "").toLowerCase(),
  );
}

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: false,
      index: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    chain: {
      type: String,
      enum: getConfiguredChainCodes(),
      required: true,
      default: defaultChain,
      index: true,
    },
    fromAddress: { type: String, required: true },
    toAddress: { type: String, required: true },
    executionParams: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    amount: { type: String, required: true },
    amountBaseUnits: { type: String, default: "0" },
    currency: {
      type: String,
      default() {
        return getChainConfig(this.chain || defaultChain)?.nativeAssetSymbol || "";
      },
    },
    asset: {
      type: String,
      default() {
        return getChainConfig(this.chain || defaultChain)?.nativeAssetSymbol || "";
      },
    },
    assetType: {
      type: String,
      default: "native",
    },
    standard: {
      type: String,
      default: "native",
    },
    contractAddress: {
      type: String,
      default: null,
    },
    network: {
      type: String,
      enum: getConfiguredNetworkCodes(),
      required: true,
      validate: {
        validator: validateChainNetwork,
        message(props) {
          const chain = this.chain || defaultChain;
          return `Network "${props.value}" is not supported for chain "${chain}"`;
        },
      },
    },
    transactionType: {
      type: String,
      enum: ["internal", "external"],
      required: true,
    },
    direction: {
      type: String,
      enum: ["incoming", "outgoing"],
      required: true,
    },
    type: {
      type: String,
      default: "transfer",
    },
    networkFee: { type: String, default: "0" },
    networkFeeBaseUnits: { type: String, default: "0" },
    networkFeeAsset: { type: String, default: null },
    networkFeeCurrency: { type: String, default: null },
    networkFeeAssetType: { type: String, default: null },
    platformFee: { type: String, default: "0" },
    platformFeeBaseUnits: { type: String, default: "0" },
    totalDebit: { type: String, default: "0" },
    totalDebitBaseUnits: { type: String, default: "0" },
    totalDebitAsset: { type: String, default: null },
    totalDebitCurrency: { type: String, default: null },
    totalDebitAssetType: { type: String, default: null },
    compositeDebit: { type: mongoose.Schema.Types.Mixed, default: null },
    recipientGets: { type: String, default: "0" },
    recipientGetsBaseUnits: { type: String, default: "0" },
    txHash: { type: String, index: true },
    historyUniqueKey: { type: String, default: null },
    confirmations: { type: Number, default: 0 },
    ledgerIndex: { type: Number },
    validated: { type: Boolean, default: false },
    succeeded: { type: Boolean, default: false },
    confirmations: { type: Number, default: 0 },
    chainTimestamp: { type: Date, index: true },
    chainStatus: { type: String, default: "not_submitted" },
    systemStatus: { type: String, default: "created" },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
      index: true,
    },
    errorMessage: { type: String },
    isSystemManaged: {
      type: Boolean,
      default: false,
      index: true,
    },
    visibleInSuperadmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    rawRequest: { type: mongoose.Schema.Types.Mixed },
    rawResponse: { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    block_time: { type: Date, index: true },
    confirmedAt: { type: Date },
    confirmed_at: { type: Date },
    relatedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

const TX_HASH_UNIQUE_INDEX_NAME = "walletId_1_txHash_1_chain_1";
const LEGACY_TX_HASH_UNIQUE_INDEX_NAME = "txHash_1_chain_1";
const TX_HASH_UNIQUE_INDEX_KEYS = { walletId: 1, txHash: 1, chain: 1 };
const TX_HASH_UNIQUE_INDEX_OPTIONS = {
  name: TX_HASH_UNIQUE_INDEX_NAME,
  unique: true,
  partialFilterExpression: {
    walletId: {
      $exists: true,
    },
    txHash: {
      $exists: true,
      $type: "string",
      $gt: "",
    },
  },
};

const HISTORY_UNIQUE_KEY_INDEX_NAME = "walletId_1_chain_1_historyUniqueKey_1";
const HISTORY_UNIQUE_KEY_INDEX_KEYS = { walletId: 1, chain: 1, historyUniqueKey: 1 };
const HISTORY_UNIQUE_KEY_INDEX_OPTIONS = {
  name: HISTORY_UNIQUE_KEY_INDEX_NAME,
  unique: true,
  partialFilterExpression: {
    historyUniqueKey: {
      $exists: true,
      $type: "string",
      $gt: "",
    },
  },
};

transactionSchema.index(TX_HASH_UNIQUE_INDEX_KEYS, TX_HASH_UNIQUE_INDEX_OPTIONS);
transactionSchema.index(HISTORY_UNIQUE_KEY_INDEX_KEYS, HISTORY_UNIQUE_KEY_INDEX_OPTIONS);

// Primary sort index for wallet-scoped history (covers the exact 3-field sort in listTransactions).
// Frontier pages are served by skipping on chainTimestamp alone; confirmed rows naturally
// fall behind un-timestamped pending rows that carry only createdAt.
transactionSchema.index({ walletId: 1, isSystemManaged: 1, chainTimestamp: -1, confirmedAt: -1, createdAt: -1 });

// Primary sort index for user/account-scoped global history.
transactionSchema.index({ userId: 1, isSystemManaged: 1, chainTimestamp: -1, confirmedAt: -1, createdAt: -1 });

// Filtered history by status (e.g. pending tab) on a per-wallet basis.
transactionSchema.index({ walletId: 1, status: 1, createdAt: -1 });

// Filtered history by status on a per-user basis.
transactionSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Narrow bootstrap and reconciliation aggregations: match pending rows by userId/walletId without scanning full history.
transactionSchema.index({ userId: 1, walletId: 1, status: 1 });

// Phase-2 semantic reconciliation index.
// Covers the exact fields in the reconciliationQuery inside findExistingHistoryTransaction:
// walletId + status:pending + direction + asset + amountBaseUnits, bounded by createdAt.
// This lets MongoDB narrow to the correct pending candidate set without a collection scan.
transactionSchema.index({
  walletId: 1,
  status: 1,
  direction: 1,
  asset: 1,
  amountBaseUnits: 1,
  createdAt: -1,
});

// Keep the legacy sparse indexes for backward compatibility on existing deployments.
transactionSchema.index({ accountId: 1, createdAt: -1 }, { sparse: true });
transactionSchema.index({ status: 1, chain: 1, network: 1, createdAt: -1 });

// Superadmin transaction listing defaults to createdAt desc and must only surface
// explicit platform-owned records.
transactionSchema.index({ visibleInSuperadmin: 1, createdAt: -1, _id: -1 });

function hasExpectedTxHashIndex(indexDefinition = {}) {
  const partial = indexDefinition.partialFilterExpression || {};
  const walletIdPartial = partial.walletId || {};
  const txHashPartial = partial.txHash || {};

  return (
    indexDefinition?.name === TX_HASH_UNIQUE_INDEX_NAME &&
    indexDefinition?.unique === true &&
    walletIdPartial.$exists === true &&
    txHashPartial.$exists === true &&
    txHashPartial.$type === "string" &&
    txHashPartial.$gt === ""
  );
}

function hasExpectedHistoryUniqueKeyIndex(indexDefinition = {}) {
  const partial = indexDefinition.partialFilterExpression || {};
  const historyUniqueKeyPartial = partial.historyUniqueKey || {};

  return (
    indexDefinition?.name === HISTORY_UNIQUE_KEY_INDEX_NAME &&
    indexDefinition?.unique === true &&
    historyUniqueKeyPartial.$exists === true &&
    historyUniqueKeyPartial.$type === "string" &&
    historyUniqueKeyPartial.$gt === ""
  );
}

async function ensureTransactionIndexes(TransactionModel) {
  if (!TransactionModel?.collection) {
    return;
  }

  // If the collection does not exist yet, createIndex will create it implicitly.
  let indexes = [];
  try {
    indexes = await TransactionModel.collection.indexes();
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

  const legacyTxHashIndex = indexes.find(
    (indexDefinition) =>
      indexDefinition?.name === LEGACY_TX_HASH_UNIQUE_INDEX_NAME,
  );
  const existingTxHashIndex = indexes.find(
    (indexDefinition) => indexDefinition?.name === TX_HASH_UNIQUE_INDEX_NAME,
  );
  const existingHistoryUniqueKeyIndex = indexes.find(
    (indexDefinition) => indexDefinition?.name === HISTORY_UNIQUE_KEY_INDEX_NAME,
  );

  if (legacyTxHashIndex) {
    await TransactionModel.collection.dropIndex(LEGACY_TX_HASH_UNIQUE_INDEX_NAME);
  }

  if (existingTxHashIndex && !hasExpectedTxHashIndex(existingTxHashIndex)) {
    await TransactionModel.collection.dropIndex(TX_HASH_UNIQUE_INDEX_NAME);
  }

  if (existingHistoryUniqueKeyIndex && !hasExpectedHistoryUniqueKeyIndex(existingHistoryUniqueKeyIndex)) {
    await TransactionModel.collection.dropIndex(HISTORY_UNIQUE_KEY_INDEX_NAME);
  }

  await TransactionModel.collection.createIndex(
    TX_HASH_UNIQUE_INDEX_KEYS,
    TX_HASH_UNIQUE_INDEX_OPTIONS,
  );

  await TransactionModel.collection.createIndex(
    HISTORY_UNIQUE_KEY_INDEX_KEYS,
    HISTORY_UNIQUE_KEY_INDEX_OPTIONS,
  );
}

const Transaction =
  mongoose.models.Transaction || mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
module.exports.ensureTransactionIndexes = () => ensureTransactionIndexes(Transaction);
