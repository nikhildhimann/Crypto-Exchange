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

function buildUsersQuery(query = {}) {
  const params = {};

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params[key] = value;
  });

  return params;
}

function normalizeSession(session = {}) {
  return {
    id: normalizeString(session.id || session.sessionId),
    sessionId: normalizeString(session.sessionId || session.id),
    scope: normalizeString(session.scope),
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

function normalizeAuditEvent(event = {}) {
  return {
    id: normalizeString(event.id),
    userId: normalizeString(event.userId),
    action: normalizeString(event.action),
    resource: normalizeString(event.resource),
    status: normalizeString(event.status),
    ipAddress: normalizeString(event.ipAddress),
    createdAt: normalizeString(event.createdAt),
    updatedAt: normalizeString(event.updatedAt),
  };
}

export async function fetchSuperadminUsers(query = {}) {
  const response = await superadminApiRequest("/superadmin/users", {
    query: buildUsersQuery(query),
  });
  const data = getData(response);

  return normalizeListMeta(data);
}

export async function fetchSuperadminUserDetail(userId) {
  const response = await superadminApiRequest(`/superadmin/users/${userId}`);
  const data = getData(response);

  return {
    id: normalizeString(data.id),
    primaryChain: normalizeString(data.primaryChain),
    status: normalizeString(data.status),
    role: normalizeString(data.role),
    publicAddress: normalizeString(data.publicAddress),
    publicKey: normalizeString(data.publicKey),
    qrCodeUri: normalizeString(data.qrCodeUri),
    signingPolicy: normalizeObject(data.signingPolicy),
    mfaEnabled: Boolean(data.mfaEnabled),
    lastAccessAt: normalizeString(data.lastAccessAt),
    metadata: normalizeObject(data.metadata),
    createdAt: normalizeString(data.createdAt),
    updatedAt: normalizeString(data.updatedAt),
    metrics: {
      accountsCount: normalizeNumber(data.metrics?.accountsCount, 0),
      walletsCount: normalizeNumber(data.metrics?.walletsCount, 0),
      transactionsCount: normalizeNumber(data.metrics?.transactionsCount, 0),
      depositsCount: normalizeNumber(data.metrics?.depositsCount, 0),
      withdrawalsCount: normalizeNumber(data.metrics?.withdrawalsCount, 0),
      sessionsCount: normalizeNumber(data.metrics?.sessionsCount, 0),
    },
    recentSessions: normalizeArray(data.recentSessions).map(normalizeSession),
    recentAuditEvents: normalizeArray(data.recentAuditEvents).map(normalizeAuditEvent),
  };
}
