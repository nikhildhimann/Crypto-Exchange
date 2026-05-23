import { superadminApiRequest } from "./client";
import { normalizeArray, normalizeNumber, normalizeObject, getData, normalizeString } from "../utils/common";

const DEFAULT_LIST_LIMIT = 5;
const DEFAULT_RUNTIME_LIMIT = 4;

function normalizeListResponse(payload = {}) {
  const data = getData(payload);

  return {
    items: normalizeArray(data.items),
    page: normalizeNumber(data.page, 1),
    limit: normalizeNumber(data.limit, DEFAULT_LIST_LIMIT),
    total: normalizeNumber(data.total, 0),
    totalPages: normalizeNumber(data.totalPages, 0),
    hasNextPage: Boolean(data.hasNextPage),
    hasPrevPage: Boolean(data.hasPrevPage),
    appliedFilters: normalizeObject(data.appliedFilters),
    sort: normalizeObject(data.sort),
  };
}

export async function fetchSuperadminOverviewMetrics() {
  const response = await superadminApiRequest("/superadmin/overview");
  const data = getData(response);

  return {
    counts: normalizeObject(data.counts),
    queues: normalizeObject(data.queues),
    sessions: normalizeObject(data.sessions),
    treasury: normalizeObject(data.treasury),
    runtime: {
      ...normalizeObject(data.runtime),
      disabledChains: normalizeArray(data.runtime?.disabledChains),
      jobs: normalizeObject(data.runtime?.jobs),
    },
    alerts: normalizeArray(data.alerts),
  };
}

export async function fetchSuperadminRecentWithdrawals(limit = DEFAULT_LIST_LIMIT) {
  const response = await superadminApiRequest("/superadmin/withdrawals", {
    query: {
      limit,
      page: 1,
      sortBy: "createdAt",
      sortOrder: "desc",
    },
  });

  return normalizeListResponse(response);
}

export async function fetchSuperadminFailedTransactions(limit = DEFAULT_LIST_LIMIT) {
  const response = await superadminApiRequest("/superadmin/transactions", {
    query: {
      limit,
      page: 1,
      status: "failed",
      sortBy: "createdAt",
      sortOrder: "desc",
    },
  });

  return normalizeListResponse(response);
}

export async function fetchSuperadminRecentUsers(limit = DEFAULT_LIST_LIMIT) {
  const response = await superadminApiRequest("/superadmin/users", {
    query: {
      limit,
      page: 1,
      sortBy: "createdAt",
      sortOrder: "desc",
    },
  });

  return normalizeListResponse(response);
}

export async function fetchSuperadminRecentAuditEvents(limit = DEFAULT_LIST_LIMIT) {
  const response = await superadminApiRequest("/superadmin/audit", {
    query: {
      limit,
      page: 1,
      sortBy: "createdAt",
      sortOrder: "desc",
    },
  });

  return normalizeListResponse(response);
}

export async function fetchSuperadminRuntimeSnapshot(limit = DEFAULT_RUNTIME_LIMIT) {
  const [chainsResponse, jobsResponse] = await Promise.all([
    superadminApiRequest("/superadmin/chains", {
      query: {
        limit,
        page: 1,
        sortBy: "runtimeStatus",
        sortOrder: "asc",
      },
    }),
    superadminApiRequest("/superadmin/jobs", {
      query: {
        limit,
        page: 1,
        sortBy: "status",
        sortOrder: "asc",
      },
    }),
  ]);

  return {
    chains: normalizeListResponse(chainsResponse),
    jobs: normalizeListResponse(jobsResponse),
  };
}

export function normalizeOverviewTimestamp(value) {
  return normalizeString(value);
}
