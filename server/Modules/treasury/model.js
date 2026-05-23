const { ajModel } = require("../../common/classes/Model");

const schema = {
  chain: {
    type: String,
    required: true,
  },
  asset: {
    type: String,
    required: true,
  },
  walletType: {
    type: String,
    enum: ["hot", "warm", "cold"],
    default: "hot",
  },
  address: {
    type: String,
    required: true,
  },
  balance: {
    type: String,
    default: "0",
  },
  status: {
    type: String,
    default: "active",
  },
};

module.exports = new ajModel("TreasuryWallet", schema)
  .index({ chain: 1, asset: 1, walletType: 1 })
  .getModel();
