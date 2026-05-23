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

function buildTransactionsQuery(query = {}) {
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
  const normalizedUser = normalizeObject(user);

  return {
    id: normalizeString(normalizedUser.id),
    status: normalizeString(normalizedUser.status),
    role: normalizeString(normalizedUser.role),
    primaryChain: normalizeString(normalizedUser.primaryChain),
    publicAddress: normalizeString(normalizedUser.publicAddress),
    publicKey: normalizeString(normalizedUser.publicKey),
    lastAccessAt: normalizeString(normalizedUser.lastAccessAt),
    createdAt: normalizeString(normalizedUser.createdAt),
  };
}

function normalizeAccountSummary(account = {}) {
  const normalizedAccount = normalizeObject(account);

  return {
    id: normalizeString(normalizedAccount.id),
    userId: normalizeString(normalizedAccount.userId),
    name: normalizeString(normalizedAccount.name),
    type: normalizeString(normalizedAccount.type),
    status: normalizeString(normalizedAccount.status),
    createdAt: normalizeString(normalizedAccount.createdAt),
  };
}

function normalizeWalletSummary(wallet = {}) {
  const normalizedWallet = normalizeObject(wallet);

  return {
    id: normalizeString(normalizedWallet.id),
    userId: normalizeString(normalizedWallet.userId),
    accountId: normalizeString(normalizedWallet.accountId),
    chain: normalizeString(normalizedWallet.chain),
    network: normalizeString(normalizedWallet.network),
    asset: normalizeString(normalizedWallet.asset),
    address: normalizeString(normalizedWallet.address),
    label: normalizeString(normalizedWallet.label),
    sourceType: normalizeString(normalizedWallet.sourceType),
    isImported: Boolean(normalizedWallet.isImported),
    hidden: Boolean(normalizedWallet.hidden),
    archived: Boolean(normalizedWallet.archived),
    isPrimary: Boolean(normalizedWallet.isPrimary),
    isDefaultForChain: Boolean(normalizedWallet.isDefaultForChain),
    createdAt: normalizeString(normalizedWallet.createdAt),
  };
}

function normalizeLedgerEntry(entry = {}) {
  const normalizedEntry = normalizeObject(entry);

  return {
    id: normalizeString(normalizedEntry.id),
    walletId: normalizeString(normalizedEntry.walletId),
    wallet: normalizeWalletSummary(normalizedEntry.wallet),
    direction: normalizeString(normalizedEntry.direction),
    amount: normalizeString(normalizedEntry.amount),
    amountBaseUnits: normalizeString(normalizedEntry.amountBaseUnits),
    asset: normalizeString(normalizedEntry.asset),
    category: normalizeString(normalizedEntry.category),
    note: normalizeString(normalizedEntry.note),
    createdAt: normalizeString(normalizedEntry.createdAt),
    updatedAt: normalizeString(normalizedEntry.updatedAt),
  };
}

function normalizeExecutionParamMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(normalizeObject(metadata)).map(([key, value]) => [
      key,
      {
        label: normalizeString(value?.label || key),
        value: value?.value,
      },
    ]),
  );
}

