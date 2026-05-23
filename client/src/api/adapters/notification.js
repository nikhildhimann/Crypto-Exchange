function normalizeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();

  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

export function normalizeNotification(notification = {}) {
  const metadata = normalizeObject(notification.metadata);

  return {
    ...notification,
    id: normalizeString(notification.id || notification._id || notification.notificationId),
    notificationId: normalizeString(notification.notificationId || notification._id || notification.id),
    userId: normalizeString(notification.userId),
    type: normalizeString(notification.type),
    title: normalizeString(notification.title),
    message: normalizeString(notification.message),
    isRead: Boolean(notification.isRead),
    readAt: normalizeTimestamp(notification.readAt),
    createdAt: normalizeTimestamp(notification.createdAt),
    updatedAt: normalizeTimestamp(notification.updatedAt),
    metadata,
  };
}

export function normalizeNotificationList(payload = [], meta = {}) {
  return {
    items: Array.isArray(payload) ? payload.map((item) => normalizeNotification(item)) : [],
    meta: {
      unreadCount: Number(meta?.unreadCount || 0) || 0,
      totalRecords: Number(meta?.totalRecords || 0) || 0,
      currentPage: Number(meta?.currentPage || 0) || 0,
      totalPages: Number(meta?.totalPages || 0) || 0,
      limit: Number(meta?.limit || 0) || 0,
    },
  };
}

export function normalizeUnreadCount(payload = {}) {
  return {
    unreadCount: Number(payload?.unreadCount || 0) || 0,
  };
}

export function normalizeMarkAllReadResult(payload = {}) {
  return {
    matchedCount: Number(payload?.matchedCount || 0) || 0,
    modifiedCount: Number(payload?.modifiedCount || 0) || 0,
  };
}

export function normalizeClearAllResult(payload = {}) {
  return {
    matchedCount: Number(payload?.matchedCount || 0) || 0,
    modifiedCount: Number(payload?.modifiedCount || 0) || 0,
  };
}
