const { mongoose } = require("../../common/classes/Model");
const {
  defaultChain,
  getConfiguredNetworkCodes,
} = require("../../config/chains");

function validateChainNetwork(network) {
  return getConfiguredNetworkCodes(this.chain || defaultChain).includes(
    String(network || "").toLowerCase(),
  );
}

const walletCreationSessionSchema = new mongoose.Schema(
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
      required: true,
      default: defaultChain,
      index: true,
    },
    network: {
      type: String,
      enum: getConfiguredNetworkCodes(),
      required: true,
      validate: {
        validator: validateChainNetwork,
        message(props) {
          const chain = this.chain || defaultChain;
          return `Network "${props.value}" is not supported for chain "${chain}"`;
        },
      },
    },
    encryptedRecoveryPhrase: {
      algorithm: { type: String, required: true },
      cipherText: { type: String, required: true, select: false },
      iv: { type: String, required: true, select: false },
      authTag: { type: String, required: true, select: false },
      keyVersion: { type: Number, required: true },
    },
    label: {
      type: String,
      trim: true,
    },
    provisioningTargets: {
      type: [
        {
          chain: { type: String, required: true },
          network: { type: String, required: true },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "expired"],
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
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
  },
);

walletCreationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.WalletCreationSession ||
  mongoose.model("WalletCreationSession", walletCreationSessionSchema);
