const { ajModel } = require("../../common/classes/Model");
const { Schema } = require("mongoose");

const schema = {
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  walletId: {
    type: Schema.Types.ObjectId,
    ref: "Wallet",
    required: true,
    index: true,
  },
  accountId: {
    type: Schema.Types.ObjectId,
    ref: "Account",
    default: null,
    index: true,
  },
  chain: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  ownerAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  provider: {
    type: String,
    enum: ["alchemy"],
    required: true,
    default: "alchemy",
  },
  assetCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  collectionCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  lastSyncedAt: {
    type: Date,
    default: null,
    index: true,
  },
  isSyncing: {
    type: Boolean,
    default: false,
    index: true,
  },
  needsRefresh: {
    type: Boolean,
    default: false,
    index: true,
  },
  lastAttemptAt: {
    type: Date,
    default: null,
  },
  lastError: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    enum: ["success", "stale"],
    required: true,
    default: "success",
  },
};

module.exports = new ajModel("NFTSyncState", schema)
  .index(
    { userId: 1, walletId: 1, chain: 1 },
    { unique: true, name: "uniq_nft_sync_state_wallet_chain" },
  )
  .index({ ownerAddress: 1, chain: 1 }, { name: "idx_nft_sync_state_owner_chain" })
  .getModel();
