const appConfig = require("../../config/app");
const queueConfig = require("../../config/queue");
const securityConfig = require("../../config/security");
const { AppError } = require("../../helpers/errors");
const { getHealthPayload } = require("../../services/health.service");
const runtimeState = require("../../services/runtimeState");
const { scheduler, JOB_CONFIG } = require("../../jobs");
const User = require("../user/model");
const UserSession = require("../user/session.model");
const Account = require("../accounts/model");
const Wallet = require("../wallet/model");
const WalletAddress = require("../wallet/address.model");
const Transaction = require("../transaction/model");
const LedgerEntry = require("../transaction/ledgerEntry.model");
const { mapTransactionDetail, mapTransactionSummary } = require("../transaction/response.mapper");
const Deposit = require("../deposit/model");
const Withdrawal = require("../withdrawal/model");
const TreasuryWallet = require("../treasury/model");
const SecurityAudit = require("../security/audit.model");
const policyService = require("../security/policy.service");
const Superadmin = require("../superadmin/model");
const SuperadminSession = require("../superadmin/session.model");
const { getWalletState } = require("../../common/utils/walletState");
const {
  listConfiguredChains,
  getConfiguredChainConfig,
  getChainConfig,
} = require("../../config/chains");
const { listSupportedChainMetadata } = require("../../common/utils/chain");
const {
  appendBooleanFilter,
  appendDateRangeFilter,
  appendLowerStringFilter,
  appendObjectIdFilter,
  appendSearchFilter,
  appendStringFilter,
  buildAppliedFilters,
  buildListResponse,
  isValidObjectId,
  normalizeBoolean,
  normalizeLowerString,
  normalizeString,
  paginateItems,
  parsePagination,
  resolveSort,
  runPaginatedQuery,
  toObjectId,
} = require("./query");

const USER_PROJECTION = {
  _id: 1,
  primaryChain: 1,
  status: 1,
  role: 1,
  publicAddress: 1,
  publicKey: 1,
  qrCodeUri: 1,
  signingPolicy: 1,
  mfaEnabled: 1,
  lastAccessAt: 1,
  metadata: 1,
  createdAt: 1,
  updatedAt: 1,
};

const ACCOUNT_PROJECTION = {
  _id: 1,
  userId: 1,
  name: 1,
  type: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
};

const WALLET_PROJECTION = {
  _id: 1,
  userId: 1,
  accountId: 1,
  chain: 1,
  address: 1,
  publicKey: 1,
  network: 1,
  asset: 1,
  label: 1,
  sourceType: 1,
  isImported: 1,
  metadata: 1,
  createdAt: 1,
  updatedAt: 1,
};

const TRANSACTION_LIST_PROJECTION = {
  _id: 1,
  userId: 1,
  accountId: 1,
  walletId: 1,
  chain: 1,
  network: 1,
  txHash: 1,
  amount: 1,
  amountBaseUnits: 1,
  asset: 1,
  currency: 1,
  direction: 1,
  transactionType: 1,
  type: 1,
  status: 1,
  chainStatus: 1,
  systemStatus: 1,
  fromAddress: 1,
  toAddress: 1,
  errorMessage: 1,
  confirmedAt: 1,
  chainTimestamp: 1,
  relatedTransactionId: 1,
  visibleInSuperadmin: 1,
  createdAt: 1,
  updatedAt: 1,
};

const TRANSACTION_DETAIL_PROJECTION = {
  ...TRANSACTION_LIST_PROJECTION,
  executionParams: 1,
  assetType: 1,
  standard: 1,
  contractAddress: 1,
  networkFee: 1,
  networkFeeBaseUnits: 1,
  networkFeeAsset: 1,
  networkFeeCurrency: 1,
  networkFeeAssetType: 1,
  platformFee: 1,
  platformFeeBaseUnits: 1,
  totalDebit: 1,
  totalDebitBaseUnits: 1,
  totalDebitAsset: 1,
  totalDebitCurrency: 1,
  totalDebitAssetType: 1,
  compositeDebit: 1,
  recipientGets: 1,
  recipientGetsBaseUnits: 1,
  ledgerIndex: 1,
  isSystemManaged: 1,
};

const DEPOSIT_PROJECTION = {
  _id: 1,
  userId: 1,
  accountId: 1,
  walletId: 1,
  chain: 1,
  network: 1,
  asset: 1,
  address: 1,
  txHash: 1,
  vout: 1,
  amount: 1,
  confirmations: 1,
  status: 1,
  transactionId: 1,
  chainStatus: 1,
  confirmedAt: 1,
  metadata: 1,
  createdAt: 1,
  updatedAt: 1,
};

const WITHDRAWAL_PROJECTION = {
  _id: 1,
  userId: 1,
  accountId: 1,
  walletId: 1,
  chain: 1,
  network: 1,
  asset: 1,
  amount: 1,
  destinationAddress: 1,
  executionParams: 1,
  status: 1,
  reference: 1,
  transactionId: 1,
  txHash: 1,
  chainStatus: 1,
  systemStatus: 1,
  confirmedAt: 1,
  failedAt: 1,
  metadata: 1,
  createdAt: 1,
  updatedAt: 1,
};

const TREASURY_PROJECTION = {
  _id: 1,
  chain: 1,
  asset: 1,
  walletType: 1,
  address: 1,
  balance: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
};

const AUDIT_LIST_PROJECTION = {
  _id: 1,
  userId: 1,
  action: 1,
  resource: 1,
  status: 1,
  ipAddress: 1,
  createdAt: 1,
  updatedAt: 1,
};

const AUDIT_DETAIL_PROJECTION = {
  ...AUDIT_LIST_PROJECTION,
  metadata: 1,
};

const SESSION_SCOPE_USER = "user";
const SESSION_SCOPE_SUPERADMIN = "superadmin";
const SESSION_SCOPE_ALL = "all";

function uniqueIds(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => (value == null ? "" : String(value)))
        .filter(Boolean),
    ),
  );
}

function normalizeId(value) {
  return value == null ? null : String(value);
}

function mapUserSummary(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    status: user.status,
    role: user.role,
    primaryChain: user.primaryChain,
    publicAddress: user.publicAddress || null,
    publicKey: user.publicKey || null,
    lastAccessAt: user.lastAccessAt || null,
    createdAt: user.createdAt || null,
  };
}

function mapAccountSummary(account) {
  if (!account) {
    return null;
  }

  return {
    id: String(account._id),
    userId: normalizeId(account.userId),
    name: account.name,
    type: account.type || null,
    status: account.status,
    createdAt: account.createdAt || null,
  };
}

function mapWalletSummary(wallet) {
  if (!wallet) {
    return null;
  }

  const walletState = getWalletState(wallet);

  return {
    id: String(wallet._id),
    userId: normalizeId(wallet.userId),
    accountId: normalizeId(wallet.accountId),
    chain: wallet.chain,
    network: wallet.network,
    asset: wallet.asset,
    address: wallet.address,
    label: wallet.label || "",
    sourceType: wallet.sourceType,
    isImported: Boolean(wallet.isImported),
    hidden: walletState.hidden,
    archived: walletState.archived,
    isPrimary: walletState.isPrimary,
    isDefaultForChain: walletState.isDefaultForChain,
    createdAt: wallet.createdAt || null,
  };
}

function mapSuperadminSummary(superadmin) {
  if (!superadmin) {
    return null;
  }

  return {
    id: String(superadmin._id),
    email: superadmin.email,
    role: superadmin.role,
    status: superadmin.status,
    lastLoginAt: superadmin.lastLoginAt || null,
    createdAt: superadmin.createdAt || null,
  };
}

