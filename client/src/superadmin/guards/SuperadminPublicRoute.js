import { Navigate } from "react-router";
import { useSuperadminSession } from "../hooks/useSuperadminSession";

export function SuperadminPublicRoute({ children }) {
  const { isAuthenticated } = useSuperadminSession();

  if (isAuthenticated) {
    return <Navigate to="/superadmin" replace />;
  }

  return children;
}
