const { mongoose } = require("../../common/classes/Model");
const {
  getConfiguredChainCodes,
  getConfiguredNetworkCodes,
} = require("../../config/chains");

const SWAP_STATUSES = Object.freeze([
  "previewed",
  "expired",
  "awaiting_source_submission",
  "awaiting_source_confirmation",
  "ready_for_payout",
  "source_received",
  "payout_submitted",
  "completed",
  "failed",
  "payout_failed",
  "manual_review",
]);

function validateNetworkForChain(chainField) {
  return function validateNetwork(value) {
    return getConfiguredNetworkCodes(this[chainField]).includes(
      String(value || "").toLowerCase(),
    );
  };
}

async function ensureSwapIndexes(SwapModel) {
  if (!SwapModel?.collection) {
    return;
  }

  await Promise.all([
    SwapModel.collection.createIndex(
      { userId: 1, status: 1, createdAt: -1 },
      { background: true, name: "swap_user_status_created" },
    ),
    SwapModel.collection.createIndex(
      { accountId: 1, status: 1, createdAt: -1 },
      { background: true, sparse: true, name: "swap_account_status_created" },
    ),
    SwapModel.collection.createIndex(
      { fromWalletId: 1, toWalletId: 1, createdAt: -1 },
      { background: true, name: "swap_wallet_pair_created" },
    ),
    SwapModel.collection.createIndex(
      { status: 1, quoteExpiresAt: 1 },
      { background: true, name: "swap_status_quote_expiry" },
    ),
    SwapModel.collection.createIndex(
      { fromChain: 1, fromNetwork: 1, toChain: 1, toNetwork: 1, createdAt: -1 },
      { background: true, name: "swap_route_created" },
    ),
    SwapModel.collection.createIndex(
      { sourceTransactionId: 1 },
      { background: true, sparse: true, name: "swap_source_transaction" },
    ),
    SwapModel.collection.createIndex(
      { sourceTxHash: 1, fromChain: 1, fromNetwork: 1 },
      { background: true, sparse: true, name: "swap_source_hash_chain" },
    ),
    SwapModel.collection.createIndex(
      { payoutTxHash: 1, toChain: 1, toNetwork: 1 },
      { background: true, sparse: true, name: "swap_payout_hash_chain" },
    ),
  ]);
}

const swapSchema = new mongoose.Schema(
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
    fromWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    toWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    fromChain: {
      type: String,
      enum: getConfiguredChainCodes(),
      required: true,
      index: true,
    },
    fromNetwork: {
      type: String,
      enum: getConfiguredNetworkCodes(),
      required: true,
      validate: {
        validator: validateNetworkForChain("fromChain"),
        message(props) {
          return `Network "${props.value}" is not supported for source chain "${this.fromChain}"`;
        },
      },
    },
    toChain: {
      type: String,
      enum: getConfiguredChainCodes(),
      required: true,
      index: true,
    },
    toNetwork: {
      type: String,
      enum: getConfiguredNetworkCodes(),
      required: true,
      validate: {
        validator: validateNetworkForChain("toChain"),
        message(props) {
          return `Network "${props.value}" is not supported for destination chain "${this.toChain}"`;
        },
      },
    },
    fromAsset: {
      type: String,
      required: true,
    },
    routeId: {
      type: String,
      required: true,
      index: true,
    },
    requestId: {
      type: String,
      default: null,
      index: true,
    },
    toAsset: {
      type: String,
      required: true,
    },
    sourceAmount: {
      type: String,
      required: true,
    },
    sourceAmountBaseUnits: {
      type: String,
      required: true,
    },
    sourcePriceUsd: {
      type: String,
      required: true,
    },
    destinationPriceUsd: {
      type: String,
      required: true,
    },
    exchangeRate: {
      type: String,
      required: true,
    },
    grossDestinationAmount: {
      type: String,
      required: true,
    },
    grossDestinationAmountBaseUnits: {
      type: String,
      required: true,
    },
    systemFeeBps: {
      type: Number,
      required: true,
      default: 0,
    },
    systemFeeAmount: {
      type: String,
      required: true,
    },
    systemFeeAmountBaseUnits: {
      type: String,
      required: true,
    },
    sourceNetworkFee: {
      type: String,
      required: true,
    },
    sourceNetworkFeeBaseUnits: {
      type: String,
      required: true,
    },
    sourceTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
      index: true,
    },
    sourceTxHash: {
      type: String,
      default: null,
      index: true,
    },
    sourceTransactionStatus: {
      type: String,
      enum: ["pending", "success", "failed", null],
      default: null,
    },
    sourceChainStatus: {
      type: String,
      default: null,
    },
    sourceSubmittedAt: {
      type: Date,
      default: null,
    },
    sourceConfirmedAt: {
      type: Date,
      default: null,
    },
    payoutNetworkFeeEstimate: {
      type: String,
      required: true,
    },
    payoutNetworkFeeEstimateBaseUnits: {
      type: String,
      required: true,
    },
    payoutNetworkFee: {
      type: String,
      default: null,
    },
    payoutNetworkFeeBaseUnits: {
      type: String,
      default: null,
    },
    payoutTransactionId: {
      type: String,
      default: null,
    },
    payoutTxHash: {
      type: String,
      default: null,
      index: true,
    },
    payoutTransactionStatus: {
      type: String,
      enum: ["pending", "success", "failed", null],
      default: null,
    },
    payoutChainStatus: {
      type: String,
      default: null,
    },
    payoutSubmittedAt: {
      type: Date,
      default: null,
    },
    payoutConfirmedAt: {
      type: Date,
      default: null,
    },
    estimatedReceiveAmount: {
      type: String,
      required: true,
    },
    estimatedReceiveAmountBaseUnits: {
      type: String,
      required: true,
    },
    finalReceiveAmount: {
      type: String,
      default: null,
    },
    finalReceiveAmountBaseUnits: {
      type: String,
      default: null,
    },
    sourceSystemWalletAddress: {
      type: String,
      required: true,
    },
    destinationSystemWalletAddress: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: SWAP_STATUSES,
      default: "previewed",
      index: true,
    },
    quoteExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    failureReason: {
      type: String,
      default: null,
    },
    failureCode: {
      type: String,
      default: null,
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

const Swap = mongoose.models.Swap || mongoose.model("Swap", swapSchema);

Swap.ensureSwapIndexes = () => ensureSwapIndexes(Swap);
Swap.STATUSES = SWAP_STATUSES;

module.exports = Swap;
