const { ajModel, mongoose } = require("../../common/classes/Model");
const securityConfig = require("../../config/security");

const superadminSchema = {
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: securityConfig.superadminRoles,
    default: "superadmin",
  },
  status: {
    type: String,
    enum: ["active", "inactive", "locked"],
    default: "active",
  },
  mfaEnabled: {
    type: Boolean,
    default: false,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
  lastPasswordChangedAt: {
    type: Date,
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
};

module.exports = new ajModel("Superadmin", superadminSchema)
  .index({ role: 1, status: 1 })
  .getModel();
