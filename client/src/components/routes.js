import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router";
import { useSelector } from "react-redux";
import { useAppContext } from "../contexts/AppContext";
import { readPendingAccountSetup, readSetupIntent } from "../lib/accountSetupFlow";
import { SuperadminLoginPage } from "../superadmin/auth/SuperadminLoginPage";
import { selectIsSuperadminAuthenticated } from "../superadmin/store/selectors";
import { SuperadminSubtleLoader } from "../superadmin/components/SuperadminSubtleLoader";
import { Splash } from "./auth/Splash";
import { Onboarding } from "./auth/Onboarding";
import { Auth } from "./auth/Auth";
import { WalletSetupSeed, WalletSetupConfirm } from "./auth/WalletSetup";
import { RestoreWallet } from "./auth/RestoreWallet";
import { PinSetup } from "./auth/PinSetup";
import { Unlock } from "./auth/Unlock";
import { AppLayout } from "./dashboard/AppLayout";
import { Home } from "./dashboard/Home";
import { AssetDetail } from "./portfolio/AssetDetail";
import { Portfolio } from "./portfolio/Portfolio";
import { NftBrowserScreen } from "./nft/NftBrowserScreen";
import { BalanceInsights } from "./portfolio/BalanceInsights";
import { LiveMarkets } from "./portfolio/LiveMarkets";
import { SendFlow } from "./transactions/Send";
import { Receive } from "./transactions/Receive";
import { Swap } from "./transactions/Swap";
import { History } from "./transactions/History";
import { TransactionDetail } from "./transactions/TransactionDetail";
import { Scanner } from "./transactions/Scanner";
import { Explorer } from "./transactions/Explorer";
import { Receipt } from "./transactions/Receipt";

import { Discover } from "./dapps/Discover";
import { DAppDetail } from "./dapps/DAppDetail";

import { Settings } from "./settings/Settings";
import { SettingsDetail } from "./settings/SettingsDetail";

import { Notifications } from "./dashboard/Notifications";

const SuperadminRoutes = lazy(() => import("../superadmin/routes/SuperadminRoutes"));

function RouteLoader() {
  return (
    <div className="aura-container items-center justify-center">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
        Loading...
      </p>
    </div>
  );
}

function SuperadminRouteLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#020617]">
      <SuperadminSubtleLoader />
    </div>
  );
}

function SuperadminLoginRoute() {
  const isAuthenticated = useSelector(selectIsSuperadminAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/superadmin" replace />;
  }

  return <SuperadminLoginPage />;
}

function WalletGate() {
  const { wallets } = useAppContext();

  if (!wallets?.length) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
}

function ProtectedSetupLayout() {
  const { bootStatus, appAccessState } = useAppContext();
  const location = useLocation();
  const isSetupRoute = location.pathname.startsWith("/app/account");

  // Allow setup routes to load even before wallet bootstrap is "ready"
  // to prevent deadlocks for new accounts
  if (bootStatus !== "ready" && !isSetupRoute) return <RouteLoader />;
  if (appAccessState === "logged_out") return <Navigate to="/auth/login" replace />;
  if (appAccessState === "locked") return <Navigate to="/unlock" replace />;
  if (appAccessState === "pin_setup_required") return <Navigate to="/unlock/setup-pin" replace />;

  return <Outlet />;
}

