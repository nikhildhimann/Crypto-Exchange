const { mongoose } = require("../../common/classes/Model");

const destinationTagSchema = new mongoose.Schema(
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
    },
    chain: {
      type: String,
      required: true,
      default: "xrp",
      index: true,
    },
    network: {
      type: String,
      required: true,
      default: "mainnet",
      index: true,
    },
    tag: {
      type: Number,
      required: true,
      min: 0,
      max: 4294967295, // 32-bit unsigned integer max
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// Unique constraint: one tag per wallet
destinationTagSchema.index({ walletId: 1 }, { unique: true });

// Global uniqueness constraint for tags
destinationTagSchema.index({ chain: 1, network: 1, tag: 1 }, { unique: true });

// Compound index for efficient lookups
destinationTagSchema.index({ userId: 1, accountId: 1, status: 1 });

module.exports = mongoose.models.DestinationTag || mongoose.model("DestinationTag", destinationTagSchema);
