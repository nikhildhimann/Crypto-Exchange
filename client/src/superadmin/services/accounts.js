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

function buildAccountsQuery(query = {}) {
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

function normalizeWalletSummary(wallet = {}) {
  return {
    id: normalizeString(wallet.id),
    userId: normalizeString(wallet.userId),
    accountId: normalizeString(wallet.accountId),
    chain: normalizeString(wallet.chain),
    network: normalizeString(wallet.network),
    asset: normalizeString(wallet.asset),
    address: normalizeString(wallet.address),
    publicKey: normalizeString(wallet.publicKey),
    label: normalizeString(wallet.label),
    sourceType: normalizeString(wallet.sourceType),
    isImported: Boolean(wallet.isImported),
    hidden: Boolean(wallet.hidden),
    archived: Boolean(wallet.archived),
    isPrimary: Boolean(wallet.isPrimary),
    isDefaultForChain: Boolean(wallet.isDefaultForChain),
    createdAt: normalizeString(wallet.createdAt),
    updatedAt: normalizeString(wallet.updatedAt),
  };
}

export async function fetchSuperadminAccounts(query = {}) {
  const response = await superadminApiRequest("/superadmin/accounts", {
    query: buildAccountsQuery(query),
  });
  const data = getData(response);

  return normalizeListMeta(data);
}

export async function fetchSuperadminAccountDetail(accountId) {
  const response = await superadminApiRequest(`/superadmin/accounts/${accountId}`);
  const data = getData(response);

  return {
    id: normalizeString(data.id),
    userId: normalizeString(data.userId),
    name: normalizeString(data.name),
    type: normalizeString(data.type),
    status: normalizeString(data.status),
    createdAt: normalizeString(data.createdAt),
    updatedAt: normalizeString(data.updatedAt),
    user: normalizeUserSummary(data.user),
    metrics: {
      walletsCount: normalizeNumber(data.metrics?.walletsCount, 0),
      transactionsCount: normalizeNumber(data.metrics?.transactionsCount, 0),
      depositsCount: normalizeNumber(data.metrics?.depositsCount, 0),
      withdrawalsCount: normalizeNumber(data.metrics?.withdrawalsCount, 0),
    },
    wallets: normalizeArray(data.wallets).map(normalizeWalletSummary),
  };
}