async function loadUserSummaryMap(userIds = []) {
  const ids = uniqueIds(userIds).filter(isValidObjectId).map(toObjectId);
  if (!ids.length) {
    return new Map();
  }

  const users = await User.find({ _id: { $in: ids } }, USER_PROJECTION).lean();
  return new Map(users.map((user) => [String(user._id), mapUserSummary(user)]));
}

async function loadAccountSummaryMap(accountIds = []) {
  const ids = uniqueIds(accountIds).filter(isValidObjectId).map(toObjectId);
  if (!ids.length) {
    return new Map();
  }

  const accounts = await Account.find({ _id: { $in: ids } }, ACCOUNT_PROJECTION).lean();
  return new Map(accounts.map((account) => [String(account._id), mapAccountSummary(account)]));
}

async function loadWalletSummaryMap(walletIds = []) {
  const ids = uniqueIds(walletIds).filter(isValidObjectId).map(toObjectId);
  if (!ids.length) {
    return new Map();
  }

  const wallets = await Wallet.find({ _id: { $in: ids } }, WALLET_PROJECTION).lean();
  return new Map(wallets.map((wallet) => [String(wallet._id), mapWalletSummary(wallet)]));
}

async function loadSuperadminSummaryMap(superadminIds = []) {
  const ids = uniqueIds(superadminIds).filter(isValidObjectId).map(toObjectId);
  if (!ids.length) {
    return new Map();
  }

  const docs = await Superadmin.find({
    _id: { $in: ids },
  }).select("_id email role status lastLoginAt createdAt").lean();

  return new Map(docs.map((doc) => [String(doc._id), mapSuperadminSummary(doc)]));
}

