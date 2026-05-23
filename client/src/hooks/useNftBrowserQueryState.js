import { useEffect, useMemo, useRef, useTransition } from "react";
import { useSearchParams } from "react-router";

import {
  applyBrowseQueryPatch,
  DEFAULT_NFT_COLLECTION_DETAIL_QUERY,
  DEFAULT_NFT_COLLECTION_QUERY,
  DEFAULT_NFT_LIST_QUERY,
  DEFAULT_NFT_MARKETPLACE_LISTINGS_QUERY,
  DEFAULT_NFT_MY_LISTINGS_QUERY,
  DEFAULT_NFT_MY_ORDERS_QUERY,
  NFT_COLLECTION_DETAIL_SORT_OPTIONS,
  NFT_COLLECTION_SORT_OPTIONS,
  NFT_LIST_SORT_OPTIONS,
  NFT_MARKETPLACE_SORT_OPTIONS,
  DEFAULT_NFT_BROWSE_MODE,
  NFT_BROWSE_MODES,
} from "../components/nft/browseConfig";

const NFT_BROWSER_LAST_SEARCH_STORAGE_KEY = "aura_nft_browser_last_search";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizePositiveInt(value, fallback) {
  const normalized = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeBoolean(value, fallback = false) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

function buildAllowedSortSet(options = []) {
  return new Set(
    options
      .map((option) => String(option?.value || ""))
      .filter(Boolean)
      .map((value) => {
        const [sortBy, sortOrder] = value.split(":");
        return `${sortBy || ""}:${sortOrder || "desc"}`;
      }),
  );
}

const LIST_ALLOWED_SORTS = buildAllowedSortSet(NFT_LIST_SORT_OPTIONS);
const COLLECTION_ALLOWED_SORTS = buildAllowedSortSet(NFT_COLLECTION_SORT_OPTIONS);
const DETAIL_ALLOWED_SORTS = buildAllowedSortSet(NFT_COLLECTION_DETAIL_SORT_OPTIONS);
const MARKETPLACE_ALLOWED_SORTS = new Set(NFT_MARKETPLACE_SORT_OPTIONS.map(o => o.value));

function normalizeSort(searchParams, keys, defaults, allowed) {
  const sortBy = normalizeString(searchParams.get(keys.sortBy));
  const sortOrder = normalizeString(searchParams.get(keys.sortOrder)).toLowerCase() || defaults.sortOrder;
  const combined = `${sortBy}:${sortOrder || "desc"}`;

  if (!sortBy) {
    return {
      sortBy: defaults.sortBy,
      sortOrder: defaults.sortOrder,
    };
  }

  if (!allowed.has(combined)) {
    return {
      sortBy: defaults.sortBy,
      sortOrder: defaults.sortOrder,
    };
  }

  return {
    sortBy,
    sortOrder,
  };
}

function parseListQuery(searchParams) {
  const sort = normalizeSort(
    searchParams,
    { sortBy: "listSortBy", sortOrder: "listSortOrder" },
    DEFAULT_NFT_LIST_QUERY,
    LIST_ALLOWED_SORTS,
  );

  return {
    ...DEFAULT_NFT_LIST_QUERY,
    page: normalizePositiveInt(searchParams.get("listPage"), DEFAULT_NFT_LIST_QUERY.page),
    limit: normalizePositiveInt(searchParams.get("listLimit"), DEFAULT_NFT_LIST_QUERY.limit),
    search: normalizeString(searchParams.get("listSearch")),
    standard: normalizeString(searchParams.get("listStandard")),
    showHidden: normalizeBoolean(
      searchParams.get("listShowHidden"),
      DEFAULT_NFT_LIST_QUERY.showHidden,
    ),
    showSpam: normalizeBoolean(
      searchParams.get("listShowSpam"),
      DEFAULT_NFT_LIST_QUERY.showSpam,
    ),
    ...sort,
  };
}

function parseCollectionQuery(searchParams) {
  const sort = normalizeSort(
    searchParams,
    { sortBy: "collectionsSortBy", sortOrder: "collectionsSortOrder" },
    DEFAULT_NFT_COLLECTION_QUERY,
    COLLECTION_ALLOWED_SORTS,
  );

  return {
    ...DEFAULT_NFT_COLLECTION_QUERY,
    page: normalizePositiveInt(
      searchParams.get("collectionsPage"),
      DEFAULT_NFT_COLLECTION_QUERY.page,
    ),
    limit: normalizePositiveInt(
      searchParams.get("collectionsLimit"),
      DEFAULT_NFT_COLLECTION_QUERY.limit,
    ),
    search: normalizeString(searchParams.get("collectionsSearch")),
    standard: normalizeString(searchParams.get("collectionsStandard")),
    showHidden: normalizeBoolean(
      searchParams.get("collectionsShowHidden"),
      DEFAULT_NFT_COLLECTION_QUERY.showHidden,
    ),
    showSpam: normalizeBoolean(
      searchParams.get("collectionsShowSpam"),
      DEFAULT_NFT_COLLECTION_QUERY.showSpam,
    ),
    ...sort,
  };
}

function parseDetailQuery(searchParams) {
  const sort = normalizeSort(
    searchParams,
    { sortBy: "detailSortBy", sortOrder: "detailSortOrder" },
    DEFAULT_NFT_COLLECTION_DETAIL_QUERY,
    DETAIL_ALLOWED_SORTS,
  );

  return {
    ...DEFAULT_NFT_COLLECTION_DETAIL_QUERY,
    page: normalizePositiveInt(
      searchParams.get("detailPage"),
      DEFAULT_NFT_COLLECTION_DETAIL_QUERY.page,
    ),
    limit: normalizePositiveInt(
      searchParams.get("detailLimit"),
      DEFAULT_NFT_COLLECTION_DETAIL_QUERY.limit,
    ),
    search: normalizeString(searchParams.get("detailSearch")),
    standard: normalizeString(searchParams.get("detailStandard")),
    showHidden: normalizeBoolean(
      searchParams.get("detailShowHidden"),
      DEFAULT_NFT_COLLECTION_DETAIL_QUERY.showHidden,
    ),
    showSpam: normalizeBoolean(
      searchParams.get("detailShowSpam"),
      DEFAULT_NFT_COLLECTION_DETAIL_QUERY.showSpam,
    ),
    ...sort,
  };
}

function parseMarketplaceQuery(searchParams) {
  const sortBy = normalizeString(searchParams.get("mktSortBy")) || DEFAULT_NFT_MARKETPLACE_LISTINGS_QUERY.sortBy;
  
  return {
    ...DEFAULT_NFT_MARKETPLACE_LISTINGS_QUERY,
    page: normalizePositiveInt(searchParams.get("mktPage"), 1),
    contractAddress: normalizeString(searchParams.get("mktContract")),
    chain: normalizeString(searchParams.get("mktChain")) || "polygon",
    sortBy: MARKETPLACE_ALLOWED_SORTS.has(sortBy) ? sortBy : DEFAULT_NFT_MARKETPLACE_LISTINGS_QUERY.sortBy,
    minPrice: normalizeString(searchParams.get("mktMinPrice")),
    maxPrice: normalizeString(searchParams.get("mktMaxPrice")),
  };
}

function parseMyListingsQuery(searchParams) {
  return {
    ...DEFAULT_NFT_MY_LISTINGS_QUERY,
    page: normalizePositiveInt(searchParams.get("myLPage"), 1),
    status: normalizeString(searchParams.get("myLStatus")) || "active",
    chain: normalizeString(searchParams.get("myLChain")),
  };
}

function parseMyOrdersQuery(searchParams) {
  return {
    ...DEFAULT_NFT_MY_ORDERS_QUERY,
    page: normalizePositiveInt(searchParams.get("myOPage"), 1),
    type: normalizeString(searchParams.get("myOType")),
    status: normalizeString(searchParams.get("myOStatus")),
    chain: normalizeString(searchParams.get("myOChain")),
  };
}

function applyValue(searchParams, key, value, defaultValue) {
  const normalizedDefault = defaultValue === undefined ? "" : String(defaultValue);

  if (
    value === undefined ||
    value === null ||
    value === "" ||
    String(value) === normalizedDefault
  ) {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, String(value));
}

function readStoredBrowserSearch() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return String(window.sessionStorage.getItem(NFT_BROWSER_LAST_SEARCH_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

function writeStoredBrowserSearch(value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value) {
      window.sessionStorage.setItem(
        NFT_BROWSER_LAST_SEARCH_STORAGE_KEY,
        String(value),
      );
      return;
    }

    window.sessionStorage.removeItem(NFT_BROWSER_LAST_SEARCH_STORAGE_KEY);
  } catch {
    // Ignore storage write failures and keep state in the URL only.
  }
}

export function getStoredNftBrowserSearch() {
  return readStoredBrowserSearch();
}

export function useNftBrowserQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const hasRestoredRef = useRef(false);

  const state = useMemo(() => {
    const list = parseListQuery(searchParams);
    const collections = parseCollectionQuery(searchParams);
    const detail = parseDetailQuery(searchParams);
    const marketplace = parseMarketplaceQuery(searchParams);
    const myListings = parseMyListingsQuery(searchParams);
    const myOrders = parseMyOrdersQuery(searchParams);
    const selectedCollectionId = normalizeString(searchParams.get("collection")) || "all";
    const mode = normalizeString(searchParams.get("mode")) || DEFAULT_NFT_BROWSE_MODE;

    return {
      mode,
      selectedCollectionId,
      list,
      collections,
      detail,
      marketplace,
      myListings,
      myOrders,
    };
  }, [searchParams]);

  useEffect(() => {
    const currentSearch = searchParams.toString();

    if (currentSearch) {
      writeStoredBrowserSearch(currentSearch);
      hasRestoredRef.current = true;
      return;
    }

    if (hasRestoredRef.current) {
      writeStoredBrowserSearch("");
      return;
    }

    const storedSearch = readStoredBrowserSearch();

    if (!storedSearch) {
      hasRestoredRef.current = true;
      return;
    }

    hasRestoredRef.current = true;
    setSearchParams(new URLSearchParams(storedSearch), { replace: true });
  }, [searchParams, setSearchParams]);

  function updateParams(mutator, { replace = true } = {}) {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      mutator(nextParams);
      setSearchParams(nextParams, { replace });
    });
  }

  function updateList(updates = {}, { resetPage = false } = {}) {
    updateParams((params) => {
      const next = applyBrowseQueryPatch(state.list, updates, { resetPage });

      applyValue(params, "listPage", next.page, DEFAULT_NFT_LIST_QUERY.page);
      applyValue(params, "listLimit", next.limit, DEFAULT_NFT_LIST_QUERY.limit);
      applyValue(params, "listSearch", next.search, DEFAULT_NFT_LIST_QUERY.search);
      applyValue(params, "listStandard", next.standard, DEFAULT_NFT_LIST_QUERY.standard);
      applyValue(params, "listSortBy", next.sortBy, DEFAULT_NFT_LIST_QUERY.sortBy);
      applyValue(params, "listSortOrder", next.sortOrder, DEFAULT_NFT_LIST_QUERY.sortOrder);
      applyValue(
        params,
        "listShowHidden",
        next.showHidden ? "true" : "",
        DEFAULT_NFT_LIST_QUERY.showHidden ? "true" : "",
      );
      applyValue(
        params,
        "listShowSpam",
        next.showSpam ? "true" : "",
        DEFAULT_NFT_LIST_QUERY.showSpam ? "true" : "",
      );
    });
  }

  function updateCollections(updates = {}, { resetPage = false } = {}) {
    updateParams((params) => {
      const next = applyBrowseQueryPatch(state.collections, updates, {
        resetPage,
      });

      applyValue(
        params,
        "collectionsPage",
        next.page,
        DEFAULT_NFT_COLLECTION_QUERY.page,
      );
      applyValue(
        params,
        "collectionsLimit",
        next.limit,
        DEFAULT_NFT_COLLECTION_QUERY.limit,
      );
      applyValue(
        params,
        "collectionsSearch",
        next.search,
        DEFAULT_NFT_COLLECTION_QUERY.search,
      );
      applyValue(
        params,
        "collectionsStandard",
        next.standard,
        DEFAULT_NFT_COLLECTION_QUERY.standard,
      );
      applyValue(
        params,
        "collectionsSortBy",
        next.sortBy,
        DEFAULT_NFT_COLLECTION_QUERY.sortBy,
      );
      applyValue(
        params,
        "collectionsSortOrder",
        next.sortOrder,
        DEFAULT_NFT_COLLECTION_QUERY.sortOrder,
      );
      applyValue(
        params,
        "collectionsShowHidden",
        next.showHidden ? "true" : "",
        DEFAULT_NFT_COLLECTION_QUERY.showHidden ? "true" : "",
      );
      applyValue(
        params,
        "collectionsShowSpam",
        next.showSpam ? "true" : "",
        DEFAULT_NFT_COLLECTION_QUERY.showSpam ? "true" : "",
      );
    });
  }

  function updateDetail(updates = {}, { resetPage = false } = {}) {
    updateParams((params) => {
      const next = applyBrowseQueryPatch(state.detail, updates, { resetPage });

      applyValue(params, "detailPage", next.page, DEFAULT_NFT_COLLECTION_DETAIL_QUERY.page);
      applyValue(params, "detailLimit", next.limit, DEFAULT_NFT_COLLECTION_DETAIL_QUERY.limit);
      applyValue(params, "detailSearch", next.search, DEFAULT_NFT_COLLECTION_DETAIL_QUERY.search);
      applyValue(
        params,
        "detailStandard",
        next.standard,
        DEFAULT_NFT_COLLECTION_DETAIL_QUERY.standard,
      );
      applyValue(params, "detailSortBy", next.sortBy, DEFAULT_NFT_COLLECTION_DETAIL_QUERY.sortBy);
      applyValue(
        params,
        "detailSortOrder",
        next.sortOrder,
        DEFAULT_NFT_COLLECTION_DETAIL_QUERY.sortOrder,
      );
      applyValue(
        params,
        "detailShowHidden",
        next.showHidden ? "true" : "",
        DEFAULT_NFT_COLLECTION_DETAIL_QUERY.showHidden ? "true" : "",
      );
      applyValue(
        params,
        "detailShowSpam",
        next.showSpam ? "true" : "",
        DEFAULT_NFT_COLLECTION_DETAIL_QUERY.showSpam ? "true" : "",
      );
    });
  }

  function setSelectedCollectionId(value) {
    updateParams((params) => {
      const normalized = normalizeString(value) || "all";
      applyValue(params, "collection", normalized === "all" ? "" : normalized, "");
      applyValue(params, "detailPage", "", "");

      if (normalized !== "all") {
        applyValue(params, "mode", NFT_BROWSE_MODES.COLLECTION, DEFAULT_NFT_BROWSE_MODE);
      }
    });
  }

  function setBrowseMode(value) {
    updateParams((params) => {
      const normalized = normalizeString(value) || DEFAULT_NFT_BROWSE_MODE;
      applyValue(params, "mode", normalized, DEFAULT_NFT_BROWSE_MODE);

      if (normalized === NFT_BROWSE_MODES.INDIVIDUAL) {
        applyValue(params, "collection", "", "");
      }
    });
  }

  function updateMarketplace(updates = {}, { resetPage = false } = {}) {
    updateParams((params) => {
      const next = applyBrowseQueryPatch(state.marketplace, updates, { resetPage });
      applyValue(params, "mktPage", next.page, 1);
      applyValue(params, "mktContract", next.contractAddress, "");
      applyValue(params, "mktChain", next.chain, "polygon");
      applyValue(params, "mktSortBy", next.sortBy, "newest");
      applyValue(params, "mktMinPrice", next.minPrice, "");
      applyValue(params, "mktMaxPrice", next.maxPrice, "");
    });
  }

  function updateMyListings(updates = {}, { resetPage = false } = {}) {
    updateParams((params) => {
      const next = applyBrowseQueryPatch(state.myListings, updates, { resetPage });
      applyValue(params, "myLPage", next.page, 1);
      applyValue(params, "myLStatus", next.status, "active");
      applyValue(params, "myLChain", next.chain, "");
    });
  }

  function updateMyOrders(updates = {}, { resetPage = false } = {}) {
    updateParams((params) => {
      const next = applyBrowseQueryPatch(state.myOrders, updates, { resetPage });
      applyValue(params, "myOPage", next.page, 1);
      applyValue(params, "myOType", next.type, "");
      applyValue(params, "myOStatus", next.status, "");
      applyValue(params, "myOChain", next.chain, "");
    });
  }

  return {
    state,
    isPending,
    updateList,
    updateCollections,
    updateDetail,
    updateMarketplace,
    updateMyListings,
    updateMyOrders,
    setSelectedCollectionId,
    setBrowseMode,
  };
}
