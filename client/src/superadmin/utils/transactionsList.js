import { MAX_REALTIME_ITEMS } from "../config/constants";

export const DEFAULT_TRANSACTION_SORT = Object.freeze({
  sortBy: "createdAt",
  sortOrder: "desc",
});

export const TRANSACTION_SORT_FIELDS = Object.freeze([
  "createdAt",
  "updatedAt",
  "chainTimestamp",
  "confirmedAt",
  "status",
]);

const REALTIME_FILTER_KEYS = Object.freeze([
  "search",
  "userId",
  "accountId",
  "walletId",
  "chain",
  "network",
  "asset",
  "status",
  "direction",
  "transactionType",
  "createdFrom",
  "createdTo",
  "chainTimestampFrom",
  "chainTimestampTo",
]);

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeSortBy(sortBy) {
  return TRANSACTION_SORT_FIELDS.includes(sortBy) ? sortBy : DEFAULT_TRANSACTION_SORT.sortBy;
}

function normalizeSortOrder(sortOrder) {
  return String(sortOrder || "").toLowerCase() === "asc" ? "asc" : DEFAULT_TRANSACTION_SORT.sortOrder;
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function getTransactionIdentityKeys(transaction = {}) {
  const keys = [
    ["id", transaction.id],
    ["id", transaction._id],
    ["id", transaction.transactionId],
    ["txHash", transaction.txHash],
  ];

  return Array.from(
    new Set(
      keys
        .map(([prefix, value]) => {
          const normalized = normalizeString(value);
          return normalized ? `${prefix}:${normalized}` : "";
        })
        .filter(Boolean),
    ),
  );
}

function isSameTransaction(left = {}, right = {}) {
  const leftKeys = getTransactionIdentityKeys(left);
  const rightKeys = new Set(getTransactionIdentityKeys(right));

  return leftKeys.some((key) => rightKeys.has(key));
}

function getTimestampSortValue(transaction = {}, sortBy) {
  switch (sortBy) {
    case "updatedAt":
      return (
        toTimestamp(transaction.updatedAt) ??
        toTimestamp(transaction.chainTimestamp) ??
        toTimestamp(transaction.confirmedAt) ??
        toTimestamp(transaction.createdAt) ??
        0
      );
    case "chainTimestamp":
      return (
        toTimestamp(transaction.chainTimestamp) ??
        toTimestamp(transaction.confirmedAt) ??
        toTimestamp(transaction.createdAt) ??
        0
      );
    case "confirmedAt":
      return (
        toTimestamp(transaction.confirmedAt) ??
        toTimestamp(transaction.chainTimestamp) ??
        toTimestamp(transaction.createdAt) ??
        0
      );
    case "createdAt":
    default:
      return toTimestamp(transaction.createdAt) ?? 0;
  }
}

function compareText(leftValue, rightValue, sortOrder) {
  const comparison = normalizeString(leftValue).localeCompare(normalizeString(rightValue));
  return sortOrder === "asc" ? comparison : comparison * -1;
}

function compareTimestamps(leftValue, rightValue, sortOrder) {
  if (leftValue === rightValue) {
    return 0;
  }

  return sortOrder === "asc" ? leftValue - rightValue : rightValue - leftValue;
}

function compareTransactions(left = {}, right = {}, sort = DEFAULT_TRANSACTION_SORT) {
  const normalizedSort = normalizeTransactionSort(sort);

  if (normalizedSort.sortBy === "status") {
    const statusComparison = compareText(left.status, right.status, normalizedSort.sortOrder);
    if (statusComparison !== 0) {
      return statusComparison;
    }
  } else {
    const timestampComparison = compareTimestamps(
      getTimestampSortValue(left, normalizedSort.sortBy),
      getTimestampSortValue(right, normalizedSort.sortBy),
      normalizedSort.sortOrder,
    );

    if (timestampComparison !== 0) {
      return timestampComparison;
    }
  }

  const createdAtComparison = compareTimestamps(
    getTimestampSortValue(left, "createdAt"),
    getTimestampSortValue(right, "createdAt"),
    "desc",
  );
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return compareText(left.id || left._id || left.transactionId, right.id || right._id || right.transactionId, "desc");
}

function mergeLinkedSummary(existingValue, incomingValue) {
  if (incomingValue == null) {
    return existingValue ?? null;
  }

  if (existingValue == null) {
    return incomingValue;
  }

  return {
    ...existingValue,
    ...incomingValue,
  };
}

function trimTransactionItems(items = [], limit) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : MAX_REALTIME_ITEMS;
  return items.slice(0, Math.min(normalizedLimit, MAX_REALTIME_ITEMS));
}

export function normalizeTransactionSort(sort = {}) {
  return {
    sortBy: normalizeSortBy(sort.sortBy),
    sortOrder: normalizeSortOrder(sort.sortOrder),
  };
}

export function isDefaultTransactionSort(sort = {}) {
  const normalizedSort = normalizeTransactionSort(sort);
  return (
    normalizedSort.sortBy === DEFAULT_TRANSACTION_SORT.sortBy &&
    normalizedSort.sortOrder === DEFAULT_TRANSACTION_SORT.sortOrder
  );
}

export function sortTransactionItems(items = [], sort = DEFAULT_TRANSACTION_SORT) {
  return [...items].sort((left, right) => compareTransactions(left, right, sort));
}

export function shouldApplyRealtimeTransactions(query = {}) {
  const page = Number.parseInt(String(query.page || "1"), 10);
  const hasFilters = REALTIME_FILTER_KEYS.some((key) => Boolean(normalizeString(query[key])));

  return page <= 1 && !hasFilters && isDefaultTransactionSort(query);
}

export function isVisibleInSuperadminTransaction(transaction = {}) {
  return transaction?.visibleInSuperadmin === true;
}

export function upsertTransactionItems(
  items = [],
  incomingTransaction,
  {
    sort = DEFAULT_TRANSACTION_SORT,
    limit = MAX_REALTIME_ITEMS,
    insertIfMissing = true,
  } = {},
) {
  if (!incomingTransaction || typeof incomingTransaction !== "object") {
    return {
      items,
      changed: false,
      inserted: false,
      updated: false,
    };
  }

  const existingIndex = items.findIndex((item) => isSameTransaction(item, incomingTransaction));
  const nextItems = [...items];

  if (existingIndex === -1) {
    if (!insertIfMissing) {
      return {
        items,
        changed: false,
        inserted: false,
        updated: false,
      };
    }

    nextItems.push(incomingTransaction);
  } else {
    const existingItem = nextItems[existingIndex];
    nextItems[existingIndex] = {
      ...existingItem,
      ...incomingTransaction,
      user: mergeLinkedSummary(existingItem?.user, incomingTransaction.user),
      account: mergeLinkedSummary(existingItem?.account, incomingTransaction.account),
      wallet: mergeLinkedSummary(existingItem?.wallet, incomingTransaction.wallet),
    };
  }

  const dedupedItems = [];
  for (const item of nextItems) {
    if (!dedupedItems.some((candidate) => isSameTransaction(candidate, item))) {
      dedupedItems.push(item);
    }
  }

  const sortedItems = trimTransactionItems(sortTransactionItems(dedupedItems, sort), limit);

  return {
    items: sortedItems,
    changed: true,
    inserted: existingIndex === -1,
    updated: existingIndex !== -1,
  };
}
