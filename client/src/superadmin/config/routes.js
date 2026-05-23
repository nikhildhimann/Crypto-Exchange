import {
  ActivitySquare,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookCheck,
  DatabaseZap,
  LayoutDashboard,
  Settings2,
  Shield,
  UserRoundCog,
  Users,
  Vault,
  Wallet,
  Waypoints,
} from "lucide-react";
import { matchPath } from "react-router";
import {
  ADMIN_PERMISSION_KEYS,
  SUPERADMIN_ONLY_ACCESS,
  canAccessRoute,
} from "./access";

export const SUPERADMIN_BASE_PATH = "/superadmin";
export const SUPERADMIN_LOGIN_PATH = "/superadmin/login";
export const SUPERADMIN_UNAUTHORIZED_PATH = "/superadmin/unauthorized";

export const SUPERADMIN_NAV_GROUPS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "operations", label: "Operations" },
  { id: "security", label: "Security" },
  { id: "runtime", label: "Runtime" },
  { id: "settings", label: "Settings" },
]);

function createRouteDefinition({
  id,
  group,
  relativePath,
  title,
  navLabel,
  description,
  icon,
  permission,
  surface = "placeholder",
}) {
  const normalizedRelativePath = String(relativePath || "").trim();
  const fullPath = normalizedRelativePath
    ? `${SUPERADMIN_BASE_PATH}/${normalizedRelativePath}`
    : SUPERADMIN_BASE_PATH;

  return {
    id,
    group,
    relativePath: normalizedRelativePath,
    fullPath,
    title,
    navLabel,
    description,
    icon,
    surface,
    permissionKey: permission || "",
    access: SUPERADMIN_ONLY_ACCESS,
  };
}

export const SUPERADMIN_ROUTE_DEFINITIONS = Object.freeze([
  createRouteDefinition({
    id: "overview",
    group: "overview",
    relativePath: "",
    title: "Overview",
    navLabel: "Overview",
    description: "Platform activity and runtime summary.",
    icon: LayoutDashboard,
    permission: ADMIN_PERMISSION_KEYS.OVERVIEW_READ,
    surface: "overview",
  }),
  createRouteDefinition({
    id: "users",
    group: "operations",
    relativePath: "users",
    title: "Users",
    navLabel: "Users",
    description: "User records and activity.",
    icon: Users,
    permission: ADMIN_PERMISSION_KEYS.USERS_READ,
    surface: "users",
  }),
  createRouteDefinition({
    id: "accounts",
    group: "operations",
    relativePath: "accounts",
    title: "Accounts",
    navLabel: "Accounts",
    description: "Account records and ownership.",
    icon: UserRoundCog,
    permission: ADMIN_PERMISSION_KEYS.ACCOUNTS_READ,
    surface: "accounts",
  }),
  createRouteDefinition({
    id: "wallets",
    group: "operations",
    relativePath: "wallets",
    title: "Wallets",
    navLabel: "Wallets",
    description: "Wallet inventory and status.",
    icon: Wallet,
    permission: ADMIN_PERMISSION_KEYS.WALLETS_READ,
    surface: "wallets",
  }),
  createRouteDefinition({
    id: "transactions",
    group: "operations",
    relativePath: "transactions",
    title: "Transactions",
    navLabel: "Transactions",
    description: "Transaction activity and status.",
    icon: ActivitySquare,
    permission: ADMIN_PERMISSION_KEYS.TRANSACTIONS_READ,
    surface: "transactions",
  }),
  createRouteDefinition({
    id: "sessions",
    group: "security",
    relativePath: "sessions",
    title: "Sessions",
    navLabel: "Sessions",
    description: "Session activity and access status.",
    icon: Shield,
    permission: ADMIN_PERMISSION_KEYS.SESSIONS_READ,
    surface: "sessions",
  }),
  createRouteDefinition({
    id: "audit",
    group: "security",
    relativePath: "audit",
    title: "Audit Logs",
    navLabel: "Audit Logs",
    description: "Audit events and operator activity.",
    icon: BookCheck,
    permission: ADMIN_PERMISSION_KEYS.AUDIT_READ,
    surface: "audit",
  }),
  createRouteDefinition({
    id: "runtime",
    group: "runtime",
    relativePath: "runtime",
    title: "Runtime",
    navLabel: "Runtime",
    description: "Service health, alerts, and queue status.",
    icon: AlertTriangle,
    permission: ADMIN_PERMISSION_KEYS.RUNTIME_READ,
    surface: "runtime",
  }),
  createRouteDefinition({
    id: "treasury",
    group: "runtime",
    relativePath: "treasury",
    title: "Treasury",
    navLabel: "Treasury",
    description: "Treasury balances and reserve wallets.",
    icon: Vault,
    permission: ADMIN_PERMISSION_KEYS.TREASURY_READ,
    surface: "treasury",
  }),
  createRouteDefinition({
    id: "chains",
    group: "runtime",
    relativePath: "chains",
    title: "Chains",
    navLabel: "Chains",
    description: "Chain configuration and runtime status.",
    icon: Waypoints,
    permission: ADMIN_PERMISSION_KEYS.CHAINS_READ,
    surface: "chains",
  }),
  createRouteDefinition({
    id: "jobs",
    group: "runtime",
    relativePath: "jobs",
    title: "Jobs",
    navLabel: "Jobs",
    description: "Scheduler status and job execution.",
    icon: DatabaseZap,
    permission: ADMIN_PERMISSION_KEYS.JOBS_READ,
    surface: "jobs",
  }),
  createRouteDefinition({
    id: "settings",
    group: "settings",
    relativePath: "settings",
    title: "Settings",
    navLabel: "Settings",
    description: "Platform settings.",
    icon: Settings2,
    permission: ADMIN_PERMISSION_KEYS.SETTINGS_READ,
  }),
]);

const SUPERADMIN_ROUTE_MAP = new Map(
  SUPERADMIN_ROUTE_DEFINITIONS.map((route) => [route.id, route]),
);

const SUPERADMIN_NAV_GROUP_MAP = new Map(
  SUPERADMIN_NAV_GROUPS.map((group) => [group.id, group]),
);

export function getSuperadminRoute(routeId) {
  return SUPERADMIN_ROUTE_MAP.get(routeId) || null;
}

export function getSuperadminRouteAccess(routeId) {
  return getSuperadminRoute(routeId)?.access || null;
}

export function resolveSuperadminRoute(pathname = "") {
  return (
    SUPERADMIN_ROUTE_DEFINITIONS.find((route) =>
      matchPath({ path: route.fullPath, end: true }, pathname),
    ) || null
  );
}

export function getSuperadminBreadcrumbs(route) {
  if (!route) {
    return [{ label: "Superadmin", href: SUPERADMIN_BASE_PATH }];
  }

  const group = SUPERADMIN_NAV_GROUP_MAP.get(route.group);

  if (route.id === "overview") {
    return [{ label: "Superadmin", href: route.fullPath }];
  }

  const breadcrumbs = [{ label: "Superadmin", href: SUPERADMIN_BASE_PATH }];

  if (group?.label && group.id !== "overview") {
    breadcrumbs.push({ label: group.label });
  }

  breadcrumbs.push({ label: route.title, href: route.fullPath });
  return breadcrumbs;
}

export function getSuperadminNavSections(accessContext) {
  return SUPERADMIN_NAV_GROUPS.map((group) => {
    const items = SUPERADMIN_ROUTE_DEFINITIONS.filter((route) => route.group === group.id).filter(
      (route) => canAccessRoute(accessContext, route.access),
    );

    return {
      ...group,
      items,
    };
  }).filter((group) => group.items.length > 0);
}
