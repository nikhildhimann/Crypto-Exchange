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

function buildTreasuryQuery(query = {}) {
  const params = {};

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params[key] = value;
  });

  return params;
}

function normalizeMetrics(metrics = {}) {
  return {
    inboundDepositsCount: normalizeNumber(metrics.inboundDepositsCount, 0),
    outboundWithdrawalsCount: normalizeNumber(metrics.outboundWithdrawalsCount, 0),
  };
}

function normalizeTreasuryWallet(item = {}) {
  return {
    id: normalizeString(item.id),
    chain: normalizeString(item.chain),
    asset: normalizeString(item.asset),
    walletType: normalizeString(item.walletType),
    address: normalizeString(item.address),
    balance: normalizeString(item.balance),
    status: normalizeString(item.status),
    createdAt: normalizeString(item.createdAt),
    updatedAt: normalizeString(item.updatedAt),
    metrics: normalizeMetrics(item.metrics),
  };
}

export async function fetchSuperadminTreasuryWallets(query = {}) {
  const response = await superadminApiRequest("/superadmin/treasury", {
    query: buildTreasuryQuery(query),
  });
  const data = getData(response);

  return {
    ...normalizeListMeta(data),
    items: normalizeArray(data.items).map(normalizeTreasuryWallet),
  };
}

export async function fetchSuperadminTreasuryWalletDetail(treasuryId) {
  const response = await superadminApiRequest(`/superadmin/treasury/${treasuryId}`);
  const data = getData(response);

  return normalizeTreasuryWallet(data);
}
