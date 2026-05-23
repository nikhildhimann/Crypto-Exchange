import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { store } from "../../store";
import {
  fetchCurrentSuperadminThunk,
  loginSuperadminThunk,
  markSuperadminLoggedOut,
  revokeSuperadminSessionThunk,
  refreshSuperadminSessionThunk,
} from "../store/authSlice";
import {
  selectIsSuperadminAuthenticated,
  selectSuperadminError,
  selectSuperadminPermissions,
  selectSuperadminProfile,
  selectSuperadminRefreshToken,
  selectSuperadminRole,
  selectSuperadminRoles,
  selectSuperadminStatus,
} from "../store/selectors";
import { configureSuperadminApiClientSession } from "../services/client";

export function useSuperadminSession() {
  const dispatch = useDispatch();
  const status = useSelector(selectSuperadminStatus);
  const error = useSelector(selectSuperadminError);
  const isAuthenticated = useSelector(selectIsSuperadminAuthenticated);
  const profile = useSelector(selectSuperadminProfile);
  const role = useSelector(selectSuperadminRole);
  const roles = useSelector(selectSuperadminRoles);
  const permissions = useSelector(selectSuperadminPermissions);
  const refreshToken = useSelector(selectSuperadminRefreshToken);

  const logout = useCallback(
    async ({ revokeAll = false, reason = "manual" } = {}) => {
      const currentState = store.getState().superadminAuth;

      try {
        if (currentState.accessToken) {
          await dispatch(
            revokeSuperadminSessionThunk({
              accessToken: currentState.accessToken,
              revokeAll,
            }),
          ).unwrap();
        }
      } catch (_error) {
        // Local cleanup still takes precedence if the remote session is already invalid.
      } finally {
        dispatch(markSuperadminLoggedOut({ reason }));
      }
    },
    [dispatch],
  );

  useEffect(() => {
    configureSuperadminApiClientSession({
      getAccessToken: () => store.getState().superadminAuth.accessToken,
      getRefreshToken: () => store.getState().superadminAuth.refreshToken,
      refreshSession: async () => dispatch(refreshSuperadminSessionThunk()).unwrap(),
      logout: async ({ reason = "unauthorized" } = {}) => logout({ reason }),
    });
  }, [dispatch, logout]);

  const login = useCallback(
    async (payload = {}) => dispatch(loginSuperadminThunk(payload)).unwrap(),
    [dispatch],
  );

  const refreshProfile = useCallback(
    async () => dispatch(fetchCurrentSuperadminThunk()).unwrap(),
    [dispatch],
  );

  return {
    status,
    error,
    isAuthenticated,
    profile,
    email: profile?.email || "",
    role,
    roles,
    permissions,
    hasRefreshToken: Boolean(refreshToken),
    login,
    logout,
    refreshProfile,
  };
}
