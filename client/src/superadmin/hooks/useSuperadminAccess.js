import { canAccessRoute, normalizeAccessContext } from "../config/access";
import { useSuperadminSession } from "./useSuperadminSession";

export function useSuperadminAccess() {
  const {
    isAuthenticated,
    profile,
    role,
    roles,
    permissions,
  } = useSuperadminSession();

  const accessContext = normalizeAccessContext({
    userId: profile?._id || "",
    role,
    roles,
    permissions,
  });

  return {
    isAuthenticated,
    profile,
    accessContext,
    hasAccess: (access) => canAccessRoute(accessContext, access),
  };
}
