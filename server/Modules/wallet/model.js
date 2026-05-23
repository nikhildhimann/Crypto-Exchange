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

const walletSchema = new mongoose.Schema(
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
    chain: {
      type: String,
      enum: getConfiguredChainCodes(),
      required: true,
      default: defaultChain,
      index: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    publicKey: {
      type: String,
      required: true,
    },
    network: {
      type: String,
      enum: getConfiguredNetworkCodes(),
      required: true,
      index: true,
      validate: {
        validator: validateChainNetwork,
        message(props) {
          const chain = this.chain || defaultChain;
          return `Network "${props.value}" is not supported for chain "${chain}"`;
        },
      },
    },
    asset: {
      type: String,
      default() {
        return getChainConfig(this.chain || defaultChain)?.nativeAssetSymbol || "";
      },
    },
    label: {
      type: String,
      trim: true,
    },
    sourceType: {
      type: String,
      enum: ["created", "imported"],
      required: true,
    },
    isImported: {
      type: Boolean,
      required: true,
      default: false,
    },
    encryptedRecoveryPhrase: {
      algorithm: { type: String, required: true },
      cipherText: { type: String, required: true, select: false },
      iv: { type: String, required: true, select: false },
      authTag: { type: String, required: true, select: false },
      keyVersion: { type: Number, required: true },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    versionKey: false,
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.encryptedRecoveryPhrase;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.encryptedRecoveryPhrase;
        return ret;
      },
    },
  },
);

walletSchema.index({ address: 1, network: 1, chain: 1 }, { unique: true });
walletSchema.index({ chain: 1, network: 1, createdAt: -1 });
walletSchema.index({ userId: 1, chain: 1, network: 1, createdAt: -1 });
walletSchema.index({ accountId: 1, chain: 1, network: 1, createdAt: -1 }, { sparse: true });
walletSchema.index({ userId: 1, accountId: 1, "metadata.walletState.archived": 1 });
walletSchema.index({ userId: 1, accountId: 1, chain: 1, "metadata.walletState.isDefaultForChain": 1 });
walletSchema.index({ userId: 1, accountId: 1, "metadata.walletState.isPrimary": 1 });

module.exports = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
