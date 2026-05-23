import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import {
  createSession,
  logoutSession,
  refreshSession,
} from "../api/auth";
import { normalizeAuthSession } from "../api/adapters/auth";

const DEVICE_ID_STORAGE_KEY = "aura_device_id";

function getOrCreateDeviceId() {
  if (typeof window === "undefined") {
    return "server-device";
  }

  const existingDeviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existingDeviceId) {
    return existingDeviceId;
  }

  const nextDeviceId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now()}`;

  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
}

function buildDeviceMetadata(overrides = {}) {
  return {
    deviceId: getOrCreateDeviceId(),
    deviceLabel: "Crypto Wallet Web",
    platform:
      overrides.platform ||
      (typeof navigator !== "undefined"
        ? navigator.userAgentData?.platform || navigator.platform || "web"
        : "web"),
    appVersion: import.meta.env.VITE_APP_VERSION || "web",
    biometricCapable: false,
    ...overrides,
  };
}

const initialState = {
  token: "",
  accessToken: "",
  refreshToken: "",
  userId: "",
  user: null,
  role: "",
  roles: [],
  permissions: [],
  sessionId: "",
  sessionStatus: "",
  accessTokenExpiresAt: "",
  refreshTokenExpiresAt: "",
  sessionExpiresAt: "",
  deviceId: "",
  status: "idle",
  error: "",
  bootstrapped: false,
  sessionState: "unknown",
  logoutReason: "",
};

function applyNormalizedSession(state, sessionPayload = {}) {
  Object.assign(state, {
    ...state,
    token: sessionPayload.token || sessionPayload.accessToken || "",
    accessToken: sessionPayload.accessToken || sessionPayload.token || "",
    refreshToken: sessionPayload.refreshToken || "",
    userId: sessionPayload.userId || sessionPayload.user?._id || "",
    user:
      sessionPayload.user && typeof sessionPayload.user === "object"
        ? sessionPayload.user
        : null,
    role: sessionPayload.role || sessionPayload.user?.role || "",
    roles: Array.isArray(sessionPayload.roles)
      ? sessionPayload.roles
      : Array.isArray(sessionPayload.user?.roles)
        ? sessionPayload.user.roles
        : [],
    permissions: Array.isArray(sessionPayload.permissions)
      ? sessionPayload.permissions
      : Array.isArray(sessionPayload.user?.permissions)
        ? sessionPayload.user.permissions
        : [],
    sessionId: sessionPayload.sessionId || sessionPayload.session?.sessionId || "",
    sessionStatus: sessionPayload.sessionStatus || sessionPayload.session?.status || "",
    accessTokenExpiresAt: sessionPayload.accessTokenExpiresAt || "",
    refreshTokenExpiresAt:
      sessionPayload.refreshTokenExpiresAt ||
      sessionPayload.session?.expiresAt ||
      "",
    sessionExpiresAt:
      sessionPayload.sessionExpiresAt ||
      sessionPayload.session?.expiresAt ||
      "",
    deviceId: sessionPayload.deviceId || sessionPayload.session?.deviceId || "",
  });
}

export const createSessionThunk = createAsyncThunk(
  "auth/createSession",
  async (payload = {}, { rejectWithValue }) => {
    try {
      const session = await createSession({
        ...buildDeviceMetadata(payload.deviceMetadata),
      });

      return normalizeAuthSession(session);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Failed to create session");
    }
  },
);

export const refreshSessionThunk = createAsyncThunk(
  "auth/refreshSession",
  async (payload = {}, { getState, rejectWithValue }) => {
    try {
      const refreshTokenValue = payload.refreshToken || getState().auth.refreshToken;

      if (!refreshTokenValue) {
        throw new Error("Refresh token missing");
      }

      const session = await refreshSession({
        refreshToken: refreshTokenValue,
        ...buildDeviceMetadata(payload.deviceMetadata),
      });

      return normalizeAuthSession(session);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Failed to refresh session");
    }
  },
);

export const revokeSessionThunk = createAsyncThunk(
  "auth/revokeSession",
  async (payload = {}, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const accessToken = payload.accessToken || state.auth.accessToken || state.auth.token;

      if (!accessToken) {
        return { revokedCount: 0, revokedScope: payload.revokeAll ? "all" : "current" };
      }

      return await logoutSession(accessToken, {
        revokeAll: Boolean(payload.revokeAll),
      });
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Failed to logout");
    }
  },
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearSession(state) {
      state.token = "";
      state.accessToken = "";
      state.refreshToken = "";
      state.userId = "";
      state.user = null;
      state.role = "";
      state.roles = [];
      state.permissions = [];
      state.sessionId = "";
      state.sessionStatus = "";
      state.accessTokenExpiresAt = "";
      state.refreshTokenExpiresAt = "";
      state.sessionExpiresAt = "";
      state.deviceId = "";
      state.status = "idle";
      state.error = "";
      state.bootstrapped = true;
      state.sessionState = "unknown";
      state.logoutReason = "";
    },
    markLoggedOut(state, action) {
      Object.assign(state, {
        ...initialState,
        bootstrapped: true,
        sessionState: "logged_out",
        logoutReason: action.payload?.reason || "",
      });
    },
    setSession(state, action) {
      applyNormalizedSession(state, normalizeAuthSession(action.payload));
      state.status = "idle";
      state.error = "";
      state.bootstrapped = true;
      state.sessionState = "active";
      state.logoutReason = "";
    },
    markBootstrapped(state) {
      state.bootstrapped = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createSessionThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(createSessionThunk.fulfilled, (state, action) => {
        applyNormalizedSession(state, action.payload);
        state.status = "idle";
        state.error = "";
        state.bootstrapped = true;
        state.sessionState = "active";
        state.logoutReason = "";
      })
      .addCase(createSessionThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload || "Failed to create session";
        state.bootstrapped = true;
      })
      .addCase(refreshSessionThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(refreshSessionThunk.fulfilled, (state, action) => {
        applyNormalizedSession(state, action.payload);
        state.status = "idle";
        state.error = "";
        state.bootstrapped = true;
        state.sessionState = "active";
        state.logoutReason = "";
      })
      .addCase(refreshSessionThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload || "Failed to refresh session";
        state.bootstrapped = true;
      })
      .addCase(revokeSessionThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(revokeSessionThunk.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(revokeSessionThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload || "Failed to logout";
      });
  },
});

export const { clearSession, markBootstrapped, markLoggedOut, setSession } = authSlice.actions;

export default authSlice.reducer;
