const { mongoose } = require("../../common/classes/Model");

const transactionSyncJobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    scheduledAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// Prevent duplicate pending/processing jobs for the same wallet to ensure deduplication.
// This allows at most one active (pending or processing) job per wallet.
transactionSyncJobSchema.index(
  { walletId: 1, status: 1 },
  { 
    unique: true, 
    partialFilterExpression: { status: { $in: ["pending", "processing"] } } 
  }
);

module.exports =
  mongoose.models.TransactionSyncJob ||
  mongoose.model("TransactionSyncJob", transactionSyncJobSchema);
