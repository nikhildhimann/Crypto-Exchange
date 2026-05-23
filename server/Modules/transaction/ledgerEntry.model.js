const { mongoose } = require("../../common/classes/Model");

const ledgerEntrySchema = new mongoose.Schema(
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
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    amount: {
      type: String,
      required: true,
    },
    amountBaseUnits: {
      type: String,
      required: true,
    },
    asset: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      enum: ["internal_transfer", "platform_fee"],
      default: "internal_transfer",
    },
    note: {
      type: String,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

ledgerEntrySchema.index({ walletId: 1, createdAt: -1 });

module.exports =
  mongoose.models.LedgerEntry || mongoose.model("LedgerEntry", ledgerEntrySchema);
