const { ajModel } = require("../../common/classes/Model");
const { Schema } = require("mongoose");

const NOTIFICATION_TYPES = [
  "INTERNAL_TRANSFER_RECEIVED",
  "INTERNAL_TRANSFER_SENT",
  "PLATFORM_TRANSFER_RECEIVED",
  "PLATFORM_TRANSFER_SENT",
  "SYSTEM",
];

const schema = {
  userId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: NOTIFICATION_TYPES,
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
    default: null,
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedAt: {
    type: Date,
    default: null,
  },

  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
};

module.exports = new ajModel("Notification", schema)
  .index({ userId: 1, createdAt: -1 })
  .index({ userId: 1, isRead: 1, createdAt: -1 })
  .index({ userId: 1, type: 1, "metadata.transactionId": 1 })
  .index({ userId: 1, type: 1, "metadata.txHash": 1 })
  .index({ userId: 1, type: 1, "metadata.walletId": 1, "metadata.direction": 1, "metadata.txHash": 1 })
  .index({ userId: 1, isDeleted: 1, createdAt: -1 })
  .index({ "metadata.transactionId": 1 })
  .index({ "metadata.txHash": 1 })
  .getModel();
