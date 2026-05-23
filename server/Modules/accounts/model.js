const { mongoose } = require("../../common/classes/Model");

const accountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: ["personal", "business", "trading", "custom"],
      default: undefined,
    },
    encryptedMnemonic: {
      algorithm: { type: String, required: true, select: false },
      cipherText: { type: String, required: true, select: false },
      iv: { type: String, required: true, select: false },
      authTag: { type: String, required: true, select: false },
      keyVersion: { type: Number, required: true, select: false },
    },
    mnemonicFingerprint: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.encryptedMnemonic;
        delete ret.mnemonicFingerprint;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.encryptedMnemonic;
        delete ret.mnemonicFingerprint;
        return ret;
      },
    },
  },
);

accountSchema.index({ userId: 1, status: 1, createdAt: 1 });
accountSchema.index({ status: 1, type: 1, createdAt: -1 });
accountSchema.index({ userId: 1, mnemonicFingerprint: 1 }, { unique: true });

module.exports = mongoose.models.Account || mongoose.model("Account", accountSchema);
