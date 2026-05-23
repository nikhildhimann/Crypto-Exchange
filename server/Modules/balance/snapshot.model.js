const { ajModel } = require("../../common/classes/Model");

const schema = {
  userId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  walletId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "Wallet",
    default: null,
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
  available: {
    type: String,
    default: "0",
  },
  locked: {
    type: String,
    default: "0",
  },
  total: {
    type: String,
    default: "0",
  },
  availableBaseUnits: {
    type: String,
    default: "0",
  },
  lockedBaseUnits: {
    type: String,
    default: "0",
  },
  totalBaseUnits: {
    type: String,
    default: "0",
  },
  decimals: {
    type: Number,
    default: 0,
  },
  baseUnitName: {
    type: String,
    default: "",
  },
  syncedAt: {
    type: Date,
    default: null,
  },
};

module.exports = new ajModel("BalanceSnapshot", schema)
  .index({ userId: 1, walletId: 1, chain: 1, network: 1, asset: 1 }, { unique: true })
  .getModel();
