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

function buildAuditQuery(query = {}) {
  const params = {};

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params[key] = value;
  });

  return params;
}

function normalizeUserSummary(user = {}) {
  return {
    id: normalizeString(user.id),
    status: normalizeString(user.status),
    role: normalizeString(user.role),
    primaryChain: normalizeString(user.primaryChain),
    publicAddress: normalizeString(user.publicAddress),
    publicKey: normalizeString(user.publicKey),
    lastAccessAt: normalizeString(user.lastAccessAt),
    createdAt: normalizeString(user.createdAt),
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
    user: normalizeUserSummary(event.user),
    metadata: normalizeObject(event.metadata),
  };
}

export async function fetchSuperadminAuditEvents(query = {}) {
  const response = await superadminApiRequest("/superadmin/audit", {
    query: buildAuditQuery(query),
  });
  const data = getData(response);

  return {
    ...normalizeListMeta(data),
    items: normalizeArray(data.items).map(normalizeAuditEvent),
  };
}

export async function fetchSuperadminAuditEventDetail(auditId) {
  const response = await superadminApiRequest(`/superadmin/audit/${auditId}`);
  const data = getData(response);

  return normalizeAuditEvent(data);
}
