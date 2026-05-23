import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "react-router";
import { DEFAULT_LIMIT, TRANSACTION_STATUSES as STATUS_OPTIONS } from "../config/constants";
import {
  DEFAULT_TRANSACTION_SORT,
  TRANSACTION_SORT_FIELDS,
} from "../utils/transactionsList";

const DEFAULT_PAGE = 1;
const DEFAULT_SORT_BY = DEFAULT_TRANSACTION_SORT.sortBy;
const DEFAULT_SORT_ORDER = DEFAULT_TRANSACTION_SORT.sortOrder;
const SORT_FIELDS = new Set(TRANSACTION_SORT_FIELDS);
const SORT_ORDERS = new Set(["asc", "desc"]);
const PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100]);
function normalizePositiveInt(value, fallback) {
  const normalized = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeDateValue(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLowerString(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeUpperString(value) {
  return normalizeString(value).toUpperCase();
}

function normalizeMongoId(value) {
  const normalized = normalizeString(value);
  return /^[a-fA-F0-9]{24}$/.test(normalized) ? normalized : "";
}

function normalizeLowerEnum(value, allowed = []) {
  const normalized = normalizeString(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : "";
}

function normalizeSortBy(value) {
  const normalized = normalizeString(value);
  return SORT_FIELDS.has(normalized) ? normalized : DEFAULT_SORT_BY;
}

function normalizeSortOrder(value) {
  const normalized = normalizeString(value).toLowerCase();
  return SORT_ORDERS.has(normalized) ? normalized : DEFAULT_SORT_ORDER;
}

function parseQuery(searchParams) {
  const limit = normalizePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);

  return {
    page: normalizePositiveInt(searchParams.get("page"), DEFAULT_PAGE),
    limit: PAGE_SIZE_OPTIONS.includes(limit) ? limit : DEFAULT_LIMIT,
    search: normalizeString(searchParams.get("search")),
    userId: normalizeMongoId(searchParams.get("userId")),
    accountId: normalizeMongoId(searchParams.get("accountId")),
    walletId: normalizeMongoId(searchParams.get("walletId")),
    chain: normalizeLowerString(searchParams.get("chain")),
    network: normalizeLowerString(searchParams.get("network")),
    asset: normalizeUpperString(searchParams.get("asset")),
    status: normalizeLowerEnum(searchParams.get("status"), STATUS_OPTIONS),
    direction: normalizeLowerEnum(searchParams.get("direction"), ["incoming", "outgoing"]),
    transactionType: normalizeLowerEnum(searchParams.get("transactionType"), ["internal", "external"]),
    createdFrom: normalizeDateValue(searchParams.get("createdFrom")),
    createdTo: normalizeDateValue(searchParams.get("createdTo")),
    chainTimestampFrom: normalizeDateValue(searchParams.get("chainTimestampFrom")),
    chainTimestampTo: normalizeDateValue(searchParams.get("chainTimestampTo")),
    sortBy: normalizeSortBy(searchParams.get("sortBy")),
    sortOrder: normalizeSortOrder(searchParams.get("sortOrder")),
    selected: normalizeString(searchParams.get("selected")),
  };
}

function countActiveFilters(query) {
  return [
    query.search,
    query.userId,
    query.accountId,
    query.walletId,
    query.chain,
    query.network,
    query.asset,
    query.status,
    query.direction,
    query.transactionType,
    query.createdFrom,
    query.createdTo,
    query.chainTimestampFrom,
    query.chainTimestampTo,
  ].filter(Boolean).length;
}

export function useSuperadminTransactionsQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [userIdDraft, setUserIdDraft] = useState(query.userId);
  const [accountIdDraft, setAccountIdDraft] = useState(query.accountId);
  const [walletIdDraft, setWalletIdDraft] = useState(query.walletId);
  const deferredSearchDraft = useDeferredValue(searchDraft);

  useEffect(() => {
    setSearchDraft(query.search);
  }, [query.search]);

  useEffect(() => {
    setUserIdDraft(query.userId);
  }, [query.userId]);

  useEffect(() => {
    setAccountIdDraft(query.accountId);
  }, [query.accountId]);

  useEffect(() => {
    setWalletIdDraft(query.walletId);
  }, [query.walletId]);

  function updateParams(updates = {}, { replace = true, resetPage = false } = {}) {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
          nextParams.delete(key);
          return;
        }

        nextParams.set(key, String(value));
      });

      if (resetPage) {
        nextParams.set("page", "1");
      }

      const nextPage = normalizePositiveInt(nextParams.get("page"), DEFAULT_PAGE);
      if (nextPage === DEFAULT_PAGE) {
        nextParams.delete("page");
      }

      const nextLimit = normalizePositiveInt(nextParams.get("limit"), DEFAULT_LIMIT);
      if (nextLimit === DEFAULT_LIMIT) {
        nextParams.delete("limit");
      }

      if (normalizeSortBy(nextParams.get("sortBy")) === DEFAULT_SORT_BY) {
        nextParams.delete("sortBy");
      }

      if (normalizeSortOrder(nextParams.get("sortOrder")) === DEFAULT_SORT_ORDER) {
        nextParams.delete("sortOrder");
      }

      setSearchParams(nextParams, { replace });
    });
  }

  useEffect(() => {
    const normalizedDraft = normalizeString(deferredSearchDraft);
    if (normalizedDraft === query.search) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateParams({ search: normalizedDraft }, { resetPage: true });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deferredSearchDraft, query.search]);

  return {
    query,
    searchDraft,
    setSearchDraft,
    userIdDraft,
    setUserIdDraft,
    accountIdDraft,
    setAccountIdDraft,
    walletIdDraft,
    setWalletIdDraft,
    isPending,
    activeFilterCount: countActiveFilters(query),
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    updateParams,
    setPage: (page) => updateParams({ page }, { replace: true }),
    setLimit: (limit) => updateParams({ limit }, { replace: true, resetPage: true }),
    setChain: (chain) => updateParams({ chain }, { replace: true, resetPage: true }),
    setNetwork: (network) => updateParams({ network }, { replace: true, resetPage: true }),
    setAsset: (asset) => updateParams({ asset }, { replace: true, resetPage: true }),
    setStatus: (status) => updateParams({ status }, { replace: true, resetPage: true }),
    setDirection: (direction) => updateParams({ direction }, { replace: true, resetPage: true }),
    setTransactionType: (transactionType) =>
      updateParams({ transactionType }, { replace: true, resetPage: true }),
    setCreatedFrom: (createdFrom) => updateParams({ createdFrom }, { replace: true, resetPage: true }),
    setCreatedTo: (createdTo) => updateParams({ createdTo }, { replace: true, resetPage: true }),
    setChainTimestampFrom: (chainTimestampFrom) =>
      updateParams({ chainTimestampFrom }, { replace: true, resetPage: true }),
    setChainTimestampTo: (chainTimestampTo) =>
      updateParams({ chainTimestampTo }, { replace: true, resetPage: true }),
    setSort: ({ sortBy, sortOrder }) =>
      updateParams({ sortBy, sortOrder }, { replace: true, resetPage: true }),
    applyUserIdFilter: () =>
      updateParams({ userId: normalizeMongoId(userIdDraft) }, { replace: true, resetPage: true }),
    clearUserIdFilter: () => {
      setUserIdDraft("");
      updateParams({ userId: "" }, { replace: true, resetPage: true });
    },
    applyAccountIdFilter: () =>
      updateParams({ accountId: normalizeMongoId(accountIdDraft) }, { replace: true, resetPage: true }),
    clearAccountIdFilter: () => {
      setAccountIdDraft("");
      updateParams({ accountId: "" }, { replace: true, resetPage: true });
    },
    applyWalletIdFilter: () =>
      updateParams({ walletId: normalizeMongoId(walletIdDraft) }, { replace: true, resetPage: true }),
    clearWalletIdFilter: () => {
      setWalletIdDraft("");
      updateParams({ walletId: "" }, { replace: true, resetPage: true });
    },
    openTransaction: (transactionId) => updateParams({ selected: transactionId }, { replace: true }),
    closeTransaction: () => updateParams({ selected: "" }, { replace: true }),
    clearFilters: () =>
      updateParams(
        {
          search: "",
          userId: "",
          accountId: "",
          walletId: "",
          chain: "",
          network: "",
          asset: "",
          status: "",
          direction: "",
          transactionType: "",
          createdFrom: "",
          createdTo: "",
          chainTimestampFrom: "",
          chainTimestampTo: "",
          page: "",
          selected: "",
        },
        { replace: true },
      ),
  };
}