async function countGroupedByField(model, field, ids = []) {
  const normalizedIds = uniqueIds(ids).filter(isValidObjectId).map(toObjectId);
  if (!normalizedIds.length) {
    return new Map();
  }

  const results = await model.aggregate([
    {
      $match: {
        [field]: { $in: normalizedIds },
      },
    },
    {
      $group: {
        _id: `$${field}`,
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(results.map((entry) => [String(entry._id), entry.count]));
}

function withLinkedSummaries(item, userMap, accountMap, walletMap) {
  return {
    ...item,
    user: item.userId ? userMap.get(String(item.userId)) || null : null,
    account: item.accountId ? accountMap.get(String(item.accountId)) || null : null,
    wallet: item.walletId ? walletMap.get(String(item.walletId)) || null : null,
  };
}

function parseObjectIdSearch(search) {
  const normalized = normalizeString(search);
  return isValidObjectId(normalized) ? toObjectId(normalized) : null;
}

function normalizeUserDocument(user) {
  return {
    id: String(user._id),
    primaryChain: user.primaryChain,
    status: user.status,
    role: user.role,
    publicAddress: user.publicAddress || null,
    publicKey: user.publicKey || null,
    qrCodeUri: user.qrCodeUri || null,
    signingPolicy: user.signingPolicy || null,
    mfaEnabled: Boolean(user.mfaEnabled),
    lastAccessAt: user.lastAccessAt || null,
    metadata: user.metadata || {},
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function normalizeUserListItem(user) {
  return {
    id: String(user._id),
    primaryChain: user.primaryChain,
    status: user.status,
    role: user.role,
    publicAddress: user.publicAddress || null,
    publicKey: user.publicKey || null,
    mfaEnabled: Boolean(user.mfaEnabled),
    lastAccessAt: user.lastAccessAt || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function normalizeAccountDocument(account) {
  return {
    id: String(account._id),
    userId: normalizeId(account.userId),
    name: account.name,
    type: account.type || null,
    status: account.status,
    createdAt: account.createdAt || null,
    updatedAt: account.updatedAt || null,
  };
}

function normalizeWalletDocument(wallet) {
  const walletState = getWalletState(wallet);

  return {
    id: String(wallet._id),
    userId: normalizeId(wallet.userId),
    accountId: normalizeId(wallet.accountId),
    chain: wallet.chain,
    network: wallet.network,
    asset: wallet.asset,
    address: wallet.address,
    publicKey: wallet.publicKey,
    label: wallet.label || "",
    sourceType: wallet.sourceType,
    isImported: Boolean(wallet.isImported),
    hidden: walletState.hidden,
    archived: walletState.archived,
    isPrimary: walletState.isPrimary,
    isDefaultForChain: walletState.isDefaultForChain,
    metadata: wallet.metadata || {},
    createdAt: wallet.createdAt || null,
    updatedAt: wallet.updatedAt || null,
  };
}

function normalizeWalletListItem(wallet) {
  const walletState = getWalletState(wallet);

  return {
    id: String(wallet._id),
    userId: normalizeId(wallet.userId),
    accountId: normalizeId(wallet.accountId),
    chain: wallet.chain,
    network: wallet.network,
    asset: wallet.asset,
    address: wallet.address,
    label: wallet.label || "",
    sourceType: wallet.sourceType,
    isImported: Boolean(wallet.isImported),
    hidden: walletState.hidden,
    archived: walletState.archived,
    isPrimary: walletState.isPrimary,
    isDefaultForChain: walletState.isDefaultForChain,
    createdAt: wallet.createdAt || null,
    updatedAt: wallet.updatedAt || null,
  };
}

function normalizeDepositDocument(deposit) {
  return {
    id: String(deposit._id),
    userId: normalizeId(deposit.userId),
    accountId: normalizeId(deposit.accountId),
    walletId: normalizeId(deposit.walletId),
    chain: deposit.chain,
    network: deposit.network || "",
    asset: deposit.asset,
    address: deposit.address,
    txHash: deposit.txHash || "",
    vout: deposit.vout ?? null,
    amount: deposit.amount,
    confirmations: Number(deposit.confirmations || 0),
    status: deposit.status,
    transactionId: normalizeId(deposit.transactionId),
    chainStatus: deposit.chainStatus || "",
    confirmedAt: deposit.confirmedAt || null,
    metadata: deposit.metadata || {},
    createdAt: deposit.createdAt || null,
    updatedAt: deposit.updatedAt || null,
  };
}

function normalizeWithdrawalDocument(withdrawal) {
  return {
    id: String(withdrawal._id),
    userId: normalizeId(withdrawal.userId),
    accountId: normalizeId(withdrawal.accountId),
    walletId: normalizeId(withdrawal.walletId),
    chain: withdrawal.chain,
    network: withdrawal.network || "",
    asset: withdrawal.asset,
    amount: withdrawal.amount,
    destinationAddress: withdrawal.destinationAddress,
    executionParams: withdrawal.executionParams || {},
    status: withdrawal.status,
    reference: withdrawal.reference,
    transactionId: normalizeId(withdrawal.transactionId),
    txHash: withdrawal.txHash || "",
    chainStatus: withdrawal.chainStatus || "",
    systemStatus: withdrawal.systemStatus || "",
    confirmedAt: withdrawal.confirmedAt || null,
    failedAt: withdrawal.failedAt || null,
    metadata: withdrawal.metadata || {},
    createdAt: withdrawal.createdAt || null,
    updatedAt: withdrawal.updatedAt || null,
  };
}

function normalizeTreasuryDocument(treasuryWallet) {
  return {
    id: String(treasuryWallet._id),
    chain: treasuryWallet.chain,
    asset: treasuryWallet.asset,
    walletType: treasuryWallet.walletType,
    address: treasuryWallet.address,
    balance: treasuryWallet.balance,
    status: treasuryWallet.status,
    createdAt: treasuryWallet.createdAt || null,
    updatedAt: treasuryWallet.updatedAt || null,
  };
}

function normalizeAuditDocument(audit) {
  return {
    id: String(audit._id),
    userId: normalizeId(audit.userId),
    action: audit.action,
    resource: audit.resource,
    status: audit.status,
    ipAddress: audit.ipAddress || "",
    createdAt: audit.createdAt || null,
    updatedAt: audit.updatedAt || null,
  };
}

function buildUsersFilter(query = {}) {
  const filter = {};
  appendLowerStringFilter(filter, "role", query.role);
  appendLowerStringFilter(filter, "status", query.status);
  appendLowerStringFilter(filter, "primaryChain", query.primaryChain);
  appendDateRangeFilter(filter, "createdAt", query.createdFrom, query.createdTo);
  appendDateRangeFilter(filter, "lastAccessAt", query.lastAccessFrom, query.lastAccessTo);

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const objectIdSearch = parseObjectIdSearch(search);
    if (objectIdSearch) {
      filter.$or = [
        { _id: objectIdSearch },
        { publicAddress: { $regex: searchRegex } },
        { publicKey: { $regex: searchRegex } },
      ];
    } else {
      appendSearchFilter(filter, ["publicAddress", "publicKey"], search);
    }
  }

  return filter;
}

function buildAccountsFilter(query = {}) {
  const filter = {};
  appendObjectIdFilter(filter, "userId", query.userId);
  appendLowerStringFilter(filter, "status", query.status);
  appendLowerStringFilter(filter, "type", query.type);
  appendDateRangeFilter(filter, "createdAt", query.createdFrom, query.createdTo);

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const objectIdSearch = parseObjectIdSearch(search);
    if (objectIdSearch) {
      filter.$or = [
        { _id: objectIdSearch },
        { name: { $regex: searchRegex } },
      ];
    } else {
      appendSearchFilter(filter, ["name"], search);
    }
  }

  return filter;
}

function buildWalletsFilter(query = {}) {
  const filter = {};
  appendObjectIdFilter(filter, "userId", query.userId);
  appendObjectIdFilter(filter, "accountId", query.accountId);
  appendLowerStringFilter(filter, "chain", query.chain);
  appendLowerStringFilter(filter, "network", query.network);
  appendLowerStringFilter(filter, "sourceType", query.sourceType);
  appendBooleanFilter(filter, "isImported", query.isImported);

  const hidden = normalizeBoolean(query.hidden);
  if (hidden !== null) {
    filter["metadata.walletState.hidden"] = hidden;
  }

  const archived = normalizeBoolean(query.archived);
  if (archived !== null) {
    filter["metadata.walletState.archived"] = archived;
  }

  appendDateRangeFilter(filter, "createdAt", query.createdFrom, query.createdTo);

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const objectIdSearch = parseObjectIdSearch(search);
    if (objectIdSearch) {
      filter.$or = [
        { _id: objectIdSearch },
        { address: { $regex: searchRegex } },
        { publicKey: { $regex: searchRegex } },
        { label: { $regex: searchRegex } },
      ];
    } else {
      appendSearchFilter(filter, ["address", "publicKey", "label", "asset"], search);
    }
  }

  return filter;
}

function buildTransactionsFilter(query = {}) {
  const filter = {
    visibleInSuperadmin: true,
  };
  appendObjectIdFilter(filter, "userId", query.userId);
  appendObjectIdFilter(filter, "accountId", query.accountId);
  appendObjectIdFilter(filter, "walletId", query.walletId);
  appendLowerStringFilter(filter, "chain", query.chain);
  appendLowerStringFilter(filter, "network", query.network);
  appendLowerStringFilter(filter, "status", query.status);
  appendLowerStringFilter(filter, "direction", query.direction);
  appendLowerStringFilter(filter, "transactionType", query.transactionType);
  appendStringFilter(filter, "asset", query.asset ? normalizeString(query.asset).toUpperCase() : "");
  appendDateRangeFilter(filter, "createdAt", query.createdFrom, query.createdTo);
  appendDateRangeFilter(filter, "chainTimestamp", query.chainTimestampFrom, query.chainTimestampTo);

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const objectIdSearch = parseObjectIdSearch(search);
    if (objectIdSearch) {
      filter.$or = [
        { _id: objectIdSearch },
        { txHash: { $regex: searchRegex } },
        { fromAddress: { $regex: searchRegex } },
        { toAddress: { $regex: searchRegex } },
      ];
    } else {
      appendSearchFilter(filter, ["txHash", "fromAddress", "toAddress", "asset", "contractAddress"], search);
    }
  }

  return filter;
}

function buildDepositsFilter(query = {}) {
  const filter = {};
  appendObjectIdFilter(filter, "userId", query.userId);
  appendObjectIdFilter(filter, "accountId", query.accountId);
  appendObjectIdFilter(filter, "walletId", query.walletId);
  appendLowerStringFilter(filter, "chain", query.chain);
  appendStringFilter(filter, "asset", query.asset ? normalizeString(query.asset).toUpperCase() : "");
  appendLowerStringFilter(filter, "status", query.status);
  appendDateRangeFilter(filter, "createdAt", query.createdFrom, query.createdTo);

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const objectIdSearch = parseObjectIdSearch(search);
    if (objectIdSearch) {
      filter.$or = [
        { _id: objectIdSearch },
        { transactionId: objectIdSearch },
        { txHash: { $regex: searchRegex } },
        { address: { $regex: searchRegex } },
      ];
    } else {
      appendSearchFilter(filter, ["txHash", "address", "asset"], search);
    }
  }

  return filter;
}

function buildWithdrawalsFilter(query = {}) {
  const filter = {};
  appendObjectIdFilter(filter, "userId", query.userId);
  appendObjectIdFilter(filter, "accountId", query.accountId);
  appendObjectIdFilter(filter, "walletId", query.walletId);
  appendLowerStringFilter(filter, "chain", query.chain);
  appendStringFilter(filter, "asset", query.asset ? normalizeString(query.asset).toUpperCase() : "");
  appendLowerStringFilter(filter, "status", query.status);
  appendDateRangeFilter(filter, "createdAt", query.createdFrom, query.createdTo);

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const objectIdSearch = parseObjectIdSearch(search);
    if (objectIdSearch) {
      filter.$or = [
        { _id: objectIdSearch },
        { transactionId: objectIdSearch },
        { txHash: { $regex: searchRegex } },
        { reference: { $regex: searchRegex } },
        { destinationAddress: { $regex: searchRegex } },
      ];
    } else {
      appendSearchFilter(filter, ["txHash", "reference", "destinationAddress", "asset"], search);
    }
  }

  return filter;
}

function buildAuditFilter(query = {}) {
  const filter = {};
  appendObjectIdFilter(filter, "userId", query.userId);
  appendLowerStringFilter(filter, "action", query.action);
  appendLowerStringFilter(filter, "resource", query.resource);
  appendLowerStringFilter(filter, "status", query.status);
  appendDateRangeFilter(filter, "createdAt", query.createdFrom, query.createdTo);

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const objectIdSearch = parseObjectIdSearch(search);
    if (objectIdSearch) {
      filter.$or = [
        { _id: objectIdSearch },
        { action: { $regex: searchRegex } },
        { resource: { $regex: searchRegex } },
      ];
    } else {
      appendSearchFilter(filter, ["action", "resource", "ipAddress"], search);
    }
  }

  return filter;
}

function buildTreasuryFilter(query = {}) {
  const filter = {};
  appendLowerStringFilter(filter, "chain", query.chain);
  appendStringFilter(filter, "asset", query.asset ? normalizeString(query.asset).toUpperCase() : "");
  appendLowerStringFilter(filter, "walletType", query.walletType);
  appendLowerStringFilter(filter, "status", query.status);

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const objectIdSearch = parseObjectIdSearch(search);
    if (objectIdSearch) {
      filter.$or = [
        { _id: objectIdSearch },
        { address: { $regex: searchRegex } },
      ];
    } else {
      appendSearchFilter(filter, ["chain", "asset", "address"], search);
    }
  }

  return filter;
}

