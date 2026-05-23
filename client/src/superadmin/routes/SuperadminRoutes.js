import { Navigate, useRoutes } from "react-router";
import { SuperadminRouteGuard } from "../guards/SuperadminRouteGuard";
import { SuperadminLayout } from "../layout/SuperadminLayout";
import { SuperadminAccountsPage } from "../pages/SuperadminAccountsPage";
import { SuperadminAuditPage } from "../pages/SuperadminAuditPage";
import { SuperadminChainsPage } from "../pages/SuperadminChainsPage";
import { SuperadminDepositsPage } from "../pages/SuperadminDepositsPage";
import { SuperadminJobsPage } from "../pages/SuperadminJobsPage";
import { SuperadminOverviewPage } from "../pages/SuperadminOverviewPage";
import { SuperadminPlaceholderPage } from "../pages/SuperadminPlaceholderPage";
import { SuperadminRuntimePage } from "../pages/SuperadminRuntimePage";
import { SuperadminSessionsPage } from "../pages/SuperadminSessionsPage";
import { SuperadminTreasuryPage } from "../pages/SuperadminTreasuryPage";
import { SuperadminTransactionsPage } from "../pages/SuperadminTransactionsPage";
import { SuperadminUnauthorizedPage } from "../pages/SuperadminUnauthorizedPage";
import { SuperadminUsersPage } from "../pages/SuperadminUsersPage";
import { SuperadminWalletsPage } from "../pages/SuperadminWalletsPage";
import { SuperadminWithdrawalsPage } from "../pages/SuperadminWithdrawalsPage";
import { SUPERADMIN_ROUTE_DEFINITIONS } from "../config/routes";

function buildProtectedRoute(route) {
  const routePages = {
    accounts: <SuperadminAccountsPage />,
    audit: <SuperadminAuditPage />,
    chains: <SuperadminChainsPage />,
    deposits: <SuperadminDepositsPage />,
    jobs: <SuperadminJobsPage />,
    overview: <SuperadminOverviewPage />,
    runtime: <SuperadminRuntimePage />,
    sessions: <SuperadminSessionsPage />,
    treasury: <SuperadminTreasuryPage />,
    transactions: <SuperadminTransactionsPage />,
    users: <SuperadminUsersPage />,
    wallets: <SuperadminWalletsPage />,
    withdrawals: <SuperadminWithdrawalsPage />,
  };

  const page = routePages[route.surface] || <SuperadminPlaceholderPage />;

  const element = (
    <SuperadminRouteGuard routeId={route.id}>
      {page}
    </SuperadminRouteGuard>
  );

  if (!route.relativePath) {
    return {
      index: true,
      element,
    };
  }

  return {
    path: route.relativePath,
    element,
  };
}

export default function SuperadminRoutes() {
  return useRoutes([
    {
      path: "unauthorized",
      element: <SuperadminUnauthorizedPage />,
    },
    {
      element: <SuperadminLayout />,
      children: [
        ...SUPERADMIN_ROUTE_DEFINITIONS.map(buildProtectedRoute),
        {
          path: "*",
          element: <Navigate to="/superadmin" replace />,
        },
      ],
    },
  ]);
}
