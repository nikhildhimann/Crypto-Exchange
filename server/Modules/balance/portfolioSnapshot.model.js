const { ajModel, mongoose } = require("../../common/classes/Model");

const portfolioSnapshotSchema = {
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
    index: true,
  },
  walletSignature: {
    type: String,
    default: "",
    index: true,
  },
  balances: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  summary: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  asOf: {
    type: Date,
    default: null,
  },
};

module.exports = new ajModel("PortfolioSnapshot", portfolioSnapshotSchema)
  .index({ userId: 1, updatedAt: -1 })
  .getModel();
