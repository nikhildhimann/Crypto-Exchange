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

function buildWithdrawalsQuery(query = {}) {
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

function normalizeAccountSummary(account = {}) {
  return {
    id: normalizeString(account.id),
    userId: normalizeString(account.userId),
    name: normalizeString(account.name),
    type: normalizeString(account.type),
    status: normalizeString(account.status),
    createdAt: normalizeString(account.createdAt),
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
    label: normalizeString(wallet.label),
    sourceType: normalizeString(wallet.sourceType),
    isImported: Boolean(wallet.isImported),
    hidden: Boolean(wallet.hidden),
    archived: Boolean(wallet.archived),
    isPrimary: Boolean(wallet.isPrimary),
    isDefaultForChain: Boolean(wallet.isDefaultForChain),
    createdAt: normalizeString(wallet.createdAt),
  };
}

function normalizeWithdrawal(withdrawal = {}) {
  return {
    id: normalizeString(withdrawal.id),
    userId: normalizeString(withdrawal.userId),
    accountId: normalizeString(withdrawal.accountId),
    walletId: normalizeString(withdrawal.walletId),
    transactionId: normalizeString(withdrawal.transactionId),
    chain: normalizeString(withdrawal.chain),
    network: normalizeString(withdrawal.network),
    asset: normalizeString(withdrawal.asset),
    amount: normalizeString(withdrawal.amount),
    destinationAddress: normalizeString(withdrawal.destinationAddress),
    executionParams: normalizeObject(withdrawal.executionParams),
    status: normalizeString(withdrawal.status),
    reference: normalizeString(withdrawal.reference),
    txHash: normalizeString(withdrawal.txHash),
    chainStatus: normalizeString(withdrawal.chainStatus),
    systemStatus: normalizeString(withdrawal.systemStatus),
    confirmedAt: normalizeString(withdrawal.confirmedAt),
    failedAt: normalizeString(withdrawal.failedAt),
    metadata: normalizeObject(withdrawal.metadata),
    createdAt: normalizeString(withdrawal.createdAt),
    updatedAt: normalizeString(withdrawal.updatedAt),
    user: normalizeUserSummary(withdrawal.user),
    account: normalizeAccountSummary(withdrawal.account),
    wallet: normalizeWalletSummary(withdrawal.wallet),
  };
}

export async function fetchSuperadminWithdrawals(query = {}) {
  const response = await superadminApiRequest("/superadmin/withdrawals", {
    query: buildWithdrawalsQuery(query),
  });
  const data = getData(response);

  return {
    ...normalizeListMeta(data),
    items: normalizeArray(data.items).map(normalizeWithdrawal),
  };
}

export async function fetchSuperadminWithdrawalDetail(withdrawalId) {
  const response = await superadminApiRequest(`/superadmin/withdrawals/${withdrawalId}`);
  const data = getData(response);

  return normalizeWithdrawal(data);
}
