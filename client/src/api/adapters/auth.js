function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

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

export function normalizeAuthSession(payload = {}) {
  const rawPayload =
    payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : normalizeObject(payload);

  const rawSession = normalizeObject(rawPayload.session);
  const rawUser = normalizeObject(rawPayload.user);
  const accessToken = normalizeString(rawPayload.accessToken || rawPayload.token);
  const sessionId = normalizeString(rawSession.sessionId || rawPayload.sessionId);
  const userId = normalizeString(rawPayload.userId || rawUser._id || rawUser.id);
  const accessTokenExpiresAt = normalizeString(rawPayload.accessTokenExpiresAt);
  const sessionStatus = normalizeString(rawSession.status || rawPayload.sessionStatus);
  const sessionExpiresAt = normalizeString(rawSession.expiresAt || rawPayload.sessionExpiresAt);
  const deviceId = normalizeString(rawSession.deviceId || rawPayload.deviceId);
  const refreshTokenExpiresAt = normalizeString(
    rawPayload.refreshTokenExpiresAt || sessionExpiresAt,
  );
  const role = normalizeString(rawUser.role || rawPayload.role).trim().toLowerCase();
  const roles = normalizeStringList(
    rawUser.roles || rawPayload.roles || (role ? [role] : []),
  );
  const permissions = normalizeStringList(rawUser.permissions || rawPayload.permissions);

  return {
    token: accessToken,
    accessToken,
    refreshToken: normalizeString(rawPayload.refreshToken),
    userId,
    sessionId,
    sessionStatus,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    sessionExpiresAt,
    deviceId,
    role,
    roles,
    permissions,
    session: {
      ...rawSession,
      sessionId,
      status: sessionStatus,
      expiresAt: sessionExpiresAt,
      deviceId,
    },
    user: {
      ...rawUser,
      _id: normalizeString(rawUser._id || rawUser.id || userId),
      role,
      roles,
      permissions,
    },
  };
}

export function getAccessToken(authSession = {}) {
  return normalizeString(authSession.accessToken);
}