function buildSessionMatch(query = {}, actorField) {
  const match = {};
  appendLowerStringFilter(match, "status", query.status);
  appendStringFilter(match, "platform", query.platform);
  appendStringFilter(match, "deviceId", query.deviceId);
  appendDateRangeFilter(match, "createdAt", query.createdFrom, query.createdTo);
  appendDateRangeFilter(match, "lastUsedAt", query.lastUsedFrom, query.lastUsedTo);

  if (actorField === "userId") {
    appendObjectIdFilter(match, "userId", query.userId);
  }

  if (actorField === "superadminId") {
    appendObjectIdFilter(match, "superadminId", query.superadminId);
  }

  const search = normalizeString(query.search);
  if (search) {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    match.$or = ["tokenId", "deviceId", "deviceLabel", "platform", "userAgent", "ipAddress"].map((field) => ({
      [field]: { $regex: searchRegex },
    }));
  }

  return match;
}

function buildSessionSort(query = {}) {
  return resolveSort(
    query,
    ["lastUsedAt", "createdAt", "expiresAt", "status"],
    { sortBy: "lastUsedAt", sortOrder: "desc" },
  );
}

function buildSessionListItem(item, userMap, superadminMap) {
  const actorId = normalizeId(item.actorId);

  return {
    id: item.sessionId,
    sessionId: item.sessionId,
    scope: item.scope,
    actorId,
    actor:
      item.scope === SESSION_SCOPE_USER
        ? userMap.get(actorId) || null
        : superadminMap.get(actorId) || null,
    status: item.status,
    deviceId: item.deviceId || "",
    deviceLabel: item.deviceLabel || "",
    platform: item.platform || "",
    appVersion: item.appVersion || "",
    biometricCapable: Boolean(item.biometricCapable),
    ipAddress: item.ipAddress || "",
    userAgent: item.userAgent || "",
    lastUsedAt: item.lastUsedAt || null,
    expiresAt: item.expiresAt || null,
    revokedAt: item.revokedAt || null,
    revokedReason: item.revokedReason || "",
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  };
}

function buildChainItems() {
  const configuredChains = listConfiguredChains();
  const implementedChainMetadata = new Map(
    listSupportedChainMetadata().map((entry) => [String(entry.code), entry]),
  );
  const runtimeStatuses = new Map(
    runtimeState.listChainStatuses().map((entry) => [String(entry.chain), entry]),
  );

  return configuredChains.map((chain) => {
    const runtimeChain = getChainConfig(chain.code);
    const implemented = implementedChainMetadata.get(chain.code) || null;
    const runtimeStatus = runtimeStatuses.get(chain.code) || null;

    return {
      id: chain.code,
      code: chain.code,
      label: chain.label,
      family: chain.family,
      nativeAssetSymbol: chain.nativeAssetSymbol,
      defaultNetwork: chain.defaultNetwork,
      enabled: Boolean(runtimeChain?.toggles?.enabled && runtimeChain?.supportedNetworks?.length),
      runtimeStatus: runtimeStatus?.status || (runtimeChain?.toggles?.enabled ? "active" : "disabled"),
      runtimeStatusReason: runtimeStatus?.reason || "",
      maintenance: Boolean(runtimeChain?.toggles?.maintenance),
      supportedNetworkCount: Array.isArray(chain.supportedNetworks) ? chain.supportedNetworks.length : 0,
      tokenCount: Array.isArray(implemented?.tokens) ? implemented.tokens.length : 0,
      assetCount: Array.isArray(implemented?.assets) ? implemented.assets.length : 0,
      updatedAt: runtimeStatus?.updatedAt || null,
      _detail: {
        configured: chain,
        runtime: runtimeChain,
        implemented,
      },
    };
  });
}

function buildJobItems() {
  const statusMap = scheduler.getStatus();

  return Object.entries(JOB_CONFIG).map(([jobName, config]) => {
    const runtime = statusMap[jobName] || {};
    const derivedStatus = !queueConfig.enabled
      ? "disabled"
      : runtime.running
        ? "running"
        : runtime.scheduled
          ? "scheduled"
          : runtime.enabled
            ? "idle"
            : "disabled";

    return {
      id: jobName,
      jobName,
      enabled: Boolean(runtime.enabled),
      scheduled: Boolean(runtime.scheduled),
      running: Boolean(runtime.running),
      intervalMs: Number(runtime.interval || config.intervalMs || 0),
      status: derivedStatus,
      queueEnabled: Boolean(queueConfig.enabled),
      updatedAt: null,
    };
  });
}

async function getOverviewMetrics() {
  const health = getHealthPayload();
  const jobItems = buildJobItems();
  const disabledChains = runtimeState.listChainStatuses().filter((entry) => entry.status !== "active");

  const [
    totalUsers,
    activeUsers,
    totalAccounts,
    totalWallets,
    totalTransactions,
    failedTransactions,
    pendingTransactions,
    totalDeposits,
    pendingDeposits,
    totalWithdrawals,
    pendingWithdrawals,
    activeUserSessions,
    activeSuperadminSessions,
    totalTreasuryWallets,
    activeTreasuryWallets,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: "active" }),
    Account.countDocuments({}),
    Wallet.countDocuments({}),
    Transaction.countDocuments({}),
    Transaction.countDocuments({ status: "failed" }),
    Transaction.countDocuments({ status: "pending" }),
    Deposit.countDocuments({}),
    Deposit.countDocuments({ status: "pending" }),
    Withdrawal.countDocuments({}),
    Withdrawal.countDocuments({ status: { $in: ["created", "pending", "queued", "processing"] } }),
    UserSession.countDocuments({ status: "active" }),
    SuperadminSession.countDocuments({ status: "active" }),
    TreasuryWallet.countDocuments({}),
    TreasuryWallet.countDocuments({ status: "active" }),
  ]);

  const alerts = [];

  if (health.status !== "ok") {
    alerts.push({
      code: "runtime_health_degraded",
      severity: "high",
      message: "Runtime health is degraded.",
    });
  }

  if (disabledChains.length > 0) {
    alerts.push({
      code: "chains_disabled",
      severity: "medium",
      message: `${disabledChains.length} chain runtime entries are disabled.`,
    });
  }

  return {
    counts: {
      totalUsers,
      activeUsers,
      totalAccounts,
      totalWallets,
      totalTransactions,
      totalDeposits,
      totalWithdrawals,
      totalTreasuryWallets,
    },
    queues: {
      pendingWithdrawals,
      pendingDeposits,
      pendingTransactions,
      failedTransactions,
    },
    sessions: {
      activeUserSessions,
      activeSuperadminSessions,
      totalActiveSessions: activeUserSessions + activeSuperadminSessions,
    },
    treasury: {
      totalWallets: totalTreasuryWallets,
      activeWallets: activeTreasuryWallets,
    },
    runtime: {
      healthStatus: health.status,
      activeChains: health.activeChains,
      disabledChains: disabledChains.map((entry) => ({
        chain: entry.chain,
        reason: entry.reason,
      })),
      jobs: {
        active: jobItems.filter((item) => item.status === "scheduled" || item.status === "running").length,
        disabled: jobItems.filter((item) => item.status === "disabled").length,
      },
    },
    alerts,
  };
}

