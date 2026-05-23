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

function buildWalletsQuery(query = {}) {
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

function normalizeAddressRecord(address = {}) {
  return {
    id: normalizeString(address.id),
    address: normalizeString(address.address),
    memo: normalizeString(address.memo),
    derivationPath: normalizeString(address.derivationPath),
    branch: normalizeNumber(address.branch, 0),
    addressIndex: normalizeNumber(address.addressIndex, 0),
    addressType: normalizeString(address.addressType),
    purpose: normalizeString(address.purpose),
    isActive: Boolean(address.isActive),
    isChange: Boolean(address.isChange),
    status: normalizeString(address.status),
    metadata: normalizeObject(address.metadata),
    createdAt: normalizeString(address.createdAt),
    updatedAt: normalizeString(address.updatedAt),
  };
}

function normalizeTransactionRecord(transaction = {}) {
  return {
    id: normalizeString(transaction.id || transaction.transactionId),
    transactionId: normalizeString(transaction.transactionId || transaction.id),
    chain: normalizeString(transaction.chain),
    chainLabel: normalizeString(transaction.chainLabel),
    network: normalizeString(transaction.network),
    networkLabel: normalizeString(transaction.networkLabel),
    asset: normalizeString(transaction.asset || transaction.currency),
    currency: normalizeString(transaction.currency),
    amount: normalizeString(transaction.amount),
    direction: normalizeString(transaction.direction),
    transactionType: normalizeString(transaction.transactionType),
    status: normalizeString(transaction.status),
    txHash: normalizeString(transaction.txHash),
    fromAddress: normalizeString(transaction.fromAddress),
    toAddress: normalizeString(transaction.toAddress),
    explorerUrl: normalizeString(transaction.explorerUrl),
    displayTimestamp: normalizeString(transaction.displayTimestamp || transaction.createdAt),
    createdAt: normalizeString(transaction.createdAt),
    updatedAt: normalizeString(transaction.updatedAt),
  };
}

export async function fetchSuperadminWallets(query = {}) {
  const response = await superadminApiRequest("/superadmin/wallets", {
    query: buildWalletsQuery(query),
  });
  const data = getData(response);

  return normalizeListMeta(data);
}

export async function fetchSuperadminWalletDetail(walletId) {
  const response = await superadminApiRequest(`/superadmin/wallets/${walletId}`);
  const data = getData(response);

  return {
    id: normalizeString(data.id),
    userId: normalizeString(data.userId),
    accountId: normalizeString(data.accountId),
    chain: normalizeString(data.chain),
    network: normalizeString(data.network),
    asset: normalizeString(data.asset),
    address: normalizeString(data.address),
    publicKey: normalizeString(data.publicKey),
    label: normalizeString(data.label),
    sourceType: normalizeString(data.sourceType),
    isImported: Boolean(data.isImported),
    hidden: Boolean(data.hidden),
    archived: Boolean(data.archived),
    isPrimary: Boolean(data.isPrimary),
    isDefaultForChain: Boolean(data.isDefaultForChain),
    metadata: normalizeObject(data.metadata),
    createdAt: normalizeString(data.createdAt),
    updatedAt: normalizeString(data.updatedAt),
    user: normalizeUserSummary(data.user),
    account: normalizeAccountSummary(data.account),
    metrics: {
      addressesCount: normalizeNumber(data.metrics?.addressesCount, 0),
      transactionsCount: normalizeNumber(data.metrics?.transactionsCount, 0),
      depositsCount: normalizeNumber(data.metrics?.depositsCount, 0),
      withdrawalsCount: normalizeNumber(data.metrics?.withdrawalsCount, 0),
    },
    addresses: normalizeArray(data.addresses).map(normalizeAddressRecord),
    recentTransactions: normalizeArray(data.recentTransactions).map(normalizeTransactionRecord),
  };
}
