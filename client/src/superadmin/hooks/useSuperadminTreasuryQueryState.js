import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "react-router";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const DEFAULT_SORT_BY = "chain";
const DEFAULT_SORT_ORDER = "asc";
const SORT_FIELDS = new Set(["chain", "asset", "walletType", "status", "createdAt"]);
const SORT_ORDERS = new Set(["asc", "desc"]);
const PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100]);

function normalizePositiveInt(value, fallback) {
  const normalized = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLowerString(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeSortBy(value) {
  const normalized = normalizeString(value);
  return SORT_FIELDS.has(normalized) ? normalized : DEFAULT_SORT_BY;
}

function normalizeSortOrder(value) {
  const normalized = normalizeLowerString(value);
  return SORT_ORDERS.has(normalized) ? normalized : DEFAULT_SORT_ORDER;
}

function parseQuery(searchParams) {
  const limit = normalizePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);

  return {
    page: normalizePositiveInt(searchParams.get("page"), DEFAULT_PAGE),
    limit: PAGE_SIZE_OPTIONS.includes(limit) ? limit : DEFAULT_LIMIT,
    search: normalizeString(searchParams.get("search")),
    chain: normalizeLowerString(searchParams.get("chain")),
    asset: normalizeUpperString(searchParams.get("asset")),
    walletType: normalizeLowerString(searchParams.get("walletType")),
    status: normalizeLowerString(searchParams.get("status")),
    sortBy: normalizeSortBy(searchParams.get("sortBy")),
    sortOrder: normalizeSortOrder(searchParams.get("sortOrder")),
    selected: normalizeString(searchParams.get("selected")),
  };
}

function normalizeUpperString(value) {
  return normalizeString(value).toUpperCase();
}

function countActiveFilters(query) {
  return [
    query.search,
    query.chain,
    query.asset,
    query.walletType,
    query.status,
  ].filter(Boolean).length;
}

export function useSuperadminTreasuryQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.search);
  const deferredSearchDraft = useDeferredValue(searchDraft);

  useEffect(() => {
    setSearchDraft(query.search);
  }, [query.search]);

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

    return () => window.clearTimeout(timeoutId);
  }, [deferredSearchDraft, query.search]);

  return {
    query,
    searchDraft,
    setSearchDraft,
    isPending,
    activeFilterCount: countActiveFilters(query),
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    setPage: (page) => updateParams({ page }, { replace: true }),
    setLimit: (limit) => updateParams({ limit }, { replace: true, resetPage: true }),
    setChain: (chain) => updateParams({ chain: normalizeLowerString(chain) }, { replace: true, resetPage: true }),
    setAsset: (asset) => updateParams({ asset: normalizeUpperString(asset) }, { replace: true, resetPage: true }),
    setWalletType: (walletType) =>
      updateParams({ walletType: normalizeLowerString(walletType) }, { replace: true, resetPage: true }),
    setStatus: (status) => updateParams({ status: normalizeLowerString(status) }, { replace: true, resetPage: true }),
    setSort: ({ sortBy, sortOrder }) => updateParams({ sortBy, sortOrder }, { replace: true, resetPage: true }),
    openTreasuryWallet: (selected) => updateParams({ selected }, { replace: true }),
    closeTreasuryWallet: () => updateParams({ selected: "" }, { replace: true }),
    clearFilters: () =>
      updateParams(
        {
          search: "",
          chain: "",
          asset: "",
          walletType: "",
          status: "",
          page: "",
          selected: "",
        },
        { replace: true },
      ),
  };
}
