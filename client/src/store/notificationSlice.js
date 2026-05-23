import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { normalizeNotification } from "../api/adapters/notification";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  clearAllNotifications,
} from "../api/notification";

const initialState = {
  items: [],
  unreadCount: 0,
  meta: {
    totalRecords: 0,
    currentPage: 0,
    totalPages: 0,
    limit: 0,
  },
  status: "idle",
  error: "",
  hasLoadedOnce: false,
  lastFetchedAt: 0,
};

function serializeRequestError(error, fallbackMessage) {
  return {
    message:
      error instanceof Error && error.message
        ? error.message
        : typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage,
  };
}

export const fetchNotificationsThunk = createAsyncThunk(
  "notification/fetchNotifications",
  async (query = {}, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await listNotifications(token, query);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to load notifications"));
    }
  },
);

export const fetchUnreadNotificationCountThunk = createAsyncThunk(
  "notification/fetchUnreadCount",
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await getUnreadNotificationCount(token);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to load unread notification count"));
    }
  },
);

export const markNotificationReadThunk = createAsyncThunk(
  "notification/markRead",
  async (notificationId, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await markNotificationRead(token, notificationId);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to mark notification as read"));
    }
  },
);

export const markAllNotificationsReadThunk = createAsyncThunk(
  "notification/markAllRead",
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await markAllNotificationsRead(token);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to mark all notifications as read"));
    }
  },
);

export const clearAllNotificationsThunk = createAsyncThunk(
  "notification/clearAll",
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await clearAllNotifications(token);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to clear notifications"));
    }
  },
);

const notificationSlice = createSlice({
  name: "notification",
  initialState,
  reducers: {
    addRealtimeNotification(state, action) {
      const nextNotification = normalizeNotification(action.payload || {});

      if (!nextNotification.notificationId) {
        return;
      }

      const existingIndex = state.items.findIndex(
        (item) =>
          item.notificationId === nextNotification.notificationId ||
          item.id === nextNotification.notificationId,
      );
      const existingNotification = existingIndex >= 0 ? state.items[existingIndex] : null;
      const mergedNotification = existingNotification
        ? {
          ...existingNotification,
          ...nextNotification,
          metadata: nextNotification.metadata || existingNotification.metadata || {},
        }
        : nextNotification;

      state.items = [
        mergedNotification,
        ...state.items.filter(
          (item) =>
            item.notificationId !== mergedNotification.notificationId &&
            item.id !== mergedNotification.notificationId,
        ),
      ];

      if (!existingNotification) {
        state.meta.totalRecords += 1;

        if (!mergedNotification.isRead) {
          state.unreadCount += 1;
        }
      } else if (existingNotification.isRead && !mergedNotification.isRead) {
        state.unreadCount += 1;
      }
    },
    clearNotificationState(state) {
      state.items = [];
      state.unreadCount = 0;
      state.meta = {
        totalRecords: 0,
        currentPage: 0,
        totalPages: 0,
        limit: 0,
      };
      state.status = "idle";
      state.error = "";
      state.hasLoadedOnce = false;
      state.lastFetchedAt = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotificationsThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(fetchNotificationsThunk.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload?.items || [];
        state.unreadCount =
          Number(action.payload?.meta?.unreadCount ?? state.unreadCount) ||
          (action.payload?.items || []).filter((item) => !item?.isRead).length;
        state.meta = action.payload?.meta
          ? {
            totalRecords: Number(action.payload.meta.totalRecords || 0) || 0,
            currentPage: Number(action.payload.meta.currentPage || 0) || 0,
            totalPages: Number(action.payload.meta.totalPages || 0) || 0,
            limit: Number(action.payload.meta.limit || 0) || 0,
          }
          : initialState.meta;
        state.hasLoadedOnce = true;
        state.lastFetchedAt = Date.now();
      })
      .addCase(fetchNotificationsThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || action.payload || "Failed to load notifications";
      })
      .addCase(fetchUnreadNotificationCountThunk.pending, (state) => {
        state.error = "";
      })
      .addCase(fetchUnreadNotificationCountThunk.fulfilled, (state, action) => {
        state.unreadCount = action.payload?.unreadCount || 0;
      })
      .addCase(fetchUnreadNotificationCountThunk.rejected, (state, action) => {
        state.error =
          action.payload?.message || action.payload || "Failed to load unread notification count";
      })
      .addCase(markNotificationReadThunk.pending, (state) => {
        state.error = "";
      })
      .addCase(markNotificationReadThunk.fulfilled, (state, action) => {
        const nextNotification = action.payload;
        const nextNotificationId = nextNotification?.notificationId || nextNotification?.id || "";
        const existingNotification =
          state.items.find(
            (item) => item.notificationId === nextNotificationId || item.id === nextNotificationId,
          ) || null;

        state.items = state.items.map((item) =>
          item.notificationId === nextNotificationId || item.id === nextNotificationId
            ? nextNotification
            : item,
        );

        if (existingNotification && !existingNotification.isRead && nextNotification?.isRead) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markNotificationReadThunk.rejected, (state, action) => {
        state.error = action.payload?.message || action.payload || "Failed to mark notification as read";
      })
      .addCase(markAllNotificationsReadThunk.pending, (state) => {
        state.error = "";
      })
      .addCase(markAllNotificationsReadThunk.fulfilled, (state) => {
        state.items = state.items.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt || new Date().toISOString(),
        }));
        state.unreadCount = 0;
      })
      .addCase(markAllNotificationsReadThunk.rejected, (state, action) => {
        state.error = action.payload?.message || action.payload || "Failed to mark all notifications as read";
      })
      .addCase(clearAllNotificationsThunk.pending, (state) => {
        state.error = "";
      })
      .addCase(clearAllNotificationsThunk.fulfilled, (state) => {
        state.items = [];
        state.unreadCount = 0;
        state.meta.totalRecords = 0;
      })
      .addCase(clearAllNotificationsThunk.rejected, (state, action) => {
        state.error = action.payload?.message || action.payload || "Failed to clear notifications";
      });
  },
});

export const { addRealtimeNotification, clearNotificationState } = notificationSlice.actions;

export default notificationSlice.reducer;