async function listUsers(query = {}) {
  const pagination = parsePagination(query);
  const sorting = resolveSort(query, ["createdAt", "updatedAt", "lastAccessAt", "status"], {
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const filter = buildUsersFilter(query);
  const { items, total } = await runPaginatedQuery({
    model: User,
    filter,
    projection: USER_PROJECTION,
    sort: sorting.sort,
    page: pagination.page,
    limit: pagination.limit,
  });

  return buildListResponse({
    items: items.map(normalizeUserListItem),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      role: query.role,
      status: query.status,
      primaryChain: query.primaryChain,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      lastAccessFrom: query.lastAccessFrom,
      lastAccessTo: query.lastAccessTo,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getUserDetail(userId) {
  const user = await User.findById(userId, USER_PROJECTION).lean();
  if (!user) {
    throw AppError.notFound("User not found");
  }

  const [
    accountsCount,
    walletsCount,
    transactionsCount,
    depositsCount,
    withdrawalsCount,
    sessionsCount,
    recentSessions,
    recentAudits,
  ] = await Promise.all([
    Account.countDocuments({ userId }),
    Wallet.countDocuments({ userId }),
    Transaction.countDocuments({ userId }),
    Deposit.countDocuments({ userId }),
    Withdrawal.countDocuments({ userId }),
    UserSession.countDocuments({ userId }),
    UserSession.find({ userId })
      .sort({ lastUsedAt: -1 })
      .limit(10)
      .select("tokenId status deviceId deviceLabel platform appVersion biometricCapable ipAddress userAgent lastUsedAt expiresAt revokedAt revokedReason createdAt updatedAt")
      .lean(),
    SecurityAudit.find({ userId }, AUDIT_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return {
    ...normalizeUserDocument(user),
    metrics: {
      accountsCount,
      walletsCount,
      transactionsCount,
      depositsCount,
      withdrawalsCount,
      sessionsCount,
    },
    recentSessions: recentSessions.map((session) => ({
      id: session.tokenId,
      sessionId: session.tokenId,
      scope: SESSION_SCOPE_USER,
      status: session.status,
      deviceId: session.deviceId || "",
      deviceLabel: session.deviceLabel || "",
      platform: session.platform || "",
      appVersion: session.appVersion || "",
      biometricCapable: Boolean(session.biometricCapable),
      ipAddress: session.ipAddress || "",
      userAgent: session.userAgent || "",
      lastUsedAt: session.lastUsedAt || null,
      expiresAt: session.expiresAt || null,
      revokedAt: session.revokedAt || null,
      revokedReason: session.revokedReason || "",
      createdAt: session.createdAt || null,
      updatedAt: session.updatedAt || null,
    })),
    recentAuditEvents: recentAudits.map(normalizeAuditDocument),
  };
}

async function listAccounts(query = {}) {
  const pagination = parsePagination(query);
  const sorting = resolveSort(query, ["createdAt", "updatedAt", "name", "status", "type"], {
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const filter = buildAccountsFilter(query);
  const { items, total } = await runPaginatedQuery({
    model: Account,
    filter,
    projection: ACCOUNT_PROJECTION,
    sort: sorting.sort,
    page: pagination.page,
    limit: pagination.limit,
  });

  const userMap = await loadUserSummaryMap(items.map((item) => item.userId));
  const walletCounts = await countGroupedByField(Wallet, "accountId", items.map((item) => item._id));

  return buildListResponse({
    items: items.map((item) => ({
      ...normalizeAccountDocument(item),
      user: userMap.get(String(item.userId)) || null,
      walletsCount: walletCounts.get(String(item._id)) || 0,
    })),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      userId: query.userId,
      status: query.status,
      type: query.type,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getAccountDetail(accountId) {
  const account = await Account.findById(accountId, ACCOUNT_PROJECTION).lean();
  if (!account) {
    throw AppError.notFound("Account not found");
  }

  const [userMap, wallets, walletsCount, transactionsCount, depositsCount, withdrawalsCount] = await Promise.all([
    loadUserSummaryMap([account.userId]),
    Wallet.find({ accountId }, WALLET_PROJECTION).sort({ createdAt: -1 }).limit(20).lean(),
    Wallet.countDocuments({ accountId }),
    Transaction.countDocuments({ accountId }),
    Deposit.countDocuments({ accountId }),
    Withdrawal.countDocuments({ accountId }),
  ]);

  return {
    ...normalizeAccountDocument(account),
    user: userMap.get(String(account.userId)) || null,
    metrics: {
      walletsCount,
      transactionsCount,
      depositsCount,
      withdrawalsCount,
    },
    wallets: wallets.map(normalizeWalletDocument),
  };
}

async function listWallets(query = {}) {
  const pagination = parsePagination(query);
  const sorting = resolveSort(query, ["createdAt", "updatedAt", "chain", "network", "address"], {
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const filter = buildWalletsFilter(query);
  const { items, total } = await runPaginatedQuery({
    model: Wallet,
    filter,
    projection: WALLET_PROJECTION,
    sort: sorting.sort,
    page: pagination.page,
    limit: pagination.limit,
  });

  const [userMap, accountMap, addressCounts] = await Promise.all([
    loadUserSummaryMap(items.map((item) => item.userId)),
    loadAccountSummaryMap(items.map((item) => item.accountId)),
    countGroupedByField(WalletAddress, "walletId", items.map((item) => item._id)),
  ]);

  return buildListResponse({
    items: items.map((item) => ({
      ...normalizeWalletListItem(item),
      user: userMap.get(String(item.userId)) || null,
      account: item.accountId ? accountMap.get(String(item.accountId)) || null : null,
      addressesCount: addressCounts.get(String(item._id)) || 0,
    })),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      userId: query.userId,
      accountId: query.accountId,
      chain: query.chain,
      network: query.network,
      sourceType: query.sourceType,
      isImported: query.isImported,
      hidden: query.hidden,
      archived: query.archived,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getWalletDetail(walletId) {
  const wallet = await Wallet.findById(walletId, WALLET_PROJECTION).lean();
  if (!wallet) {
    throw AppError.notFound("Wallet not found");
  }

  const [userMap, accountMap, addresses, addressesCount, transactionsCount, depositsCount, withdrawalsCount, recentTransactions] = await Promise.all([
    loadUserSummaryMap([wallet.userId]),
    loadAccountSummaryMap(wallet.accountId ? [wallet.accountId] : []),
    WalletAddress.find({ walletId })
      .sort({ addressIndex: 1, branch: 1, createdAt: 1 })
      .limit(50)
      .select("address memo derivationPath branch addressIndex addressType purpose isActive isChange status metadata createdAt updatedAt")
      .lean(),
    WalletAddress.countDocuments({ walletId }),
    Transaction.countDocuments({ walletId }),
    Deposit.countDocuments({ walletId }),
    Withdrawal.countDocuments({ walletId }),
    Transaction.find({ walletId }, TRANSACTION_LIST_PROJECTION)
      .sort({ chainTimestamp: -1, createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return {
    ...normalizeWalletDocument(wallet),
    user: userMap.get(String(wallet.userId)) || null,
    account: wallet.accountId ? accountMap.get(String(wallet.accountId)) || null : null,
    metrics: {
      addressesCount,
      transactionsCount,
      depositsCount,
      withdrawalsCount,
    },
    addresses: addresses.map((address) => ({
      id: String(address._id),
      address: address.address,
      memo: address.memo || "",
      derivationPath: address.derivationPath || "",
      branch: address.branch ?? 0,
      addressIndex: address.addressIndex ?? 0,
      addressType: address.addressType || "",
      purpose: address.purpose || "",
      isActive: Boolean(address.isActive),
      isChange: Boolean(address.isChange),
      status: address.status || "",
      metadata: address.metadata || {},
      createdAt: address.createdAt || null,
      updatedAt: address.updatedAt || null,
    })),
    recentTransactions: recentTransactions.map((transaction) => mapTransactionSummary({
      ...transaction,
      walletId: String(transaction.walletId),
      userId: String(transaction.userId),
      accountId: transaction.accountId ? String(transaction.accountId) : null,
      relatedTransactionId: transaction.relatedTransactionId ? String(transaction.relatedTransactionId) : null,
    })),
  };
}

async function listTransactions(query = {}) {
  const pagination = parsePagination(query);
  const sorting = resolveSort(query, ["createdAt", "updatedAt", "chainTimestamp", "confirmedAt", "status"], {
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const filter = buildTransactionsFilter(query);
  const { items, total } = await runPaginatedQuery({
    model: Transaction,
    filter,
    projection: TRANSACTION_LIST_PROJECTION,
    sort: sorting.sort,
    page: pagination.page,
    limit: pagination.limit,
  });

  const [userMap, accountMap, walletMap] = await Promise.all([
    loadUserSummaryMap(items.map((item) => item.userId)),
    loadAccountSummaryMap(items.map((item) => item.accountId)),
    loadWalletSummaryMap(items.map((item) => item.walletId)),
  ]);

  return buildListResponse({
    items: items.map((item) => withLinkedSummaries({
      ...mapTransactionSummary({
        ...item,
        walletId: String(item.walletId),
        userId: String(item.userId),
        accountId: item.accountId ? String(item.accountId) : null,
        relatedTransactionId: item.relatedTransactionId ? String(item.relatedTransactionId) : null,
      }),
      userId: normalizeId(item.userId),
      accountId: normalizeId(item.accountId),
      walletId: normalizeId(item.walletId),
    }, userMap, accountMap, walletMap)),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      userId: query.userId,
      accountId: query.accountId,
      walletId: query.walletId,
      chain: query.chain,
      network: query.network,
      status: query.status,
      direction: query.direction,
      transactionType: query.transactionType,
      asset: query.asset,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      chainTimestampFrom: query.chainTimestampFrom,
      chainTimestampTo: query.chainTimestampTo,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getTransactionDetail(transactionId) {
  const transaction = await Transaction.findOne(
    { _id: transactionId, visibleInSuperadmin: true },
    TRANSACTION_DETAIL_PROJECTION,
  ).lean();
  if (!transaction) {
    throw AppError.notFound("Transaction not found");
  }

  const [userMap, accountMap, walletMap, ledgerEntries] = await Promise.all([
    loadUserSummaryMap([transaction.userId]),
    loadAccountSummaryMap(transaction.accountId ? [transaction.accountId] : []),
    loadWalletSummaryMap([transaction.walletId]),
    LedgerEntry.find({ transactionId })
      .sort({ createdAt: -1 })
      .select("walletId direction amount amountBaseUnits asset category note createdAt updatedAt")
      .lean(),
  ]);

  return {
    ...withLinkedSummaries({
      ...mapTransactionDetail({
        ...transaction,
        walletId: String(transaction.walletId),
        userId: String(transaction.userId),
        accountId: transaction.accountId ? String(transaction.accountId) : null,
        relatedTransactionId: transaction.relatedTransactionId ? String(transaction.relatedTransactionId) : null,
      }),
      userId: normalizeId(transaction.userId),
      accountId: normalizeId(transaction.accountId),
      walletId: normalizeId(transaction.walletId),
    }, userMap, accountMap, walletMap),
    ledgerEntries: ledgerEntries.map((entry) => ({
      id: String(entry._id),
      walletId: normalizeId(entry.walletId),
      wallet: walletMap.get(String(entry.walletId)) || null,
      direction: entry.direction,
      amount: entry.amount,
      amountBaseUnits: entry.amountBaseUnits,
      asset: entry.asset || "",
      category: entry.category,
      note: entry.note || "",
      createdAt: entry.createdAt || null,
      updatedAt: entry.updatedAt || null,
    })),
  };
}

async function listDeposits(query = {}) {
  const pagination = parsePagination(query);
  const sorting = resolveSort(query, ["createdAt", "updatedAt", "confirmations", "status"], {
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const filter = buildDepositsFilter(query);
  const { items, total } = await runPaginatedQuery({
    model: Deposit,
    filter,
    projection: DEPOSIT_PROJECTION,
    sort: sorting.sort,
    page: pagination.page,
    limit: pagination.limit,
  });

  const [userMap, accountMap, walletMap] = await Promise.all([
    loadUserSummaryMap(items.map((item) => item.userId)),
    loadAccountSummaryMap(items.map((item) => item.accountId)),
    loadWalletSummaryMap(items.map((item) => item.walletId)),
  ]);

  return buildListResponse({
    items: items.map((item) => withLinkedSummaries(
      normalizeDepositDocument(item),
      userMap,
      accountMap,
      walletMap,
    )),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      userId: query.userId,
      accountId: query.accountId,
      walletId: query.walletId,
      chain: query.chain,
      asset: query.asset,
      status: query.status,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getDepositDetail(depositId) {
  const deposit = await Deposit.findById(depositId, DEPOSIT_PROJECTION).lean();
  if (!deposit) {
    throw AppError.notFound("Deposit not found");
  }

  const [userMap, accountMap, walletMap] = await Promise.all([
    loadUserSummaryMap([deposit.userId]),
    loadAccountSummaryMap(deposit.accountId ? [deposit.accountId] : []),
    loadWalletSummaryMap([deposit.walletId]),
  ]);

  return withLinkedSummaries(normalizeDepositDocument(deposit), userMap, accountMap, walletMap);
}

async function listWithdrawals(query = {}) {
  const pagination = parsePagination(query);
  const sorting = resolveSort(query, ["createdAt", "updatedAt", "status"], {
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const filter = buildWithdrawalsFilter(query);
  const { items, total } = await runPaginatedQuery({
    model: Withdrawal,
    filter,
    projection: WITHDRAWAL_PROJECTION,
    sort: sorting.sort,
    page: pagination.page,
    limit: pagination.limit,
  });

  const [userMap, accountMap, walletMap] = await Promise.all([
    loadUserSummaryMap(items.map((item) => item.userId)),
    loadAccountSummaryMap(items.map((item) => item.accountId)),
    loadWalletSummaryMap(items.map((item) => item.walletId)),
  ]);

  return buildListResponse({
    items: items.map((item) => withLinkedSummaries(
      normalizeWithdrawalDocument(item),
      userMap,
      accountMap,
      walletMap,
    )),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      userId: query.userId,
      accountId: query.accountId,
      walletId: query.walletId,
      chain: query.chain,
      asset: query.asset,
      status: query.status,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getWithdrawalDetail(withdrawalId) {
  const withdrawal = await Withdrawal.findById(withdrawalId, WITHDRAWAL_PROJECTION).lean();
  if (!withdrawal) {
    throw AppError.notFound("Withdrawal not found");
  }

  const [userMap, accountMap, walletMap] = await Promise.all([
    loadUserSummaryMap([withdrawal.userId]),
    loadAccountSummaryMap(withdrawal.accountId ? [withdrawal.accountId] : []),
    loadWalletSummaryMap([withdrawal.walletId]),
  ]);

  return withLinkedSummaries(normalizeWithdrawalDocument(withdrawal), userMap, accountMap, walletMap);
}

async function listSessions(query = {}) {
  const pagination = parsePagination(query);
  const sorting = buildSessionSort(query);
  const sortStage = { $sort: sorting.sort };
  const facetStage = {
    $facet: {
      items: [
        { $skip: pagination.skip },
        { $limit: pagination.limit },
      ],
      total: [
        { $count: "count" },
      ],
    },
  };
  const sessionScope = normalizeLowerString(query.scope) || SESSION_SCOPE_ALL;

  const userProjection = {
    $project: {
      _id: 0,
      sessionId: "$tokenId",
      scope: { $literal: SESSION_SCOPE_USER },
      actorId: "$userId",
      status: 1,
      deviceId: 1,
      deviceLabel: 1,
      platform: 1,
      appVersion: 1,
      biometricCapable: 1,
      ipAddress: 1,
      userAgent: 1,
      lastUsedAt: 1,
      expiresAt: 1,
      revokedAt: 1,
      revokedReason: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  };

  const superadminProjection = {
    $project: {
      _id: 0,
      sessionId: "$tokenId",
      scope: { $literal: SESSION_SCOPE_SUPERADMIN },
      actorId: "$superadminId",
      status: 1,
      deviceId: 1,
      deviceLabel: 1,
      platform: 1,
      appVersion: 1,
      biometricCapable: 1,
      ipAddress: 1,
      userAgent: 1,
      lastUsedAt: 1,
      expiresAt: 1,
      revokedAt: 1,
      revokedReason: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  };

  const userMatch = buildSessionMatch(query, "userId");
  const superadminMatch = buildSessionMatch(query, "superadminId");

  if (sessionScope === SESSION_SCOPE_ALL && query.userId && !query.superadminId) {
    superadminMatch._id = { $exists: false };
  }

  if (sessionScope === SESSION_SCOPE_ALL && query.superadminId && !query.userId) {
    userMatch._id = { $exists: false };
  }

  let aggregateResult;

  if (sessionScope === SESSION_SCOPE_USER) {
    aggregateResult = await UserSession.aggregate([
      { $match: userMatch },
      userProjection,
      sortStage,
      facetStage,
    ]);
  } else if (sessionScope === SESSION_SCOPE_SUPERADMIN) {
    aggregateResult = await SuperadminSession.aggregate([
      { $match: superadminMatch },
      superadminProjection,
      sortStage,
      facetStage,
    ]);
  } else {
    aggregateResult = await UserSession.aggregate([
      { $match: userMatch },
      userProjection,
      {
        $unionWith: {
          coll: SuperadminSession.collection.name,
          pipeline: [
            { $match: superadminMatch },
            superadminProjection,
          ],
        },
      },
      sortStage,
      facetStage,
    ]);
  }

  const aggregatePayload = aggregateResult[0] || { items: [], total: [] };
  const rawItems = aggregatePayload.items || [];
  const total = aggregatePayload.total?.[0]?.count || 0;

  const [userMap, superadminMap] = await Promise.all([
    loadUserSummaryMap(rawItems.filter((item) => item.scope === SESSION_SCOPE_USER).map((item) => item.actorId)),
    loadSuperadminSummaryMap(rawItems.filter((item) => item.scope === SESSION_SCOPE_SUPERADMIN).map((item) => item.actorId)),
  ]);

  return buildListResponse({
    items: rawItems.map((item) => buildSessionListItem(item, userMap, superadminMap)),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      scope: sessionScope,
      userId: query.userId,
      superadminId: query.superadminId,
      status: query.status,
      platform: query.platform,
      deviceId: query.deviceId,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      lastUsedFrom: query.lastUsedFrom,
      lastUsedTo: query.lastUsedTo,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getSessionDetail(sessionId, scope = "") {
  const normalizedScope = normalizeLowerString(scope);
  let session = null;
  let resolvedScope = SESSION_SCOPE_USER;

  if (normalizedScope === SESSION_SCOPE_USER) {
    session = await UserSession.findOne({ tokenId: sessionId }).lean();
    resolvedScope = SESSION_SCOPE_USER;
  } else if (normalizedScope === SESSION_SCOPE_SUPERADMIN) {
    session = await SuperadminSession.findOne({ tokenId: sessionId }).lean();
    resolvedScope = SESSION_SCOPE_SUPERADMIN;
  } else {
    session = await UserSession.findOne({ tokenId: sessionId }).lean();
    resolvedScope = SESSION_SCOPE_USER;

    if (!session) {
      session = await SuperadminSession.findOne({ tokenId: sessionId }).lean();
      resolvedScope = SESSION_SCOPE_SUPERADMIN;
    }
  }

  if (!session) {
    throw AppError.notFound("Session not found");
  }

  const [userMap, superadminMap] = await Promise.all([
    resolvedScope === SESSION_SCOPE_USER ? loadUserSummaryMap([session.userId]) : Promise.resolve(new Map()),
    resolvedScope === SESSION_SCOPE_SUPERADMIN ? loadSuperadminSummaryMap([session.superadminId]) : Promise.resolve(new Map()),
  ]);

  return buildSessionListItem({
    sessionId: session.tokenId,
    scope: resolvedScope,
    actorId: resolvedScope === SESSION_SCOPE_USER ? session.userId : session.superadminId,
    status: session.status,
    deviceId: session.deviceId,
    deviceLabel: session.deviceLabel,
    platform: session.platform,
    appVersion: session.appVersion,
    biometricCapable: session.biometricCapable,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    revokedReason: session.revokedReason,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }, userMap, superadminMap);
}

async function listAuditEvents(query = {}) {
  const pagination = parsePagination(query);
  const sorting = resolveSort(query, ["createdAt", "updatedAt", "action", "resource", "status"], {
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const filter = buildAuditFilter(query);
  const { items, total } = await runPaginatedQuery({
    model: SecurityAudit,
    filter,
    projection: AUDIT_LIST_PROJECTION,
    sort: sorting.sort,
    page: pagination.page,
    limit: pagination.limit,
  });

  const userMap = await loadUserSummaryMap(items.map((item) => item.userId));

  return buildListResponse({
    items: items.map((item) => ({
      ...normalizeAuditDocument(item),
      user: item.userId ? userMap.get(String(item.userId)) || null : null,
    })),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      userId: query.userId,
      action: query.action,
      resource: query.resource,
      status: query.status,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getAuditEventDetail(auditId) {
  const audit = await SecurityAudit.findById(auditId, AUDIT_DETAIL_PROJECTION).lean();
  if (!audit) {
    throw AppError.notFound("Audit event not found");
  }

  const userMap = await loadUserSummaryMap(audit.userId ? [audit.userId] : []);

  return {
    ...normalizeAuditDocument(audit),
    user: audit.userId ? userMap.get(String(audit.userId)) || null : null,
    metadata: audit.metadata || {},
  };
}

async function listTreasuryWallets(query = {}) {
  const pagination = parsePagination(query);
  const sorting = resolveSort(query, ["chain", "asset", "walletType", "status", "createdAt"], {
    sortBy: "chain",
    sortOrder: "asc",
  });
  const filter = buildTreasuryFilter(query);
  const { items, total } = await runPaginatedQuery({
    model: TreasuryWallet,
    filter,
    projection: TREASURY_PROJECTION,
    sort: sorting.sort,
    page: pagination.page,
    limit: pagination.limit,
  });

  return buildListResponse({
    items: items.map(normalizeTreasuryDocument),
    page: pagination.page,
    limit: pagination.limit,
    total,
    appliedFilters: buildAppliedFilters({
      chain: query.chain,
      asset: query.asset,
      walletType: query.walletType,
      status: query.status,
      search: query.search,
    }),
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
  });
}

async function getTreasuryWalletDetail(treasuryId) {
  const treasuryWallet = await TreasuryWallet.findById(treasuryId, TREASURY_PROJECTION).lean();
  if (!treasuryWallet) {
    throw AppError.notFound("Treasury wallet not found");
  }

  const [depositsCount, withdrawalsCount] = await Promise.all([
    Deposit.countDocuments({
      chain: treasuryWallet.chain,
      asset: treasuryWallet.asset,
      address: treasuryWallet.address,
    }),
    Withdrawal.countDocuments({
      chain: treasuryWallet.chain,
      asset: treasuryWallet.asset,
      destinationAddress: treasuryWallet.address,
    }),
  ]);

  return {
    ...normalizeTreasuryDocument(treasuryWallet),
    metrics: {
      inboundDepositsCount: depositsCount,
      outboundWithdrawalsCount: withdrawalsCount,
    },
  };
}

async function listChains(query = {}) {
  const items = buildChainItems()
    .filter((item) => {
      const family = normalizeLowerString(query.family);
      const status = normalizeLowerString(query.status);
      const enabled = normalizeBoolean(query.enabled);
      const search = normalizeLowerString(query.search);

      if (family && item.family !== family) {
        return false;
      }

      if (status && item.runtimeStatus !== status) {
        return false;
      }

      if (enabled !== null && item.enabled !== enabled) {
        return false;
      }

      if (search) {
        const haystack = `${item.code} ${item.label} ${item.family}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    })
    .map((item) => ({
      id: item.id,
      code: item.code,
      label: item.label,
      family: item.family,
      nativeAssetSymbol: item.nativeAssetSymbol,
      defaultNetwork: item.defaultNetwork,
      enabled: item.enabled,
      runtimeStatus: item.runtimeStatus,
      runtimeStatusReason: item.runtimeStatusReason,
      maintenance: item.maintenance,
      supportedNetworkCount: item.supportedNetworkCount,
      tokenCount: item.tokenCount,
      assetCount: item.assetCount,
      updatedAt: item.updatedAt,
    }));

  const paginated = paginateItems(items, query, ["code", "label", "family", "runtimeStatus"], {
    sortBy: "label",
    sortOrder: "asc",
  });

  return buildListResponse({
    items: paginated.items,
    page: paginated.page,
    limit: paginated.limit,
    total: paginated.total,
    appliedFilters: buildAppliedFilters({
      family: query.family,
      status: query.status,
      enabled: query.enabled,
      search: query.search,
    }),
    sortBy: paginated.sortBy,
    sortOrder: paginated.sortOrder,
  });
}

async function getChainDetail(chainId) {
  const normalizedChainId = normalizeLowerString(chainId);
  const chainItem = buildChainItems().find((item) => item.code === normalizedChainId);

  if (!chainItem) {
    throw AppError.notFound("Chain not found");
  }

  const configured = getConfiguredChainConfig(normalizedChainId);
  const runtime = getChainConfig(normalizedChainId);
  const implemented = chainItem._detail.implemented;

  return {
    id: chainItem.id,
    code: chainItem.code,
    label: chainItem.label,
    family: chainItem.family,
    nativeAssetSymbol: chainItem.nativeAssetSymbol,
    defaultNetwork: chainItem.defaultNetwork,
    enabled: chainItem.enabled,
    runtimeStatus: chainItem.runtimeStatus,
    runtimeStatusReason: chainItem.runtimeStatusReason,
    maintenance: chainItem.maintenance,
    configuredNetworks: Array.isArray(configured?.supportedNetworks) ? configured.supportedNetworks : [],
    runtimeNetworks: Array.isArray(runtime?.supportedNetworks) ? runtime.supportedNetworks : [],
    features: runtime?.features || configured?.features || {},
    toggles: runtime?.toggles || configured?.toggles || {},
    explorer: configured?.explorer || null,
    provisioning: runtime?.provisioning || configured?.provisioning || null,
    addressExtras: configured?.addressExtras || null,
    decimals: configured?.decimals ?? null,
    baseUnitName: configured?.baseUnitName || "",
    environmentRequirements: Array.isArray(configured?.env?.vars)
      ? configured.env.vars.map((entry) => ({
          name: entry.name,
          description: entry.description,
          networks: entry.networks || [],
          optional: Boolean(entry.optional),
        }))
      : [],
    assets: implemented?.assets || [],
    tokens: implemented?.tokens || [],
  };
}

async function listJobs(query = {}) {
  const items = buildJobItems().filter((item) => {
    const status = normalizeLowerString(query.status);
    const enabled = normalizeBoolean(query.enabled);
    const search = normalizeLowerString(query.search);

    if (status && item.status !== status) {
      return false;
    }

    if (enabled !== null && item.enabled !== enabled) {
      return false;
    }

    if (search) {
      const haystack = `${item.jobName} ${item.status}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }

    return true;
  });

  const paginated = paginateItems(items, query, ["jobName", "status", "intervalMs"], {
    sortBy: "jobName",
    sortOrder: "asc",
  });

  return buildListResponse({
    items: paginated.items,
    page: paginated.page,
    limit: paginated.limit,
    total: paginated.total,
    appliedFilters: buildAppliedFilters({
      status: query.status,
      enabled: query.enabled,
      search: query.search,
    }),
    sortBy: paginated.sortBy,
    sortOrder: paginated.sortOrder,
  });
}

async function getJobDetail(jobName) {
  const targetJob = normalizeString(jobName);
  const job = buildJobItems().find((item) => item.jobName === targetJob);

  if (!job) {
    throw AppError.notFound("Job not found");
  }

  return {
    ...job,
    config: JOB_CONFIG[targetJob] || null,
    runtime: scheduler.getStatus()[targetJob] || null,
    health: getHealthPayload().jobs,
  };
}

async function getSettingsSummary() {
  return {
    app: {
      name: appConfig.appName,
      environment: appConfig.nodeEnv,
      apiPrefix: appConfig.apiPrefix,
      bodyLimit: appConfig.bodyLimit,
      requestLoggingEnabled: appConfig.requestLoggingEnabled,
    },
    queue: {
      enabled: queueConfig.enabled,
      runtime: getHealthPayload().jobs,
    },
    superadminAuth: {
      roles: securityConfig.superadminRoles,
      accessTokenExpiresIn: securityConfig.superadminAccessTokenExpiresIn,
      refreshTokenTtlMs: securityConfig.superadminRefreshTokenTtlMs,
      rateLimitWindowMs: securityConfig.superadminAuthRateLimitWindowMs,
      rateLimitMaxRequests: securityConfig.superadminAuthRateLimitMaxRequests,
    },
    walletAuth: {
      accessTokenExpiresIn: securityConfig.accessTokenExpiresIn,
      refreshTokenTtlMs: securityConfig.refreshTokenTtlMs,
      rateLimitWindowMs: securityConfig.authRateLimitWindowMs,
      rateLimitMaxRequests: securityConfig.authRateLimitMaxRequests,
    },
    policies: policyService.getPolicies(),
    runtime: getHealthPayload(),
  };
}

module.exports = {
  getAccountDetail,
  getAuditEventDetail,
  getChainDetail,
  getDepositDetail,
  getJobDetail,
  getOverviewMetrics,
  getSessionDetail,
  getSettingsSummary,
  getTransactionDetail,
  getTreasuryWalletDetail,
  getUserDetail,
  getWalletDetail,
  getWithdrawalDetail,
  listAccounts,
  listAuditEvents,
  listChains,
  listDeposits,
  listJobs,
  listSessions,
  listTransactions,
  listTreasuryWallets,
  listUsers,
  listWallets,
  listWithdrawals,
};
