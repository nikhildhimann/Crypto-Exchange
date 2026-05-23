import { normalizeObject, normalizeString } from "../utils/common";

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry).trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function normalizeSuperadminSession(payload = {}) {
  const rawPayload =
    payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : normalizeObject(payload);

  const rawSession = normalizeObject(rawPayload.session);
  const rawSuperadmin = normalizeObject(rawPayload.superadmin);
  const accessToken = normalizeString(rawPayload.accessToken || rawPayload.token);
  const sessionId = normalizeString(rawSession.sessionId || rawPayload.sessionId);
  const superadminId = normalizeString(
    rawPayload.superadminId || rawSuperadmin._id || rawSuperadmin.id,
  );
  const role = normalizeString(rawSuperadmin.role || rawPayload.role).trim().toLowerCase();
  const roles = normalizeStringList(rawPayload.roles || rawSuperadmin.roles || (role ? [role] : []));
  const permissions = normalizeStringList(
    rawPayload.permissions || rawSuperadmin.permissions,
  );

  return {
    token: accessToken,
    accessToken,
    refreshToken: normalizeString(rawPayload.refreshToken),
    superadminId,
    email: normalizeString(rawSuperadmin.email),
    role,
    roles,
    permissions,
    sessionId,
    sessionStatus: normalizeString(rawSession.status || rawPayload.sessionStatus),
    accessTokenExpiresAt: normalizeString(rawPayload.accessTokenExpiresAt),
    refreshTokenExpiresAt: normalizeString(rawPayload.refreshTokenExpiresAt),
    sessionExpiresAt: normalizeString(rawPayload.sessionExpiresAt || rawSession.expiresAt),
    session: {
      ...rawSession,
      sessionId,
      status: normalizeString(rawSession.status || rawPayload.sessionStatus),
      expiresAt: normalizeString(rawPayload.sessionExpiresAt || rawSession.expiresAt),
    },
    superadmin: {
      ...rawSuperadmin,
      _id: normalizeString(rawSuperadmin._id || rawSuperadmin.id || superadminId),
      email: normalizeString(rawSuperadmin.email),
      role,
      roles,
      permissions,
    },
  };
}
