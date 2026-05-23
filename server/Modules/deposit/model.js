const { ajModel } = require("../../common/classes/Model");

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
  address: {
    type: String,
    required: true,
  },
  txHash: {
    type: String,
    default: "",
  },
  vout: {
    type: Number,
    required: false,
  },
  amount: {
    type: String,
    default: "0",
  },
  confirmations: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    default: "pending",
  },
  transactionId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "Transaction",
    required: false,
  },
  chainStatus: {
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
  metadata: {
    type: require("mongoose").Schema.Types.Mixed,
    default: {},
  },
};

module.exports = new ajModel("Deposit", schema)
  .index(
    { walletId: 1, txHash: 1, vout: 1 },
    {
      name: "walletId_txHash_vout_unique_compat",
      unique: true,
    },
  )
  .index({ txHash: 1, chain: 1 }, { sparse: true })
  .index({ userId: 1, createdAt: -1 })
  .index({ status: 1, createdAt: -1 })
  .index({ chain: 1, asset: 1, status: 1, createdAt: -1 })
  .index({ walletId: 1, transactionId: 1 }, { sparse: true })
  .index({ walletId: 1, txHash: 1 })
  .index({ txHash: 1 })
  .index({ txHash: 1, vout: 1 })
  .getModel();
