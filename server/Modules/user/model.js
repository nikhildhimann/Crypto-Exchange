const { ajModel, mongoose } = require("../../common/classes/Model");
const securityConfig = require("../../config/security");
const { defaultChain, getConfiguredChainCodes } = require("../../config/chains");

const userSchema = {
  primaryChain: {
    type: String,
    enum: getConfiguredChainCodes(),
    default: defaultChain,
  },
  status: {
    type: String,
    enum: ["pending_mnemonic_confirmation", "active", "locked", "archived"],
    default: "pending_mnemonic_confirmation",
  },
  role: {
    type: String,
    enum: securityConfig.roles,
    default: "user",
  },
  publicAddress: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    default: undefined,
  },
  publicKey: {
    type: String,
    trim: true,
    default: null,
  },
  seedCipherText: {
    type: String,
    default: null,
  },
  seedFingerprint: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    default: undefined,
  },
  mnemonicConfirmedAt: {
    type: Date,
    default: null,
  },
  confirmationSample: {
    type: [
      {
        position: Number,
        wordHash: String,
      },
    ],
    default: [],
  },
  qrCodeUri: {
    type: String,
    default: null,
  },
  signingPolicy: {
    type: String,
    enum: ["system_custody", "external_custody"],
    default: "system_custody",
  },
  mfaEnabled: {
    type: Boolean,
    default: false,
  },
  lastAccessAt: {
    type: Date,
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
};

module.exports = new ajModel("User", userSchema)
  .index({ primaryChain: 1, status: 1 })
  .index({ status: 1, role: 1, createdAt: -1 })
  .index({ lastAccessAt: -1 })
  .getModel();
