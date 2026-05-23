import { superadminApiRequest } from "./client";
import { fetchSuperadminOverviewMetrics } from "./overview";

import { normalizeObject, normalizeArray, normalizeString, normalizeNumber, getData } from "../utils/common";


export function normalizeRuntimeTimestamp(value) {
  return normalizeString(value);
}

function normalizeRuntimeChain(item = {}) {
  return {
    chain: normalizeString(item.chain),
    label: normalizeString(item.label),
    networks: normalizeArray(item.networks),
    status: normalizeString(item.status),
    reason: normalizeString(item.reason),
    updatedAt: normalizeString(item.updatedAt),
  };
}

export async function fetchSuperadminRuntimeSettings() {
  const response = await superadminApiRequest("/superadmin/settings");
  const data = getData(response);
  const runtime = normalizeObject(data.runtime);
  const queue = normalizeObject(data.queue);
  const app = normalizeObject(data.app);

  return {
    app: {
      name: normalizeString(app.name),
      environment: normalizeString(app.environment),
      apiPrefix: normalizeString(app.apiPrefix),
      requestLoggingEnabled: Boolean(app.requestLoggingEnabled),
    },
    queue: {
      enabled: Boolean(queue.enabled),
      runtime: normalizeObject(queue.runtime),
    },
    runtime: {
      status: normalizeString(runtime.status),
      appName: normalizeString(runtime.appName),
      environment: normalizeString(runtime.environment),
      server: normalizeObject(runtime.server),
      database: normalizeObject(runtime.database),
      jobs: normalizeObject(runtime.jobs),
      activeChains: normalizeArray(runtime.activeChains),
      chains: normalizeArray(runtime.chains).map(normalizeRuntimeChain),
    },
  };
}

export async function fetchSuperadminRuntimeOverviewSummary() {
  const data = await fetchSuperadminOverviewMetrics();

  return {
    counts: normalizeObject(data.counts),
    queues: normalizeObject(data.queues),
    sessions: normalizeObject(data.sessions),
    treasury: normalizeObject(data.treasury),
    runtime: normalizeObject(data.runtime),
    alerts: normalizeArray(data.alerts).map((item) => ({
      code: normalizeString(item.code),
      severity: normalizeString(item.severity),
      message: normalizeString(item.message),
    })),
  };
}

export async function fetchSuperadminRuntimeCompactLists() {
  const [chainsResponse, jobsResponse, treasuryResponse] = await Promise.all([
    superadminApiRequest("/superadmin/chains", {
      query: { page: 1, limit: 6, sortBy: "runtimeStatus", sortOrder: "asc" },
    }),
    superadminApiRequest("/superadmin/jobs", {
      query: { page: 1, limit: 6, sortBy: "status", sortOrder: "asc" },
    }),
    superadminApiRequest("/superadmin/treasury", {
      query: { page: 1, limit: 6, sortBy: "status", sortOrder: "asc" },
    }),
  ]);

  const chainData = getData(chainsResponse);
  const jobsData = getData(jobsResponse);
  const treasuryData = getData(treasuryResponse);

  return {
    chains: normalizeArray(chainData.items).map((item) => ({
      code: normalizeString(item.code),
      label: normalizeString(item.label),
      runtimeStatus: normalizeString(item.runtimeStatus),
      maintenance: Boolean(item.maintenance),
      enabled: Boolean(item.enabled),
      updatedAt: normalizeString(item.updatedAt),
    })),
    jobs: normalizeArray(jobsData.items).map((item) => ({
      jobName: normalizeString(item.jobName),
      status: normalizeString(item.status),
      enabled: Boolean(item.enabled),
      running: Boolean(item.running),
      scheduled: Boolean(item.scheduled),
      intervalMs: normalizeNumber(item.intervalMs, 0),
    })),
    treasury: normalizeArray(treasuryData.items).map((item) => ({
      id: normalizeString(item.id),
      chain: normalizeString(item.chain),
      asset: normalizeString(item.asset),
      walletType: normalizeString(item.walletType),
      status: normalizeString(item.status),
      balance: normalizeString(item.balance),
      updatedAt: normalizeString(item.updatedAt),
    })),
  };
}
