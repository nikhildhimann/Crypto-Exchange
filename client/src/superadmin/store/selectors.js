import { createSelector } from "@reduxjs/toolkit";

export const selectSuperadminAuthState = (state) => state.superadminAuth;
export const selectSuperadminAccessToken = (state) => state.superadminAuth.accessToken;
export const selectSuperadminRefreshToken = (state) => state.superadminAuth.refreshToken;
export const selectSuperadminProfile = (state) => state.superadminAuth.profile || null;
export const selectSuperadminRole = (state) =>
  state.superadminAuth.role || state.superadminAuth.profile?.role || "";
export const selectSuperadminRoles = (state) =>
  Array.isArray(state.superadminAuth.roles)
    ? state.superadminAuth.roles
    : state.superadminAuth.role
      ? [state.superadminAuth.role]
      : [];
export const selectSuperadminPermissions = (state) =>
  Array.isArray(state.superadminAuth.permissions) ? state.superadminAuth.permissions : [];
export const selectSuperadminStatus = (state) => state.superadminAuth.status || "idle";
export const selectSuperadminError = (state) => state.superadminAuth.error || "";
export const selectSuperadminSessionState = (state) =>
  state.superadminAuth.sessionState || "logged_out";

export const selectIsSuperadminAuthenticated = createSelector(
  [selectSuperadminSessionState, selectSuperadminAccessToken],
  (sessionState, accessToken) => sessionState === "active" && Boolean(accessToken),
);
