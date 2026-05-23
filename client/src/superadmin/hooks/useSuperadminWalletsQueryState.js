import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "react-router";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const DEFAULT_SORT_BY = "createdAt";
const DEFAULT_SORT_ORDER = "desc";
const SORT_FIELDS = new Set(["createdAt", "updatedAt", "chain", "network", "address"]);
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

function normalizeMongoId(value) {
  const normalized = normalizeString(value);
  return /^[a-fA-F0-9]{24}$/.test(normalized) ? normalized : "";
}

function normalizeLowerEnum(value, allowed = []) {
  const normalized = normalizeString(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : "";
}

function normalizeBooleanString(value) {
  const normalized = normalizeString(value).toLowerCase();
  return normalized === "true" || normalized === "false" ? normalized : "";
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
    chain: normalizeLowerString(searchParams.get("chain")),
    network: normalizeLowerString(searchParams.get("network")),
    sourceType: normalizeLowerEnum(searchParams.get("sourceType"), ["created", "imported"]),
    hidden: normalizeBooleanString(searchParams.get("hidden")),
    archived: normalizeBooleanString(searchParams.get("archived")),
    createdFrom: normalizeDateValue(searchParams.get("createdFrom")),
    createdTo: normalizeDateValue(searchParams.get("createdTo")),
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
    query.chain,
    query.network,
    query.sourceType,
    query.hidden,
    query.archived,
    query.createdFrom,
    query.createdTo,
  ].filter(Boolean).length;
}

export function useSuperadminWalletsQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [userIdDraft, setUserIdDraft] = useState(query.userId);
  const [accountIdDraft, setAccountIdDraft] = useState(query.accountId);
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
    isPending,
    activeFilterCount: countActiveFilters(query),
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    updateParams,
    setPage: (page) => updateParams({ page }, { replace: true }),
    setLimit: (limit) => updateParams({ limit }, { replace: true, resetPage: true }),
    setChain: (chain) => updateParams({ chain }, { replace: true, resetPage: true }),
    setNetwork: (network) => updateParams({ network }, { replace: true, resetPage: true }),
    setSourceType: (sourceType) => updateParams({ sourceType }, { replace: true, resetPage: true }),
    setHidden: (hidden) => updateParams({ hidden }, { replace: true, resetPage: true }),
    setArchived: (archived) => updateParams({ archived }, { replace: true, resetPage: true }),
    setCreatedFrom: (createdFrom) => updateParams({ createdFrom }, { replace: true, resetPage: true }),
    setCreatedTo: (createdTo) => updateParams({ createdTo }, { replace: true, resetPage: true }),
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
    openWallet: (walletId) => updateParams({ selected: walletId }, { replace: true }),
    closeWallet: () => updateParams({ selected: "" }, { replace: true }),
    clearFilters: () =>
      updateParams(
        {
          search: "",
          userId: "",
          accountId: "",
          chain: "",
          network: "",
          sourceType: "",
          hidden: "",
          archived: "",
          createdFrom: "",
          createdTo: "",
          page: "",
          selected: "",
        },
        { replace: true },
      ),
  };
}
