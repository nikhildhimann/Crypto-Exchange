import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "react-router";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const DEFAULT_SORT_BY = "createdAt";
const DEFAULT_SORT_ORDER = "desc";
const SORT_FIELDS = new Set(["createdAt", "updatedAt", "status", "type"]);
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

function normalizeMongoId(value) {
  const normalized = normalizeString(value);
  return /^[a-fA-F0-9]{24}$/.test(normalized) ? normalized : "";
}

function normalizeStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ["active", "archived"].includes(normalized) ? normalized : "";
}

function normalizeType(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ["personal", "business", "trading", "custom"].includes(normalized) ? normalized : "";
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
    status: normalizeStatus(searchParams.get("status")),
    type: normalizeType(searchParams.get("type")),
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
    query.status,
    query.type,
    query.createdFrom,
    query.createdTo,
  ].filter(Boolean).length;
}

export function useSuperadminAccountsQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [userIdDraft, setUserIdDraft] = useState(query.userId);
  const deferredSearchDraft = useDeferredValue(searchDraft);

  useEffect(() => {
    setSearchDraft(query.search);
  }, [query.search]);

  useEffect(() => {
    setUserIdDraft(query.userId);
  }, [query.userId]);

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
    isPending,
    activeFilterCount: countActiveFilters(query),
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    updateParams,
    setPage: (page) => updateParams({ page }, { replace: true }),
    setLimit: (limit) => updateParams({ limit }, { replace: true, resetPage: true }),
    setStatus: (status) => updateParams({ status }, { replace: true, resetPage: true }),
    setType: (type) => updateParams({ type }, { replace: true, resetPage: true }),
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
    openAccount: (accountId) => updateParams({ selected: accountId }, { replace: true }),
    closeAccount: () => updateParams({ selected: "" }, { replace: true }),
    clearFilters: () =>
      updateParams(
        {
          search: "",
          userId: "",
          status: "",
          type: "",
          createdFrom: "",
          createdTo: "",
          page: "",
          selected: "",
        },
        { replace: true },
      ),
  };
}
