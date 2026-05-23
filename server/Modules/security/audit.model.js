const { ajModel } = require("../../common/classes/Model");

const schema = {
  userId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  action: {
    type: String,
    required: true,
  },
  resource: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: "success",
  },
  ipAddress: {
    type: String,
    default: "",
  },
  metadata: {
    type: Object,
    default: {},
  },
};

module.exports = new ajModel("SecurityAudit", schema)
  .index({ userId: 1, createdAt: -1 })
  .index({ action: 1, resource: 1, status: 1, createdAt: -1 })
  .getModel();
