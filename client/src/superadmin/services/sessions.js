import { superadminApiRequest } from "./client";

const DEFAULT_LIMIT = 25;

import { normalizeObject, normalizeArray, normalizeString, normalizeNumber, getData } from "../utils/common";



function normalizeListMeta(data = {}) {
  return {
    items: normalizeArray(data.items),
    page: normalizeNumber(data.page, 1),
    limit: normalizeNumber(data.limit, DEFAULT_LIMIT),
    total: normalizeNumber(data.total, 0),
    totalPages: normalizeNumber(data.totalPages, 0),
    hasNextPage: Boolean(data.hasNextPage),
    hasPrevPage: Boolean(data.hasPrevPage),
    appliedFilters: normalizeObject(data.appliedFilters),
    sort: normalizeObject(data.sort),
  };
}

function buildSessionsQuery(query = {}) {
  const params = {};

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params[key] = value;
  });

  return params;
}

function normalizeActor(actor = {}) {
  return {
    id: normalizeString(actor.id),
    email: normalizeString(actor.email),
    status: normalizeString(actor.status),
    role: normalizeString(actor.role),
    primaryChain: normalizeString(actor.primaryChain),
    publicAddress: normalizeString(actor.publicAddress),
    publicKey: normalizeString(actor.publicKey),
    lastAccessAt: normalizeString(actor.lastAccessAt),
    lastLoginAt: normalizeString(actor.lastLoginAt),
    createdAt: normalizeString(actor.createdAt),
  };
}

function normalizeSession(session = {}) {
  return {
    id: normalizeString(session.id || session.sessionId),
    sessionId: normalizeString(session.sessionId || session.id),
    scope: normalizeString(session.scope),
    actorId: normalizeString(session.actorId),
    actor: normalizeActor(session.actor),
    status: normalizeString(session.status),
    deviceId: normalizeString(session.deviceId),
    deviceLabel: normalizeString(session.deviceLabel),
    platform: normalizeString(session.platform),
    appVersion: normalizeString(session.appVersion),
    biometricCapable: Boolean(session.biometricCapable),
    ipAddress: normalizeString(session.ipAddress),
    userAgent: normalizeString(session.userAgent),
    lastUsedAt: normalizeString(session.lastUsedAt),
    expiresAt: normalizeString(session.expiresAt),
    revokedAt: normalizeString(session.revokedAt),
    revokedReason: normalizeString(session.revokedReason),
    createdAt: normalizeString(session.createdAt),
    updatedAt: normalizeString(session.updatedAt),
  };
}

export async function fetchSuperadminSessions(query = {}) {
  const response = await superadminApiRequest("/superadmin/sessions", {
    query: buildSessionsQuery(query),
  });
  const data = getData(response);

  return {
    ...normalizeListMeta(data),
    items: normalizeArray(data.items).map(normalizeSession),
  };
}

export async function fetchSuperadminSessionDetail(sessionId, scope = "") {
  const response = await superadminApiRequest(`/superadmin/sessions/${sessionId}`, {
    query: scope ? { scope } : undefined,
  });
  const data = getData(response);

  return normalizeSession(data);
}
