import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "react-router";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const DEFAULT_SORT_BY = "lastUsedAt";
const DEFAULT_SORT_ORDER = "desc";
const SORT_FIELDS = new Set(["lastUsedAt", "createdAt", "expiresAt", "status"]);
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

function normalizeEnum(value, allowed = []) {
  const normalized = normalizeLowerString(value);
  return allowed.includes(normalized) ? normalized : "";
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
    scope: normalizeEnum(searchParams.get("scope"), ["all", "user", "superadmin"]),
    userId: normalizeMongoId(searchParams.get("userId")),
    status: normalizeEnum(searchParams.get("status"), ["active", "revoked", "expired"]),
    platform: normalizeString(searchParams.get("platform")),
    deviceId: normalizeString(searchParams.get("deviceId")),
    createdFrom: normalizeDateValue(searchParams.get("createdFrom")),
    createdTo: normalizeDateValue(searchParams.get("createdTo")),
    lastUsedFrom: normalizeDateValue(searchParams.get("lastUsedFrom")),
    lastUsedTo: normalizeDateValue(searchParams.get("lastUsedTo")),
    sortBy: normalizeSortBy(searchParams.get("sortBy")),
    sortOrder: normalizeSortOrder(searchParams.get("sortOrder")),
    selected: normalizeString(searchParams.get("selected")),
    selectedScope: normalizeEnum(searchParams.get("selectedScope"), ["user", "superadmin"]),
  };
}

function countActiveFilters(query) {
  return [
    query.search,
    query.scope,
    query.userId,
    query.status,
    query.platform,
    query.deviceId,
    query.createdFrom,
    query.createdTo,
    query.lastUsedFrom,
    query.lastUsedTo,
  ].filter(Boolean).length;
}

export function useSuperadminSessionsQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [userIdDraft, setUserIdDraft] = useState(query.userId);
  const [platformDraft, setPlatformDraft] = useState(query.platform);
  const [deviceIdDraft, setDeviceIdDraft] = useState(query.deviceId);
  const deferredSearchDraft = useDeferredValue(searchDraft);

  useEffect(() => {
    setSearchDraft(query.search);
  }, [query.search]);

  useEffect(() => {
    setUserIdDraft(query.userId);
  }, [query.userId]);

  useEffect(() => {
    setPlatformDraft(query.platform);
  }, [query.platform]);

  useEffect(() => {
    setDeviceIdDraft(query.deviceId);
  }, [query.deviceId]);

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
    platformDraft,
    setPlatformDraft,
    deviceIdDraft,
    setDeviceIdDraft,
    isPending,
    activeFilterCount: countActiveFilters(query),
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    updateParams,
    setPage: (page) => updateParams({ page }, { replace: true }),
    setLimit: (limit) => updateParams({ limit }, { replace: true, resetPage: true }),
    setScope: (scope) => updateParams({ scope }, { replace: true, resetPage: true }),
    setStatus: (status) => updateParams({ status }, { replace: true, resetPage: true }),
    setCreatedFrom: (createdFrom) => updateParams({ createdFrom }, { replace: true, resetPage: true }),
    setCreatedTo: (createdTo) => updateParams({ createdTo }, { replace: true, resetPage: true }),
    setLastUsedFrom: (lastUsedFrom) => updateParams({ lastUsedFrom }, { replace: true, resetPage: true }),
    setLastUsedTo: (lastUsedTo) => updateParams({ lastUsedTo }, { replace: true, resetPage: true }),
    setSort: ({ sortBy, sortOrder }) =>
      updateParams({ sortBy, sortOrder }, { replace: true, resetPage: true }),
    applyUserIdFilter: () =>
      updateParams({ userId: normalizeMongoId(userIdDraft) }, { replace: true, resetPage: true }),
    clearUserIdFilter: () => {
      setUserIdDraft("");
      updateParams({ userId: "" }, { replace: true, resetPage: true });
    },
    applyPlatformFilter: () =>
      updateParams({ platform: normalizeString(platformDraft) }, { replace: true, resetPage: true }),
    clearPlatformFilter: () => {
      setPlatformDraft("");
      updateParams({ platform: "" }, { replace: true, resetPage: true });
    },
    applyDeviceIdFilter: () =>
      updateParams({ deviceId: normalizeString(deviceIdDraft) }, { replace: true, resetPage: true }),
    clearDeviceIdFilter: () => {
      setDeviceIdDraft("");
      updateParams({ deviceId: "" }, { replace: true, resetPage: true });
    },
    openSession: (sessionId, scope = "") =>
      updateParams(
        { selected: sessionId, selectedScope: scope },
        { replace: true },
      ),
    closeSession: () => updateParams({ selected: "", selectedScope: "" }, { replace: true }),
    clearFilters: () =>
      updateParams(
        {
          search: "",
          scope: "",
          userId: "",
          status: "",
          platform: "",
          deviceId: "",
          createdFrom: "",
          createdTo: "",
          lastUsedFrom: "",
          lastUsedTo: "",
          page: "",
          selected: "",
          selectedScope: "",
        },
        { replace: true },
      ),
  };
}
