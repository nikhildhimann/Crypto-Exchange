const { ajModel } = require("../../common/classes/Model");
const sessionStatus = require("../../common/constants/sessionStatus");

const sessionSchema = {
  superadminId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "Superadmin",
    required: true,
  },
  tokenId: {
    type: String,
    required: true,
    unique: true,
  },
  refreshTokenHash: {
    type: String,
    required: true,
    select: false,
  },
  deviceId: {
    type: String,
    default: "",
  },
  deviceLabel: {
    type: String,
    default: "",
  },
  platform: {
    type: String,
    default: "",
  },
  appVersion: {
    type: String,
    default: "",
  },
  biometricCapable: {
    type: Boolean,
    default: false,
  },
  ipAddress: {
    type: String,
    default: "",
  },
  userAgent: {
    type: String,
    default: "",
  },
  lastUsedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: sessionStatus,
    default: "active",
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  revokedReason: {
    type: String,
    default: "",
  },
  metadata: {
    type: require("mongoose").Schema.Types.Mixed,
    default: {},
  },
};

module.exports = new ajModel("SuperadminSession", sessionSchema)
  .index({ superadminId: 1, status: 1 })
  .index({ status: 1, lastUsedAt: -1 })
  .index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  .getModel();
