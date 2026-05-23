const DEFAULT_ACCESS = Object.freeze({
  anyRoles: [],
  allRoles: [],
  anyPermissions: [],
  allPermissions: [],
  denyRoles: [],
  public: false,
});

export const AUTH_ROLES = Object.freeze({
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  USER: "user",
});

export const ADMIN_PERMISSION_KEYS = Object.freeze({
  OVERVIEW_READ: "admin.overview.read",
  RUNTIME_READ: "admin.runtime.read",
  USERS_READ: "admin.users.read",
  ACCOUNTS_READ: "admin.accounts.read",
  WALLETS_READ: "admin.wallets.read",
  TRANSACTIONS_READ: "admin.transactions.read",
  DEPOSITS_READ: "admin.deposits.read",
  WITHDRAWALS_READ: "admin.withdrawals.read",
  SESSIONS_READ: "admin.sessions.read",
  AUDIT_READ: "admin.audit.read",
  TREASURY_READ: "admin.treasury.read",
  CHAINS_READ: "admin.chains.read",
  JOBS_READ: "admin.jobs.read",
  SETTINGS_READ: "admin.settings.read",
});

export const SUPERADMIN_ONLY_ACCESS = Object.freeze({
  anyRoles: [AUTH_ROLES.SUPERADMIN],
});

function normalizeAccessList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function normalizeAccessContext({
  userId = "",
  role = "",
  roles = [],
  permissions = [],
} = {}) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const normalizedRoles = normalizeAccessList(
    normalizedRole ? [normalizedRole, ...roles] : roles,
  );
  const normalizedPermissions = normalizeAccessList(permissions);

  return {
    userId: String(userId || "").trim(),
    role: normalizedRole,
    roles: normalizedRoles,
    permissions: normalizedPermissions,
    roleSet: new Set(normalizedRoles),
    permissionSet: new Set(normalizedPermissions),
  };
}

function hasAnyMatch(set, values = []) {
  const normalizedValues = normalizeAccessList(values);

  if (!normalizedValues.length) {
    return true;
  }

  return normalizedValues.some((value) => set.has(value));
}

function hasAllMatches(set, values = []) {
  const normalizedValues = normalizeAccessList(values);

  if (!normalizedValues.length) {
    return true;
  }

  return normalizedValues.every((value) => set.has(value));
}

export function canAccessRoute(accessContext, access = null) {
  if (access?.public) {
    return true;
  }

  const resolvedAccess = {
    ...DEFAULT_ACCESS,
    ...(access || {}),
  };

  if (!access || !accessContext) {
    return false;
  }

  const normalizedDenyRoles = normalizeAccessList(resolvedAccess.denyRoles);

  if (normalizedDenyRoles.length && hasAnyMatch(accessContext.roleSet, normalizedDenyRoles)) {
    return false;
  }

  if (!hasAnyMatch(accessContext.roleSet, resolvedAccess.anyRoles)) {
    return false;
  }

  if (!hasAllMatches(accessContext.roleSet, resolvedAccess.allRoles)) {
    return false;
  }

  // Permissions stay optional until the backend emits them consistently.
  if (!hasAnyMatch(accessContext.permissionSet, resolvedAccess.anyPermissions)) {
    return false;
  }

  if (!hasAllMatches(accessContext.permissionSet, resolvedAccess.allPermissions)) {
    return false;
  }

  return true;
}