function PublicAuthLayout() {
  const { bootStatus, appAccessState, wallets } = useAppContext();
  const location = useLocation();
  const isSetupRoute = location.pathname.startsWith("/setup");
  const isSetupSeedRoute = location.pathname === "/setup/seed";
  const isSetupRestoreRoute = location.pathname === "/setup/restore";
  const isSetupConfirmRoute = location.pathname === "/setup/confirm";
  const isAllowedLoggedOutSetupRoute = isSetupSeedRoute || isSetupRestoreRoute;
  const setupIntent = readSetupIntent();
  const pendingSetup = readPendingAccountSetup();
  const hasCreateSetupAccess =
    setupIntent?.mode === "create" || pendingSetup?.mode === "create";
  const hasRestoreSetupAccess =
    setupIntent?.mode === "restore" || pendingSetup?.mode === "restore";
  const hasSetupRouteAccess =
    (isSetupSeedRoute && hasCreateSetupAccess) ||
    (isSetupRestoreRoute && hasRestoreSetupAccess) ||
    (isSetupConfirmRoute && hasCreateSetupAccess);

  // Keep setup routes mounted while their auth/session bootstrap settles so the
  // page does not flicker out to the generic loader during create/restore.
  if (bootStatus !== "ready" && !isSetupRoute) {
    return <RouteLoader />;
  }

  if (isSetupSeedRoute && !hasCreateSetupAccess) {
    return <Navigate to={appAccessState === "unlocked" ? "/app/home" : "/auth/login"} replace />;
  }

  if (isSetupRestoreRoute && !hasRestoreSetupAccess) {
    return <Navigate to={appAccessState === "unlocked" ? "/app/home" : "/auth/login"} replace />;
  }

  if (isSetupConfirmRoute && !hasCreateSetupAccess) {
    return <Navigate to={appAccessState === "unlocked" ? "/app/home" : "/auth/login"} replace />;
  }

  // 2. Global bounce for completely authorized users
  if (appAccessState === "unlocked" && wallets?.length > 0 && !isSetupRoute) {
    return <Navigate to="/app/home" replace />;
  }

  // Setup routes manage their own post-success navigation. Let them remain
  // stable while account/wallet bootstrap transitions through intermediate
  // auth states (e.g. pin_setup_required / locked) during submission.
  if (isSetupRoute && hasSetupRouteAccess) {
    return <Outlet />;
  }

  // 3. Locked state protection
  if (appAccessState === "locked") {
    return <Navigate to="/unlock" replace />;
  }

  // 4. Pin setup enforcement
  if (appAccessState === "pin_setup_required") {
    return <Navigate to="/unlock/setup-pin" replace />;
  }

  // 5. Allow logged-out users to bootstrap backend session from wallet create/restore only.
  if (
    appAccessState === "logged_out" &&
    location.pathname.startsWith("/setup") &&
    !isAllowedLoggedOutSetupRoute
  ) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
}

function LazySuperadminLayout() {
  return (
    <Suspense fallback={<SuperadminRouteLoader />}>
      <SuperadminRoutes />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Splash,
  },
  {
    element: <PublicAuthLayout />,
    children: [
      {
        path: "/onboarding",
        Component: Onboarding,
      },
      {
        path: "/auth/login",
        Component: Auth,
      },
      {
        path: "/setup/restore",
        Component: RestoreWallet,
      },
      {
        path: "/setup/seed",
        Component: WalletSetupSeed,
      },
      {
        path: "/setup/confirm",
        Component: WalletSetupConfirm,
      },
    ],
  },
  {
    path: "/unlock/setup-pin",
    Component: PinSetup,
  },
  {
    path: "/unlock",
    Component: Unlock,
  },
  {
    path: "/app",
    element: <ProtectedSetupLayout />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "account/create", Component: WalletSetupSeed },
          { path: "account/create/confirm", Component: WalletSetupConfirm },
          { path: "account/restore", Component: RestoreWallet },
          {
            element: <WalletGate />,
            children: [
              { index: true, element: <Navigate to="/app/home" replace /> },
              { path: "home", Component: Home },
              { path: "asset/:id", Component: AssetDetail },
              { path: "send", Component: SendFlow },
              { path: "receive", Component: Receive },
              { path: "swap", Component: Swap },
              { path: "history", Component: History },
              { path: "transaction/:id", Component: TransactionDetail },
              { path: "portfolio", Component: Portfolio },
              { path: "nfts", Component: NftBrowserScreen },
              { path: "discover", Component: Discover },
              { path: "settings", Component: Settings },
              { path: "settings/:type", Component: SettingsDetail },
              { path: "scanner", Component: Scanner },
              { path: "balance-insights", Component: BalanceInsights },
              { path: "dapp/:id", Component: DAppDetail },
              { path: "notifications", Component: Notifications },
              { path: "markets", Component: LiveMarkets },
              { path: "explorer/:id", Component: Explorer },
              { path: "receipt/:id", Component: Receipt },
            ],
          },
        ],
      },
      { path: "*", element: <Navigate to="/app/home" replace /> },
    ],
  },
  {
    path: "/superadmin/login",
    Component: SuperadminLoginRoute,
  },
  {
    path: "/superadmin/*",
    Component: LazySuperadminLayout,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
