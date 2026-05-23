import { apiRequest } from "./client";
import {
  normalizeMarkAllReadResult,
  normalizeClearAllResult,
  normalizeNotification,
  normalizeNotificationList,
  normalizeUnreadCount,
} from "./adapters/notification";

export async function listNotifications(token, query = {}) {
  const response = await apiRequest("/notification", {
    token,
    query,
  });

  return normalizeNotificationList(response.data, response.meta);
}

export async function getUnreadNotificationCount(token) {
  const response = await apiRequest("/notification/unread-count", {
    token,
  });

  return normalizeUnreadCount(response.data);
}

export async function markNotificationRead(token, notificationId) {
  const response = await apiRequest(`/notification/${notificationId}/read`, {
    method: "PATCH",
    token,
  });

  return normalizeNotification(response.data);
}

export async function markAllNotificationsRead(token) {
  const response = await apiRequest("/notification/read-all", {
    method: "PATCH",
    token,
  });

  return normalizeMarkAllReadResult(response.data);
}

export async function clearAllNotifications(token) {
  const response = await apiRequest("/notification/clear-all", {
    method: "DELETE",
    token,
  });

  return normalizeClearAllResult(response.data);
}
