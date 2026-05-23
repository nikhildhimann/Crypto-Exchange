const Notification = require("../../Modules/notification/model");
const websocketService = require("./websocket.service");
const { AppError } = require("../../helpers/errors");
const paginate = require("../../helpers/pagination");
const BigNumber = require("bignumber.js");
const {
  RECEIVED_NOTIFICATION_MAX_EVENT_AGE_MS,
  RECEIVED_NOTIFICATION_MINIMUM_AMOUNT_BY_ASSET,
  DEFAULT_RECEIVED_NOTIFICATION_MINIMUM_AMOUNT,
} = require("../../config/notificationPolicy");

function normalizeOptionalObjectId(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return String(value);
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return String(value).trim();
}

function normalizeOptionalTimestamp(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function normalizeAssetSymbol(value) {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toUpperCase() : "";
}

function normalizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return {
    ...(normalizeOptionalObjectId(metadata.transactionId)
      ? { transactionId: normalizeOptionalObjectId(metadata.transactionId) }
      : {}),
    ...(normalizeOptionalObjectId(metadata.relatedTransactionId)
      ? { relatedTransactionId: normalizeOptionalObjectId(metadata.relatedTransactionId) }
      : {}),
    ...(normalizeOptionalObjectId(metadata.walletId)
      ? { walletId: normalizeOptionalObjectId(metadata.walletId) }
      : {}),
    ...(normalizeOptionalObjectId(metadata.senderUserId)
      ? { senderUserId: normalizeOptionalObjectId(metadata.senderUserId) }
      : {}),
    ...(normalizeOptionalObjectId(metadata.receiverUserId)
      ? { receiverUserId: normalizeOptionalObjectId(metadata.receiverUserId) }
      : {}),
    ...(normalizeOptionalString(metadata.chain)
      ? { chain: normalizeOptionalString(metadata.chain).toLowerCase() }
      : {}),
    ...(normalizeOptionalString(metadata.network)
      ? { network: normalizeOptionalString(metadata.network).toLowerCase() }
      : {}),
    ...(normalizeOptionalString(metadata.asset)
      ? { asset: normalizeOptionalString(metadata.asset) }
      : {}),
    ...(normalizeOptionalString(metadata.amount)
      ? { amount: normalizeOptionalString(metadata.amount) }
      : {}),
    ...(normalizeOptionalString(metadata.direction)
      ? { direction: normalizeOptionalString(metadata.direction).toLowerCase() }
      : {}),
    ...(normalizeOptionalString(metadata.fromAddress)
      ? { fromAddress: normalizeOptionalString(metadata.fromAddress) }
      : {}),
    ...(normalizeOptionalString(metadata.toAddress)
      ? { toAddress: normalizeOptionalString(metadata.toAddress) }
      : {}),
    ...(normalizeOptionalString(metadata.txHash)
      ? { txHash: normalizeOptionalString(metadata.txHash) }
      : {}),
  };
}

function normalizeNotificationPayload(payload = {}) {
  const userId = normalizeOptionalObjectId(payload.userId);
  const type = normalizeOptionalString(payload.type);
  const title = normalizeOptionalString(payload.title);
  const message = normalizeOptionalString(payload.message);

  if (!userId) {
    throw AppError.validation("userId is required");
  }

  if (!type) {
    throw AppError.validation("type is required");
  }

  if (!title) {
    throw AppError.validation("title is required");
  }

  if (!message) {
    throw AppError.validation("message is required");
  }

  return {
    userId,
    type,
    title,
    message,
    isRead: Boolean(payload.isRead),
    readAt: payload.isRead ? payload.readAt || new Date() : payload.readAt || null,
    metadata: normalizeMetadata(payload.metadata),
  };
}

function buildStoredNotification(notification) {
  const metadata =
    notification?.metadata && typeof notification.metadata === "object" && !Array.isArray(notification.metadata)
      ? notification.metadata
      : {};

  return {
    _id: String(notification?._id || ""),
    id: String(notification?._id || ""),
    notificationId: String(notification?._id || ""),
    userId: String(notification?.userId || ""),
    type: normalizeOptionalString(notification?.type) || "",
    title: normalizeOptionalString(notification?.title) || "",
    message: normalizeOptionalString(notification?.message) || "",
    isRead: Boolean(notification?.isRead),
    readAt: notification?.readAt || null,
    createdAt: notification?.createdAt || null,
    updatedAt: notification?.updatedAt || null,
    metadata,
  };
}

function buildRealtimePayload(notification) {
  const normalizedNotification = buildStoredNotification(notification);

  return {
    notificationId: normalizedNotification.notificationId,
    type: normalizedNotification.type,
    transactionId: normalizedNotification.metadata?.transactionId || null,
    createdAt: normalizedNotification.createdAt,
    notification: normalizedNotification,
  };
}

function buildNotificationDedupeQuery(normalizedPayload = {}) {
  const userId = normalizeOptionalObjectId(normalizedPayload.userId);
  const type = normalizeOptionalString(normalizedPayload.type);
  const metadata =
    normalizedPayload.metadata && typeof normalizedPayload.metadata === "object"
      ? normalizedPayload.metadata
      : {};
  const walletId = normalizeOptionalObjectId(metadata.walletId);
  const transactionId = normalizeOptionalObjectId(metadata.transactionId);
  const txHash = normalizeOptionalString(metadata.txHash);
  const direction = normalizeOptionalString(metadata.direction);

  if (!userId || !type) {
    return null;
  }

  const dedupeClauses = [];

  if (transactionId) {
    dedupeClauses.push({
      "metadata.transactionId": transactionId,
    });
  }

  if (txHash && walletId && direction) {
    dedupeClauses.push({
      "metadata.txHash": txHash,
      "metadata.walletId": walletId,
      "metadata.direction": direction,
    });
  }

  if (txHash && walletId) {
    dedupeClauses.push({
      "metadata.txHash": txHash,
      "metadata.walletId": walletId,
    });
  }

  if (txHash) {
    dedupeClauses.push({
      "metadata.txHash": txHash,
    });
  }

  if (!dedupeClauses.length) {
    return null;
  }

  return {
    userId,
    type,
    $or: dedupeClauses,
  };
}

