import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  getCurrentSuperadmin,
  loginSuperadmin,
  logoutSuperadminSession,
  refreshSuperadminSession,
} from "../services/auth";

const initialState = {
  accessToken: "",
  refreshToken: "",
  superadminId: "",
  email: "",
  profile: null,
  role: "",
  roles: [],
  permissions: [],
  sessionId: "",
  sessionStatus: "",
  accessTokenExpiresAt: "",
  refreshTokenExpiresAt: "",
  sessionExpiresAt: "",
  status: "idle",
  error: "",
  sessionState: "logged_out",
  logoutReason: "",
};

function buildRejectedAuthPayload(error, fallbackMessage) {
  if (error instanceof Error) {
    return {
      message: error.message || fallbackMessage,
      status: Number(error.status || 0),
      payload: error.payload || null,
    };
  }

  return {
    message: fallbackMessage,
    status: 0,
    payload: null,
  };
}

function applyNormalizedSession(state, sessionPayload = {}) {
  Object.assign(state, {
    ...state,
    accessToken: sessionPayload.accessToken || sessionPayload.token || "",
    refreshToken: sessionPayload.refreshToken || "",
    superadminId:
      sessionPayload.superadminId || sessionPayload.superadmin?._id || "",
    email: sessionPayload.email || sessionPayload.superadmin?.email || "",
    profile:
      sessionPayload.superadmin && typeof sessionPayload.superadmin === "object"
        ? sessionPayload.superadmin
        : null,
    role: sessionPayload.role || sessionPayload.superadmin?.role || "",
    roles: Array.isArray(sessionPayload.roles)
      ? sessionPayload.roles
      : Array.isArray(sessionPayload.superadmin?.roles)
        ? sessionPayload.superadmin.roles
        : [],
    permissions: Array.isArray(sessionPayload.permissions)
      ? sessionPayload.permissions
      : Array.isArray(sessionPayload.superadmin?.permissions)
        ? sessionPayload.superadmin.permissions
        : [],
    sessionId: sessionPayload.sessionId || sessionPayload.session?.sessionId || "",
    sessionStatus: sessionPayload.sessionStatus || sessionPayload.session?.status || "",
    accessTokenExpiresAt: sessionPayload.accessTokenExpiresAt || "",
    refreshTokenExpiresAt: sessionPayload.refreshTokenExpiresAt || "",
    sessionExpiresAt:
      sessionPayload.sessionExpiresAt ||
      sessionPayload.session?.expiresAt ||
      "",
  });
}

export const loginSuperadminThunk = createAsyncThunk(
  "superadminAuth/login",
  async (payload = {}, { rejectWithValue }) => {
    try {
      return await loginSuperadmin(payload);
    } catch (error) {
      return rejectWithValue(buildRejectedAuthPayload(error, "Failed to sign in as superadmin"));
    }
  },
);

export const refreshSuperadminSessionThunk = createAsyncThunk(
  "superadminAuth/refresh",
  async (payload = {}, { getState, rejectWithValue }) => {
    try {
      const refreshToken = payload.refreshToken || getState().superadminAuth.refreshToken;

      if (!refreshToken) {
        throw new Error("Superadmin refresh token missing");
      }

      return await refreshSuperadminSession({
        refreshToken,
        ...(payload || {}),
      });
    } catch (error) {
      return rejectWithValue(
        buildRejectedAuthPayload(error, "Failed to refresh superadmin session"),
      );
    }
  },
);

export const fetchCurrentSuperadminThunk = createAsyncThunk(
  "superadminAuth/me",
  async (_payload, { getState, rejectWithValue }) => {
    try {
      const accessToken = getState().superadminAuth.accessToken;

      if (!accessToken) {
        throw new Error("Superadmin access token missing");
      }

      return await getCurrentSuperadmin(accessToken);
    } catch (error) {
      return rejectWithValue(
        buildRejectedAuthPayload(error, "Failed to fetch superadmin profile"),
      );
    }
  },
);

export const revokeSuperadminSessionThunk = createAsyncThunk(
  "superadminAuth/logout",
  async (payload = {}, { getState, rejectWithValue }) => {
    try {
      const accessToken =
        payload.accessToken || getState().superadminAuth.accessToken;

      if (!accessToken) {
        return { revokedCount: 0, revokedScope: payload.revokeAll ? "all" : "current" };
      }

      return await logoutSuperadminSession(accessToken, {
        revokeAll: Boolean(payload.revokeAll),
      });
    } catch (error) {
      return rejectWithValue(
        buildRejectedAuthPayload(error, "Failed to revoke superadmin session"),
      );
    }
  },
);

const superadminAuthSlice = createSlice({
  name: "superadminAuth",
  initialState,
  reducers: {
    clearSuperadminSession(state) {
      Object.assign(state, {
        ...initialState,
        sessionState: "logged_out",
      });
    },
    markSuperadminLoggedOut(state, action) {
      Object.assign(state, {
        ...initialState,
        sessionState: "logged_out",
        logoutReason: action.payload?.reason || "",
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginSuperadminThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(loginSuperadminThunk.fulfilled, (state, action) => {
        applyNormalizedSession(state, action.payload);
        state.status = "idle";
        state.error = "";
        state.sessionState = "active";
        state.logoutReason = "";
      })
      .addCase(loginSuperadminThunk.rejected, (state, action) => {
        Object.assign(state, {
          ...initialState,
          status: "error",
          error: action.payload?.message || action.payload || "Failed to sign in as superadmin",
          sessionState: "logged_out",
        });
      })
      .addCase(refreshSuperadminSessionThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(refreshSuperadminSessionThunk.fulfilled, (state, action) => {
        applyNormalizedSession(state, action.payload);
        state.status = "idle";
        state.error = "";
        state.sessionState = "active";
        state.logoutReason = "";
      })
      .addCase(refreshSuperadminSessionThunk.rejected, (state, action) => {
        Object.assign(state, {
          ...initialState,
          status: "error",
          error:
            action.payload?.message || action.payload || "Failed to refresh superadmin session",
          sessionState: "logged_out",
          logoutReason: "refresh_failed",
        });
      })
      .addCase(fetchCurrentSuperadminThunk.pending, (state) => {
        state.error = "";
      })
      .addCase(fetchCurrentSuperadminThunk.fulfilled, (state, action) => {
        state.profile = action.payload;
        state.superadminId = action.payload?._id || state.superadminId;
        state.email = action.payload?.email || state.email;
        state.role = action.payload?.role || state.role;
        state.roles = action.payload?.role ? [action.payload.role] : state.roles;
      })
      .addCase(fetchCurrentSuperadminThunk.rejected, (state, action) => {
        state.error =
          action.payload?.message || action.payload || "Failed to fetch superadmin profile";
      })
      .addCase(revokeSuperadminSessionThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(revokeSuperadminSessionThunk.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(revokeSuperadminSessionThunk.rejected, (state, action) => {
        state.status = "error";
        state.error =
          action.payload?.message || action.payload || "Failed to revoke superadmin session";
      });
  },
});

export const {
  clearSuperadminSession,
  markSuperadminLoggedOut,
} = superadminAuthSlice.actions;

export default superadminAuthSlice.reducer;
