import { Navigate, useLocation } from "react-router";
import {
  getSuperadminRouteAccess,
  SUPERADMIN_LOGIN_PATH,
  SUPERADMIN_UNAUTHORIZED_PATH,
} from "../config/routes";
import { useSuperadminAccess } from "../hooks/useSuperadminAccess";

export function SuperadminRouteGuard({
  routeId = "",
  access = null,
  children,
}) {
  const location = useLocation();
  const { isAuthenticated, hasAccess } = useSuperadminAccess();

  if (!isAuthenticated) {
    return <Navigate to={SUPERADMIN_LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }

  const resolvedAccess = access || getSuperadminRouteAccess(routeId);

  if (!hasAccess(resolvedAccess)) {
    return (
      <Navigate
        to={SUPERADMIN_UNAUTHORIZED_PATH}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return children;
}