function isBelowAssetNotificationThreshold(asset, amount) {
  const normalizedAsset = normalizeAssetSymbol(asset);
  const normalizedAmount = normalizeOptionalString(amount);

  if (!normalizedAsset || !normalizedAmount) {
    return false;
  }

  try {
    const amountValue = new BigNumber(normalizedAmount);
    if (!amountValue.isFinite() || amountValue.isNaN()) {
      return false;
    }

    const threshold = new BigNumber(
      RECEIVED_NOTIFICATION_MINIMUM_AMOUNT_BY_ASSET[normalizedAsset] ||
      DEFAULT_RECEIVED_NOTIFICATION_MINIMUM_AMOUNT,
    );

    if (!threshold.isFinite() || threshold.isNaN() || threshold.lte(0)) {
      return false;
    }

    return amountValue.lt(threshold);
  } catch (_error) {
    return false;
  }
}

function shouldSuppressReceivedNotification(normalizedPayload = {}, options = {}) {
  if (String(normalizedPayload.type || "").toUpperCase() !== "PLATFORM_TRANSFER_RECEIVED") {
    return false;
  }

  const source = normalizeOptionalString(options.source)?.toLowerCase() || "";
  if (source !== "history_sync" && source !== "deposit_watcher") {
    return false;
  }

  if (options.isInitialSync) {
    return true;
  }

  const eventTimestamp = normalizeOptionalTimestamp(options.eventTimestamp);
  if (
    eventTimestamp &&
    Date.now() - eventTimestamp.getTime() > RECEIVED_NOTIFICATION_MAX_EVENT_AGE_MS
  ) {
    return true;
  }

  const asset = options.asset || normalizedPayload.metadata?.asset;
  const amount = options.amount || normalizedPayload.metadata?.amount;

  return isBelowAssetNotificationThreshold(asset, amount);
}

async function createNotification(payload = {}, options = {}) {
  const normalizedPayload = normalizeNotificationPayload(payload);

  if (shouldSuppressReceivedNotification(normalizedPayload, options)) {
    return null;
  }

  return Notification.create(normalizedPayload);
}

async function createAndEmitNotification(payload = {}, options = {}) {
  const normalizedPayload = normalizeNotificationPayload(payload);
  const dedupeQuery = buildNotificationDedupeQuery(normalizedPayload);

  if (dedupeQuery) {
    const existing = await Notification.findOne({
      ...dedupeQuery,
      isDeleted: { $ne: true },
    }); if (existing) {
      return existing;
    }
  }

  if (shouldSuppressReceivedNotification(normalizedPayload, options)) {
    return null;
  }

  const notification = await Notification.create(normalizedPayload);
  const realtimePayload = buildRealtimePayload(notification);
  const targetUserId = String(notification.userId);

  websocketService.emit("notification:new", realtimePayload);
  websocketService.emit(`notification:new:${targetUserId}`, realtimePayload);

  return notification;
}

async function listNotifications(userId, query = {}) {
  const normalizedUserId = normalizeOptionalObjectId(userId);

  if (!normalizedUserId) {
    throw AppError.validation("userId is required");
  }

  const filters = {
    userId: normalizedUserId,
    isDeleted: { $ne: true },
  };

  if (query.isRead !== undefined) {
    filters.isRead = String(query.isRead) === "true";
  }

  return paginate(Notification, filters, {
    page: query.page,
    limit: query.limit,
    sort: { createdAt: -1 },
  });
}

async function getUnreadCount(userId) {
  const normalizedUserId = normalizeOptionalObjectId(userId);

  if (!normalizedUserId) {
    throw AppError.validation("userId is required");
  }

  return Notification.countDocuments({
    userId: normalizedUserId,
    isRead: false,
    isDeleted: { $ne: true },
  });
}

async function markAsRead(userId, notificationId) {
  const normalizedUserId = normalizeOptionalObjectId(userId);
  const normalizedNotificationId = normalizeOptionalObjectId(notificationId);

  if (!normalizedUserId) {
    throw AppError.validation("userId is required");
  }

  if (!normalizedNotificationId) {
    throw AppError.validation("notificationId is required");
  }

  const notification = await Notification.findOneAndUpdate(
    {
      _id: normalizedNotificationId,
      userId: normalizedUserId,
      isDeleted: { $ne: true },
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
    {
      new: true,
    },
  );

  if (!notification) {
    throw AppError.notFound("Notification not found");
  }

  return notification;
}

async function markAllAsRead(userId) {
  const normalizedUserId = normalizeOptionalObjectId(userId);

  if (!normalizedUserId) {
    throw AppError.validation("userId is required");
  }

  const result = await Notification.updateMany(
    {
      userId: normalizedUserId,
      isRead: false,
      isDeleted: { $ne: true },
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
  );

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
  };
}


async function clearAll(userId) {
  const normalizedUserId = normalizeOptionalObjectId(userId);

  if (!normalizedUserId) {
    throw AppError.validation("userId is required");
  }

  const result = await Notification.updateMany(
    {
      userId: normalizedUserId,
      isDeleted: { $ne: true },
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    },
  );

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
  };
}
module.exports = {
  createNotification,
  createAndEmitNotification,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  clearAll
};