function normalizeTransaction(transaction = {}) {
  const normalizedTransaction = normalizeObject(transaction);

  return {
    id: normalizeString(normalizedTransaction.id || normalizedTransaction.transactionId),
    transactionId: normalizeString(normalizedTransaction.transactionId || normalizedTransaction.id),
    userId: normalizeString(normalizedTransaction.userId),
    accountId: normalizeString(normalizedTransaction.accountId),
    walletId: normalizeString(normalizedTransaction.walletId),
    relatedTransactionId: normalizeString(normalizedTransaction.relatedTransactionId),
    chain: normalizeString(normalizedTransaction.chain),
    chainLabel: normalizeString(normalizedTransaction.chainLabel),
    network: normalizeString(normalizedTransaction.network),
    networkLabel: normalizeString(normalizedTransaction.networkLabel),
    asset: normalizeString(normalizedTransaction.asset || normalizedTransaction.currency),
    assetSymbol: normalizeString(
      normalizedTransaction.assetSymbol ||
        normalizedTransaction.asset ||
        normalizedTransaction.currency,
    ),
    currency: normalizeString(normalizedTransaction.currency),
    amount: normalizeString(normalizedTransaction.amount),
    amountBaseUnits: normalizeString(normalizedTransaction.amountBaseUnits),
    networkFee: normalizeString(normalizedTransaction.networkFee),
    networkFeeBaseUnits: normalizeString(normalizedTransaction.networkFeeBaseUnits),
    networkFeeAsset: normalizeString(
      normalizedTransaction.networkFeeAsset || normalizedTransaction.networkFeeCurrency,
    ),
    platformFee: normalizeString(normalizedTransaction.platformFee),
    platformFeeBaseUnits: normalizeString(normalizedTransaction.platformFeeBaseUnits),
    totalDebit: normalizeString(normalizedTransaction.totalDebit),
    totalDebitBaseUnits: normalizeString(normalizedTransaction.totalDebitBaseUnits),
    recipientGets: normalizeString(normalizedTransaction.recipientGets),
    recipientGetsBaseUnits: normalizeString(normalizedTransaction.recipientGetsBaseUnits),
    transactionType: normalizeString(normalizedTransaction.transactionType),
    type: normalizeString(normalizedTransaction.type),
    direction: normalizeString(normalizedTransaction.direction),
    normalizedDirection: normalizeString(
      normalizedTransaction.normalizedDirection || normalizedTransaction.direction,
    ),
    status: normalizeString(normalizedTransaction.status),
    chainStatus: normalizeString(normalizedTransaction.chainStatus),
    systemStatus: normalizeString(normalizedTransaction.systemStatus),
    txHash: normalizeString(normalizedTransaction.txHash),
    fromAddress: normalizeString(normalizedTransaction.fromAddress),
    toAddress: normalizeString(normalizedTransaction.toAddress),
    address: normalizeString(normalizedTransaction.address),
    addressExplorerUrl: normalizeString(normalizedTransaction.addressExplorerUrl),
    explorerUrl: normalizeString(normalizedTransaction.explorerUrl),
    contractAddress: normalizeString(normalizedTransaction.contractAddress),
    standard: normalizeString(normalizedTransaction.standard),
    assetType: normalizeString(normalizedTransaction.assetType),
    errorMessage: normalizeString(normalizedTransaction.errorMessage),
    destinationTag:
      normalizedTransaction.destinationTag === null || normalizedTransaction.destinationTag === undefined
        ? ""
        : String(normalizedTransaction.destinationTag),
    ledgerIndex:
      normalizedTransaction.ledgerIndex === null || normalizedTransaction.ledgerIndex === undefined
        ? ""
        : String(normalizedTransaction.ledgerIndex),
    isSystemManaged: Boolean(normalizedTransaction.isSystemManaged),
    visibleInSuperadmin: normalizedTransaction.visibleInSuperadmin === true,
    executionParams: normalizeObject(normalizedTransaction.executionParams),
    executionParamLabels: normalizeObject(normalizedTransaction.executionParamLabels),
    executionParamMetadata: normalizeExecutionParamMetadata(
      normalizedTransaction.executionParamMetadata,
    ),
    explorer: normalizeObject(normalizedTransaction.explorer),
    compositeDebit: normalizeObject(normalizedTransaction.compositeDebit),
    chainTimestamp: normalizeString(normalizedTransaction.chainTimestamp),
    confirmedAt: normalizeString(normalizedTransaction.confirmedAt),
    createdAt: normalizeString(normalizedTransaction.createdAt),
    updatedAt: normalizeString(normalizedTransaction.updatedAt),
    displayTimestamp: normalizeString(
      normalizedTransaction.displayTimestamp ||
        normalizedTransaction.chainTimestamp ||
        normalizedTransaction.confirmedAt ||
        normalizedTransaction.createdAt,
    ),
    user: normalizeUserSummary(normalizedTransaction.user),
    account: normalizeAccountSummary(normalizedTransaction.account),
    wallet: normalizeWalletSummary(normalizedTransaction.wallet),
  };
}

export async function fetchSuperadminTransactions(query = {}) {
  const response = await superadminApiRequest("/superadmin/transactions", {
    query: buildTransactionsQuery(query),
  });
  const data = getData(response);

  return {
    ...normalizeListMeta(data),
    items: normalizeArray(data.items).map(normalizeTransaction),
  };
}

export async function fetchSuperadminTransactionDetail(transactionId) {
  const response = await superadminApiRequest(`/superadmin/transactions/${transactionId}`);
  const data = getData(response);

  return {
    ...normalizeTransaction(data),
    ledgerEntries: normalizeArray(data.ledgerEntries).map(normalizeLedgerEntry),
  };
}
