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

function buildDepositsQuery(query = {}) {
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

function normalizeDeposit(deposit = {}) {
  return {
    id: normalizeString(deposit.id),
    userId: normalizeString(deposit.userId),
    accountId: normalizeString(deposit.accountId),
    walletId: normalizeString(deposit.walletId),
    transactionId: normalizeString(deposit.transactionId),
    chain: normalizeString(deposit.chain),
    network: normalizeString(deposit.network),
    asset: normalizeString(deposit.asset),
    address: normalizeString(deposit.address),
    txHash: normalizeString(deposit.txHash),
    vout:
      deposit.vout === null || deposit.vout === undefined
        ? ""
        : String(deposit.vout),
    amount: normalizeString(deposit.amount),
    confirmations: normalizeNumber(deposit.confirmations, 0),
    status: normalizeString(deposit.status),
    chainStatus: normalizeString(deposit.chainStatus),
    confirmedAt: normalizeString(deposit.confirmedAt),
    chainTimestamp: normalizeString(deposit.chainTimestamp),
    metadata: normalizeObject(deposit.metadata),
    createdAt: normalizeString(deposit.createdAt),
    updatedAt: normalizeString(deposit.updatedAt),
    user: normalizeUserSummary(deposit.user),
    account: normalizeAccountSummary(deposit.account),
    wallet: normalizeWalletSummary(deposit.wallet),
  };
}

export async function fetchSuperadminDeposits(query = {}) {
  const response = await superadminApiRequest("/superadmin/deposits", {
    query: buildDepositsQuery(query),
  });
  const data = getData(response);

  return {
    ...normalizeListMeta(data),
    items: normalizeArray(data.items).map(normalizeDeposit),
  };
}

export async function fetchSuperadminDepositDetail(depositId) {
  const response = await superadminApiRequest(`/superadmin/deposits/${depositId}`);
  const data = getData(response);

  return normalizeDeposit(data);
}
