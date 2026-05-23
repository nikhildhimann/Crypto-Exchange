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

function buildJobsQuery(query = {}) {
  const params = {};

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params[key] = value;
  });

  return params;
}

function normalizeJob(item = {}) {
  return {
    id: normalizeString(item.id),
    jobName: normalizeString(item.jobName),
    enabled: Boolean(item.enabled),
    scheduled: Boolean(item.scheduled),
    running: Boolean(item.running),
    intervalMs: normalizeNumber(item.intervalMs, 0),
    status: normalizeString(item.status),
    queueEnabled: Boolean(item.queueEnabled),
    updatedAt: normalizeString(item.updatedAt),
    config: normalizeObject(item.config),
    runtime: normalizeObject(item.runtime),
    health: normalizeObject(item.health),
  };
}

export async function fetchSuperadminJobs(query = {}) {
  const response = await superadminApiRequest("/superadmin/jobs", {
    query: buildJobsQuery(query),
  });
  const data = getData(response);

  return {
    ...normalizeListMeta(data),
    items: normalizeArray(data.items).map(normalizeJob),
  };
}

export async function fetchSuperadminJobDetail(jobName) {
  const response = await superadminApiRequest(`/superadmin/jobs/${jobName}`);
  const data = getData(response);

  return normalizeJob(data);
}
