import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LayoutGrid, RefreshCw, Search, ChevronRight, Layers, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router";

import { getChainMeta } from "../../config/chains";
import { fetchNftSyncStatus } from "../../api/nft";
import { useAppContext } from "../../contexts/AppContext";
import { useNftAutoSync } from "../../hooks/useNftAutoSync";
import { useNftBrowserQueryState } from "../../hooks/useNftBrowserQueryState";
import {
  NFT_COLLECTION_DETAIL_SORT_OPTIONS,
  NFT_COLLECTION_SORT_OPTIONS,
  NFT_LIST_SORT_OPTIONS,
  NFT_STANDARD_FILTER_OPTIONS,
  resolvePaginationTotalPages,
  NFT_BROWSE_MODES,
  NFT_MARKETPLACE_SORT_OPTIONS,
} from "./browseConfig";
import { NftBrowseControls } from "./NftBrowseControls";
import { NftCard } from "./NftCard";
import { NftCollectionHeaderCard } from "./NftCollectionHeaderCard";
import { NftDetailModal } from "./NftDetailModal";
import { NftMarketplaceBuyModal } from "./NftMarketplaceBuyModal";
import { NftMarketplaceCancelModal } from "./NftMarketplaceCancelModal";
import { NftPaginationControls } from "./NftPaginationControls";
import { NftSyncBanner, getNftSyncMessage } from "./NftSyncBanner";
import {
  selectNftCollectionDetailCollection,
  selectNftCollectionDetailError,
  selectNftCollectionDetailItems,
  selectNftCollectionDetailLoading,
  selectNftCollectionDetailMeta,
  selectNftCollectionDetailSync,
} from "../../store/selectors";
import { selectNftSyncStatus } from "../../store/nftSlice";

function parseCollectionContractAddress(collectionId = "") {
  const normalized = String(collectionId || "").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.includes(":")) {
    const parts = normalized.split(":");
    return String(parts[parts.length - 1] || "")
      .trim()
      .toLowerCase();
  }

  return normalized.toLowerCase();
}

function getCollectionKey(collection = {}) {
  return (
    collection.id ||
    collection.collectionId ||
    (collection.chain && collection.contractAddress
      ? `${collection.chain}:${collection.contractAddress}`
      : "") ||
    collection.contractAddress ||
    collection.name ||
    ""
  );
}

function useDebouncedValue(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timerId);
  }, [delay, value]);

  return debouncedValue;
}

function NftCollectionGroupCard({ collection, onClick }) {
  const collectionKey = getCollectionKey(collection);
  const name = (collection.name || collection.collectionName || "Unknown Collection").trim();
  const count = collection.count || 0;
  const logo = collection.logoUrl || collection.previewImageUrl || null;

  return (
    <button
      type="button"
      onClick={() => onClick(collectionKey)}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-left transition-all hover:border-slate-700 hover:bg-slate-900 active:scale-[0.99]"
    >
      <div className="relative shrink-0">
        {logo ? (
          <img
            src={logo}
            alt={name}
            className="relative z-10 h-14 w-14 rounded-xl border border-white/10 bg-slate-950 object-cover"
          />
        ) : (
          <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-500">
            <LayoutGrid size={24} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 text-left">
        <h3 className="truncate text-sm font-semibold text-white">{name}</h3>
        <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
          {collection.chainName || "Polygon"}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {collection.standard && (
            <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
              {String(collection.standard).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="text-right">
          <p className="text-lg font-semibold text-white">{count}</p>
          <p className="text-[10px] font-medium text-slate-500">NFTs</p>
        </div>
        <ChevronRight size={14} className="text-slate-600 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-400" />
      </div>
    </button>
  );
}

export function NftBrowserScreen() {
  const navigate = useNavigate();
  const {
    nfts,
    nftMeta,
    nftSync,
    nftsLoading,
    nftsSyncing,
    nftsError,
    nftCollections,
    nftCollectionsMeta,
    nftRefreshState,
    nftRefreshPending,
    nftSupportedWallets,
    selectedNftWallet,
    selectedNftWalletId,
    selectedNft,
    selectedNftLoading,
    selectedNftError,
    setSelectedNftWallet,
    refreshNfts,
    refreshNftCollections,
    requestWalletNftRefresh,
    fetchNftCollectionDetail,
    fetchNftDetail,
    clearSelectedNft,
    // Marketplace
    marketplaceListings,
    marketplaceMeta,
    marketplaceLoading,
    myListings,
    myListingsMeta,
    myListingsLoading,
    myOrders,
    myOrdersMeta,
    myOrdersLoading,
    fetchMarketplaceListings,
    fetchMyMarketplaceListings,
    fetchMyMarketplaceOrders,
    cancelNftListing,
  } = useAppContext();

  const {
    state: browseState,
    updateList,
    updateCollections,
    updateDetail,
    updateMarketplace,
    updateMyListings,
    updateMyOrders,
    setSelectedCollectionId,
    setBrowseMode,
  } = useNftBrowserQueryState();
  const [detailModalNftId, setDetailModalNftId] = useState("");
  const [polledSyncStatus, setPolledSyncStatus] = useState(null);
  const nftDetailRequestRef = useRef(null);
  const syncClickRef = useRef(false);
  const lastWalletIdRef = useRef("");
  const prevStatusRef = useRef("");
  const prevStatusKeyRef = useRef("");
  const lastRefreshRef = useRef(0);
  const lastManualRefreshRef = useRef(0);
  const [showFilters, setShowFilters] = useState(false);
  const [mktSubMode, setMktSubMode] = useState("all"); // all, my_listings, my_orders
  const [selectedListing, setSelectedListing] = useState(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const syncStatus = useSelector(selectNftSyncStatus);
  const currentNftWallet = selectedNftWallet || nftSupportedWallets[0] || null;
  const currentNftWalletId = currentNftWallet?.walletId || "";
  const currentNftWalletChain = currentNftWallet?.chain || "";
  const currentNftSync = syncStatus;
  const hasNftSupportedWallets = nftSupportedWallets.length > 0;
  const isNftRefreshActive = Boolean(nftRefreshPending || nftsSyncing);
  const isNftRefreshScheduled = Boolean(
    nftRefreshState?.scheduled || nftRefreshState?.alreadyInFlight,
  );
  const isNftDetailOpen = Boolean(detailModalNftId);
  const selectedNftIdentity = String(
    selectedNft?.id || selectedNft?._id || selectedNft?.backendId || selectedNft?.nftId || "",
  );
  const activeNftDetail = selectedNftIdentity === detailModalNftId ? selectedNft : null;

  const debouncedNftListSearch = useDebouncedValue(browseState.list.search, 350);
  const debouncedCollectionSearch = useDebouncedValue(
    browseState.collections.search,
    350,
  );
  const debouncedCollectionDetailSearch = useDebouncedValue(
    browseState.detail.search,
    350,
  );

  const nftListParams = useMemo(
    () => ({
      ...browseState.list,
      search: debouncedNftListSearch,
    }),
    [browseState.list, debouncedNftListSearch],
  );
  const collectionParams = useMemo(
    () => ({
      ...browseState.collections,
      search: debouncedCollectionSearch,
    }),
    [browseState.collections, debouncedCollectionSearch],
  );

  const selectedCollectionSummary = useMemo(() => {
    if (browseState.selectedCollectionId === "all") {
      return null;
    }

    return (
      nftCollections.find(
        (collection) =>
          String(getCollectionKey(collection)) ===
          String(browseState.selectedCollectionId),
      ) || null
    );
  }, [browseState.selectedCollectionId, nftCollections]);

  const selectedCollectionContractAddress =
    selectedCollectionSummary?.contractAddress ||
    parseCollectionContractAddress(browseState.selectedCollectionId);
  const selectedCollectionDetailParams = useMemo(
    () =>
      currentNftWalletId &&
      currentNftWalletChain &&
      browseState.selectedCollectionId !== "all" &&
      selectedCollectionContractAddress
        ? {
            walletId: currentNftWalletId,
            chain: currentNftWalletChain,
            contractAddress: selectedCollectionContractAddress,
            ...browseState.detail,
            search: debouncedCollectionDetailSearch,
          }
        : null,
    [
      browseState.detail,
      browseState.selectedCollectionId,
      currentNftWalletChain,
      currentNftWalletId,
      debouncedCollectionDetailSearch,
      selectedCollectionContractAddress,
    ],
  );

  const selectedCollectionDetail = useSelector((state) =>
    selectedCollectionDetailParams
      ? selectNftCollectionDetailCollection(state, selectedCollectionDetailParams)
      : null,
  );
  const selectedCollectionItems = useSelector((state) =>
    selectedCollectionDetailParams
      ? selectNftCollectionDetailItems(state, selectedCollectionDetailParams)
      : [],
  );
  const selectedCollectionMeta = useSelector((state) =>
    selectedCollectionDetailParams
      ? selectNftCollectionDetailMeta(state, selectedCollectionDetailParams)
      : null,
  );
  const selectedCollectionSync = useSelector((state) =>
    selectedCollectionDetailParams
      ? selectNftCollectionDetailSync(state, selectedCollectionDetailParams)
      : null,
  );
  const selectedCollectionLoading = useSelector((state) =>
    selectedCollectionDetailParams
      ? selectNftCollectionDetailLoading(state, selectedCollectionDetailParams)
      : false,
  );
  const selectedCollectionError = useSelector((state) =>
    selectedCollectionDetailParams
      ? selectNftCollectionDetailError(state, selectedCollectionDetailParams)
      : null,
  );

  const activeNftGridItems =
    browseState.selectedCollectionId === "all" ? nfts : selectedCollectionItems;
  const fallbackNftDetail = useMemo(() => {
    if (!detailModalNftId) {
      return null;
    }

    return (
      activeNftGridItems.find(
        (item) =>
          String(item?.id || item?._id || item?.backendId || item?.nftId || "") ===
          detailModalNftId,
      ) || null
    );
  }, [activeNftGridItems, detailModalNftId]);
  const visibleNftDetail = activeNftDetail || fallbackNftDetail;
  const activeNftViewSync =
    browseState.selectedCollectionId === "all"
      ? currentNftSync
      : selectedCollectionSync || currentNftSync;
  const activeNftViewMessage = getNftSyncMessage(activeNftViewSync);
  const flatListTotalPages = useMemo(
    () =>
      resolvePaginationTotalPages({
        page: nftMeta?.page || browseState.list.page,
        totalPages: 0,
        total: nftMeta?.total,
        limit: nftMeta?.limit || browseState.list.limit,
        hasMore: nftMeta?.hasMore,
      }),
    [
      browseState.list.limit,
      browseState.list.page,
      nftMeta?.hasMore,
      nftMeta?.limit,
      nftMeta?.page,
      nftMeta?.total,
    ],
  );

  useEffect(() => {
    if (!currentNftWalletId) return;

    const prev = prevStatusRef.current;
    const current = syncStatus.status;

    if (prev === "syncing" && current === "idle") {
      const now = Date.now();
      if (now - lastRefreshRef.current > 5000) {
        lastRefreshRef.current = now;
        
        void refreshNfts({
          walletId: currentNftWalletId,
          chain: currentNftWalletChain,
          ...nftListParams,
        });

        void refreshNftCollections({
          walletId: currentNftWalletId,
          chain: currentNftWalletChain,
          ...collectionParams,
        });
      }
    }

    prevStatusRef.current = current;
  }, [
    syncStatus.status,
    currentNftWalletId,
    currentNftWalletChain,
    nftListParams,
    collectionParams,
    refreshNfts,
    refreshNftCollections
  ]);

  useEffect(() => {
    if (!hasNftSupportedWallets || !currentNftWalletId || !currentNftWalletChain) {
      return;
    }

    refreshNfts({
      walletId: currentNftWalletId,
      chain: currentNftWalletChain,
      ...nftListParams,
    }).catch(() => null);
  }, [
    currentNftWalletChain,
    currentNftWalletId,
    hasNftSupportedWallets,
    nftListParams,
    refreshNfts,
  ]);

  useEffect(() => {
    if (!hasNftSupportedWallets || !currentNftWalletId || !currentNftWalletChain) {
      return;
    }

    refreshNftCollections({
      walletId: currentNftWalletId,
      chain: currentNftWalletChain,
      ...collectionParams,
    }).catch(() => null);
  }, [
    collectionParams,
    currentNftWalletChain,
    currentNftWalletId,
    hasNftSupportedWallets,
    refreshNftCollections,
  ]);

  useEffect(() => {
    if (!selectedCollectionDetailParams) {
      return;
    }

    fetchNftCollectionDetail(selectedCollectionDetailParams).catch(() => null);
  }, [fetchNftCollectionDetail, selectedCollectionDetailParams]);

  // Marketplace Listings Fetch
  useEffect(() => {
    if (browseState.mode !== NFT_BROWSE_MODES.MARKETPLACE || mktSubMode !== "all") return;
    fetchMarketplaceListings(browseState.marketplace).catch(() => null);
  }, [browseState.mode, mktSubMode, browseState.marketplace, fetchMarketplaceListings]);

  // My Listings Fetch
  useEffect(() => {
    if (browseState.mode !== NFT_BROWSE_MODES.MARKETPLACE || mktSubMode !== "my_listings") return;
    fetchMyMarketplaceListings({ ...browseState.myListings, walletId: currentNftWalletId }).catch(() => null);
  }, [browseState.mode, mktSubMode, browseState.myListings, currentNftWalletId, fetchMyMarketplaceListings]);

  // My Orders Fetch
  useEffect(() => {
    if (browseState.mode !== NFT_BROWSE_MODES.MARKETPLACE || mktSubMode !== "my_orders") return;
    fetchMyMarketplaceOrders({ ...browseState.myOrders, walletId: currentNftWalletId }).catch(() => null);
  }, [browseState.mode, mktSubMode, browseState.myOrders, currentNftWalletId, fetchMyMarketplaceOrders]);

  useEffect(() => {
    setPolledSyncStatus(null);
    prevStatusRef.current = "";
    prevStatusKeyRef.current = "";
    lastRefreshRef.current = 0;
    lastManualRefreshRef.current = 0;
  }, [currentNftWalletChain, currentNftWalletId]);

  useEffect(() => {
    if (!currentNftWalletId) {
      return;
    }

    if (!lastWalletIdRef.current) {
      lastWalletIdRef.current = currentNftWalletId;
      return;
    }

    if (lastWalletIdRef.current !== currentNftWalletId) {
      lastWalletIdRef.current = currentNftWalletId;
      setSelectedCollectionId("all");
    }
  }, [currentNftWalletId, setSelectedCollectionId]);

  useEffect(() => {
    return () => {
      if (nftDetailRequestRef.current?.abort) {
        nftDetailRequestRef.current.abort();
      }

      clearSelectedNft();
    };
  }, [clearSelectedNft]);

  useNftAutoSync({
    enabled: hasNftSupportedWallets,
    walletId: currentNftWalletId,
    chain: currentNftWalletChain,
    sync: currentNftSync,
    syncing: nftsSyncing,
    refreshPending: nftRefreshPending || isNftRefreshScheduled,
    pollSyncStatus: fetchNftSyncStatus,
    onSyncStatus: setPolledSyncStatus,
  });

  async function handleSyncNfts() {
    if (!hasNftSupportedWallets) return;
    if (!currentNftWalletId || !currentNftWalletChain) return;
    if (syncClickRef.current) return;

    const now = Date.now();
    if (now - lastManualRefreshRef.current < 15000) {
      console.warn("Refresh skipped (debounced)", {
        walletId: currentNftWalletId,
      });
      return;
    }

    lastManualRefreshRef.current = now;
    syncClickRef.current = true;

    try {
      await requestWalletNftRefresh({
        walletId: currentNftWalletId,
        chain: currentNftWalletChain,
        source: "nft_browser_manual_click",
      });
    } catch (error) {
      console.error("Failed to refresh NFTs:", error);
    } finally {
      syncClickRef.current = false;
    }
  }

  function handleSelectNftWallet(walletId) {
    if (!walletId || walletId === selectedNftWalletId) return;
    setSelectedNftWallet(walletId);
  }

  function startNftDetailRequest(nftId) {
    if (!nftId) {
      return null;
    }

    if (nftDetailRequestRef.current?.abort) {
      nftDetailRequestRef.current.abort();
    }

    const request = fetchNftDetail(nftId);
    nftDetailRequestRef.current = request;

    if (request?.finally) {
      request.finally(() => {
        if (nftDetailRequestRef.current === request) {
          nftDetailRequestRef.current = null;
        }
      });
    }

    return request;
  }

  function handleOpenNftDetail(nft) {
    const nftId = String(nft?.id || nft?._id || nft?.backendId || nft?.nftId || "");
    if (!nftId) return;

    setDetailModalNftId(nftId);
    startNftDetailRequest(nftId)?.catch(() => null);
  }

  function handleRetryNftDetail() {
    if (!detailModalNftId) return;
    startNftDetailRequest(detailModalNftId)?.catch(() => null);
  }

  function handleCloseNftDetail() {
    if (nftDetailRequestRef.current?.abort) {
      nftDetailRequestRef.current.abort();
      nftDetailRequestRef.current = null;
    }

    setDetailModalNftId("");
    clearSelectedNft();
  }

  const handleOpenCollection = useCallback(
    (collectionId) => setSelectedCollectionId(collectionId),
    [setSelectedCollectionId],
  );

  const handleOpenListingBuy = useCallback((listing) => {
    setSelectedListing(listing);
    setShowBuyModal(true);
  }, []);

  const handleOpenListingCancel = useCallback((listing) => {
    setSelectedListing(listing);
    setShowCancelModal(true);
  }, []);

  const handleMarketplaceActionCompleted = useCallback(() => {
    // Refresh current view
    if (mktSubMode === "all") {
      fetchMarketplaceListings(browseState.marketplace);
    } else if (mktSubMode === "my_listings") {
      fetchMyMarketplaceListings({ ...browseState.myListings, walletId: currentNftWalletId });
    }
  }, [mktSubMode, browseState.marketplace, browseState.myListings, currentNftWalletId, fetchMarketplaceListings, fetchMyMarketplaceListings]);

  function handleSelectCollection(collectionId) {
    setSelectedCollectionId(String(collectionId || "all"));
  }

  if (isNftDetailOpen) {
    return (
      <NftDetailModal
        open={isNftDetailOpen}
        nft={visibleNftDetail}
        loading={selectedNftLoading && !visibleNftDetail}
        error={selectedNftError}
        onClose={handleCloseNftDetail}
        onRetry={handleRetryNftDetail}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="aura-container"
    >
      <section className="sticky top-0 z-50">
        <div className="aura-header px-5 pt-4 pb-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft
              size={20}
              className="group-hover:-translate-x-0.5 transition-transform"
            />
          </button>
          <h1 className="aura-header-title">NFT Browser</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`aura-header-button group ${
                showFilters ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/30" : ""
              }`}
              title={showFilters ? "Hide filters" : "Show filters"}
            >
              <Search
                size={18}
                className={showFilters ? "scale-110" : "group-hover:scale-110 transition-transform"}
              />
            </button>
            <button
              type="button"
              onClick={handleSyncNfts}
              disabled={!hasNftSupportedWallets || isNftRefreshActive || nftsLoading}
              className={`aura-header-button ${
                !hasNftSupportedWallets || isNftRefreshActive || nftsLoading
                  ? "opacity-60 cursor-not-allowed"
                  : ""
              }`}
            >
              <RefreshCw size={18} className={isNftRefreshActive ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </section>

      <div className="px-5 mt-4 space-y-5 pb-24">
        {/* Wallet Selection */}
        <div className="flex min-h-[32px] flex-wrap items-center gap-2">
          {hasNftSupportedWallets ? (
            nftSupportedWallets.map((wallet) => {
              const isSelected = wallet.walletId === currentNftWalletId;
              const label =
                wallet.label ||
                wallet.name ||
                wallet.walletLabel ||
                wallet.chainName ||
                "Polygon";
              const chainMeta = getChainMeta(wallet.chain || "polygon");
              const chainIcon = chainMeta?.icon || "";
              const chainSymbol = chainMeta?.symbol || chainMeta?.code || "POL";

              return (
                <button
                  key={wallet.walletId}
                  type="button"
                  onClick={() => handleSelectNftWallet(wallet.walletId)}
                  aria-label={label}
                  title={label}
                  className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition-all duration-200 ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/15"
                      : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-white shadow-sm">
                      {chainIcon ? (
                        <img
                          src={chainIcon}
                          alt=""
                          aria-hidden="true"
                          className="h-3.5 w-3.5 object-contain"
                        />
                      ) : (
                        <span className="text-[8px] font-bold uppercase text-slate-950">
                          {String(chainSymbol).slice(0, 3)}
                        </span>
                      )}
                    </span>
                    <span>{chainSymbol}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="text-sm text-slate-400">
              NFTs are currently supported only for Polygon wallets.
            </div>
          )}
        </div>

        {/* Polished Mode Toggle */}
        {browseState.selectedCollectionId === "all" && (
          <div className="mt-1 flex justify-center">
            <div className="relative flex w-full max-w-[300px] items-center rounded-full border border-slate-800/80 bg-slate-950/80 p-1 shadow-xl shadow-black/20 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setBrowseMode(NFT_BROWSE_MODES.COLLECTION)}
                className={`relative z-10 flex-1 rounded-full px-3 py-2 text-[12px] font-semibold transition-all duration-200 ${
                  browseState.mode === NFT_BROWSE_MODES.COLLECTION ? "text-white" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                {browseState.mode === NFT_BROWSE_MODES.COLLECTION && (
                  <motion.div
                    layoutId="activePill"
                    className="absolute inset-0 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/20"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-20 flex items-center justify-center gap-1.5">
                  <LayoutGrid size={14} className={browseState.mode === NFT_BROWSE_MODES.COLLECTION ? "text-white/90" : "text-slate-600"} />
                  Collections
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBrowseMode(NFT_BROWSE_MODES.INDIVIDUAL)}
                className={`relative z-10 flex-1 rounded-full px-3 py-2 text-[12px] font-semibold transition-all duration-200 ${
                  browseState.mode === NFT_BROWSE_MODES.INDIVIDUAL ? "text-white" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                {browseState.mode === NFT_BROWSE_MODES.INDIVIDUAL && (
                  <motion.div
                    layoutId="activePill"
                    className="absolute inset-0 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/20"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-20 flex items-center justify-center gap-1.5">
                  <Layers size={14} className={browseState.mode === NFT_BROWSE_MODES.INDIVIDUAL ? "text-white/90" : "text-slate-600"} />
                  NFTs
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBrowseMode(NFT_BROWSE_MODES.MARKETPLACE)}
                className={`relative z-10 flex-1 rounded-full px-3 py-2 text-[12px] font-semibold transition-all duration-200 ${
                  browseState.mode === NFT_BROWSE_MODES.MARKETPLACE ? "text-white" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                {browseState.mode === NFT_BROWSE_MODES.MARKETPLACE && (
                  <motion.div
                    layoutId="activePill"
                    className="absolute inset-0 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/20"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-20 flex items-center justify-center gap-1.5">
                  <ExternalLink size={14} className={browseState.mode === NFT_BROWSE_MODES.MARKETPLACE ? "text-white/90" : "text-slate-600"} />
                  Market
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Marketplace Sub-navigation */}
        {browseState.mode === NFT_BROWSE_MODES.MARKETPLACE && (
          <div className="flex items-center gap-4 border-b border-white/5 px-1 pb-1 overflow-x-auto no-scrollbar">
            {[
              { id: "all", label: "All Listings" },
              { id: "my_listings", label: "My Listings" },
              { id: "my_orders", label: "My Orders" }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setMktSubMode(tab.id)}
                className={`relative pb-3 text-xs font-bold transition-colors shrink-0 ${
                  mktSubMode === tab.id ? "text-indigo-400" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                {tab.label}
                {mktSubMode === tab.id && (
                  <motion.div
                    layoutId="mktTabLine"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {hasNftSupportedWallets ? (
          <NftSyncBanner message={activeNftViewMessage} />
        ) : null}

        {/* Filters and Controls */}
        {hasNftSupportedWallets ? (
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: "auto", opacity: 1, marginTop: 16 }}
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                className="space-y-4 overflow-hidden"
              >
                {browseState.mode === NFT_BROWSE_MODES.COLLECTION && browseState.selectedCollectionId === "all" ? (
                  <NftBrowseControls
                    eyebrow="Filter Collections"
                    title={`Displaying ${nftCollections.length} matches`}
                    resultCount={nftCollectionsMeta?.total ?? nftCollections.length}
                    searchLabel="Search collections"
                    searchPlaceholder="Search by name or contract..."
                    searchValue={browseState.collections.search}
                    onSearchChange={(value) =>
                      updateCollections({ search: value }, { resetPage: true })
                    }
                    standardValue={browseState.collections.standard}
                    onStandardChange={(value) =>
                      updateCollections({ standard: value }, { resetPage: true })
                    }
                    standardOptions={NFT_STANDARD_FILTER_OPTIONS}
                    sortValue={`${browseState.collections.sortBy}:${browseState.collections.sortOrder}`}
                    onSortChange={(value) => {
                      const [sortBy, sortOrder] = String(value || ":desc").split(":");
                      updateCollections(
                        { sortBy, sortOrder: sortOrder || "desc" },
                        { resetPage: true },
                      );
                    }}
                    sortOptions={NFT_COLLECTION_SORT_OPTIONS}
                    showHidden={browseState.collections.showHidden}
                    onToggleHidden={() =>
                      updateCollections(
                        (current) => ({ showHidden: !current.showHidden }),
                        { resetPage: true },
                      )
                    }
                    showSpam={browseState.collections.showSpam}
                    onToggleSpam={() =>
                      updateCollections(
                        (current) => ({ showSpam: !current.showSpam }),
                        { resetPage: true },
                      )
                    }
                  />
                ) : browseState.selectedCollectionId === "all" ? (
                  <NftBrowseControls
                    eyebrow="Filter NFTs"
                    title={`Displaying ${nfts.length} matches`}
                    resultCount={nftMeta?.total ?? nfts.length}
                    searchLabel="Search individual tokens"
                    searchPlaceholder="Search by name, token id, or collection..."
                    searchValue={browseState.list.search}
                    onSearchChange={(value) =>
                      updateList({ search: value }, { resetPage: true })
                    }
                    standardValue={browseState.list.standard}
                    onStandardChange={(value) =>
                      updateList({ standard: value }, { resetPage: true })
                    }
                    standardOptions={NFT_STANDARD_FILTER_OPTIONS}
                    sortValue={`${browseState.list.sortBy}:${browseState.list.sortOrder}`}
                    onSortChange={(value) => {
                      const [sortBy, sortOrder] = String(value || ":desc").split(":");
                      updateList(
                        { sortBy, sortOrder: sortOrder || "desc" },
                        { resetPage: true },
                      );
                    }}
                    sortOptions={NFT_LIST_SORT_OPTIONS}
                    showHidden={browseState.list.showHidden}
                    onToggleHidden={() =>
                      updateList((current) => ({ showHidden: !current.showHidden }), {
                        resetPage: true,
                      })
                    }
                    showSpam={browseState.list.showSpam}
                    onToggleSpam={() =>
                      updateList((current) => ({ showSpam: !current.showSpam }), {
                        resetPage: true,
                      })
                    }
                  />
                ) : browseState.mode === NFT_BROWSE_MODES.MARKETPLACE && mktSubMode === "all" ? (
                  <NftBrowseControls
                    eyebrow="Marketplace"
                    title={`Global Listings`}
                    resultCount={marketplaceMeta?.total ?? 0}
                    searchLabel="Search"
                    searchPlaceholder="Filter listings..."
                    searchValue={browseState.marketplace.contractAddress}
                    onSearchChange={(v) => updateMarketplace({ contractAddress: v }, { resetPage: true })}
                    sortValue={browseState.marketplace.sortBy}
                    onSortChange={(v) => updateMarketplace({ sortBy: v }, { resetPage: true })}
                    sortOptions={NFT_MARKETPLACE_SORT_OPTIONS}
                  />
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        ) : null}

        {/* Section Header */}
        {browseState.selectedCollectionId === "all" && (
          <div className="flex items-center justify-between gap-3 px-1 pt-1">
            <h3 className="text-base font-semibold text-white">
              {browseState.mode === NFT_BROWSE_MODES.COLLECTION ? "Collections" : "NFTs"}
            </h3>
            <div className="rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1">
               <p className="text-[11px] font-semibold text-slate-400">
                {browseState.mode === NFT_BROWSE_MODES.COLLECTION 
                  ? `${nftCollectionsMeta?.total ?? nftCollections.length}` 
                  : `${nftMeta?.total ?? nfts.length}`}
              </p>
            </div>
          </div>
        )}

        {/* Collection Detail Header */}
        {browseState.selectedCollectionId !== "all" && selectedCollectionDetail && (
          <NftCollectionHeaderCard
            collection={selectedCollectionDetail}
            totalItems={selectedCollectionMeta?.total ?? selectedCollectionDetail.count ?? 0}
            onBack={() => handleSelectCollection("all")}
          >
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0, marginTop: 0 }}
                  animate={{ height: "auto", opacity: 1, marginTop: 16 }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <NftBrowseControls
                    eyebrow="Inside Collection"
                    title="Collection detail controls"
                    resultCount={
                      selectedCollectionMeta?.total ??
                      selectedCollectionDetail.count ??
                      selectedCollectionItems.length
                    }
                    searchLabel="Search inside collection"
                    searchPlaceholder="Search by NFT name or token id"
                    searchValue={browseState.detail.search}
                    onSearchChange={(value) =>
                      updateDetail({ search: value }, { resetPage: true })
                    }
                    standardValue={browseState.detail.standard}
                    onStandardChange={(value) =>
                      updateDetail({ standard: value }, { resetPage: true })
                    }
                    standardOptions={NFT_STANDARD_FILTER_OPTIONS}
                    sortValue={`${browseState.detail.sortBy}:${browseState.detail.sortOrder}`}
                    onSortChange={(value) => {
                      const [sortBy, sortOrder] = String(value || ":desc").split(":");
                      updateDetail(
                        { sortBy, sortOrder: sortOrder || "desc" },
                        { resetPage: true },
                      );
                    }}
                    sortOptions={NFT_COLLECTION_DETAIL_SORT_OPTIONS}
                    showHidden={browseState.detail.showHidden}
                    onToggleHidden={() =>
                      updateDetail(
                        (current) => ({ showHidden: !current.showHidden }),
                        { resetPage: true },
                      )
                    }
                    showSpam={browseState.detail.showSpam}
                    onToggleSpam={() =>
                      updateDetail(
                        (current) => ({ showSpam: !current.showSpam }),
                        { resetPage: true },
                      )
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </NftCollectionHeaderCard>
        )}

        {/* Main Content Area */}
        <AnimatePresence mode="wait">
          {!hasNftSupportedWallets ? (
            <motion.div
              key="no-wallets"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center text-slate-400"
            >
              NFTs are currently supported only for Polygon wallets.
            </motion.div>
          ) : browseState.selectedCollectionId !== "all" &&
            selectedCollectionLoading &&
            !selectedCollectionDetail ? (
            <motion.div
              key="loading-collection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center text-slate-400 animate-pulse"
            >
              Loading collection...
            </motion.div>
          ) : browseState.selectedCollectionId !== "all" && selectedCollectionError ? (
            <motion.div
              key="collection-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 text-center text-rose-300"
            >
              {selectedCollectionError}
            </motion.div>
          ) : nftsLoading && nfts.length === 0 ? (
            <motion.div
              key="loading-nfts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center text-slate-400 animate-pulse"
            >
              Loading NFTs...
            </motion.div>
          ) : nftsError ? (
            <motion.div
              key="nfts-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 text-center text-rose-300"
            >
              {nftsError}
            </motion.div>
          ) : browseState.mode === NFT_BROWSE_MODES.MARKETPLACE ? (
            <motion.div
              key="marketplace-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* All Listings Grid */}
              {mktSubMode === "all" && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {marketplaceListings.map((listing) => (
                    <NftCard
                      key={listing.orderId}
                      nft={{
                        ...listing.token,
                        price: `${formatWeiToMatic(listing.priceInWei)} MATIC`
                      }}
                      onOpen={() => handleOpenListingBuy(listing)}
                    />
                  ))}
                </div>
              )}

              {/* My Listings Grid */}
              {mktSubMode === "my_listings" && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {myListings.map((listing) => (
                    <NftCard
                      key={listing.orderId}
                      nft={{
                        ...listing.token,
                        price: `${formatWeiToMatic(listing.priceInWei)} MATIC`
                      }}
                      onOpen={() => handleOpenListingCancel(listing)}
                    />
                  ))}
                </div>
              )}

              {/* My Orders / History */}
              {mktSubMode === "my_orders" && (
                <div className="space-y-4">
                  {myOrders.length === 0 && !myOrdersLoading && (
                    <div className="py-20 text-center space-y-4">
                      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-slate-700">
                        <ExternalLink size={32} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">No orders yet</p>
                        <p className="text-xs text-slate-500">Your marketplace history will appear here.</p>
                      </div>
                    </div>
                  )}
                  {myOrders.map((order) => (
                    <div key={order.orderId || order._id} className="bg-slate-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden border border-white/5">
                          <img src={order.token?.imageUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{order.token?.name || "Unknown NFT"}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Order: {order.orderId}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-indigo-400">{formatWeiToMatic(order.priceInWei)} MATIC</p>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${order.status === "completed" ? "text-emerald-500" : "text-amber-500"}`}>
                          {order.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(marketplaceLoading || myListingsLoading || myOrdersLoading) && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="aspect-square rounded-2xl bg-slate-900/50 animate-pulse border border-white/5" />
                  ))}
                </div>
              )}
            </motion.div>
          ) : browseState.selectedCollectionId === "all" &&
            browseState.mode === NFT_BROWSE_MODES.COLLECTION ? (
            <motion.div
              key="collection-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              {nftCollections.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <LayoutGrid size={24} className="text-slate-500" />
                  </div>
                  <p className="text-white font-bold">No collections found</p>
                  <p className="text-slate-400 text-sm mt-1">
                    This wallet doesn&apos;t have any NFT collections yet.
                  </p>
                </div>
              ) : (
                nftCollections.map((collection) => (
                  <NftCollectionGroupCard
                    key={getCollectionKey(collection)}
                    collection={collection}
                    onClick={handleSelectCollection}
                  />
                ))
              )}
            </motion.div>
          ) : nfts.length === 0 ? (
            <motion.div
              key="no-nfts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center"
            >
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Layers size={24} className="text-slate-500" />
              </div>
              <p className="text-white font-bold">No NFTs found</p>
              <p className="text-slate-400 text-sm mt-1">
                This wallet doesn&apos;t have any individual NFTs yet.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="nft-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-2 gap-x-4 gap-y-5"
            >
              {activeNftGridItems.map((nft) => (
                <NftCard key={nft.id} nft={nft} onOpen={handleOpenNftDetail} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pagination */}
        {browseState.selectedCollectionId === "all" && browseState.mode === NFT_BROWSE_MODES.COLLECTION ? (
          <NftPaginationControls
             page={Number(nftCollectionsMeta?.page || browseState.collections.page) || 1}
             totalPages={resolvePaginationTotalPages({
               page: nftCollectionsMeta?.page || browseState.collections.page,
               totalPages: nftCollectionsMeta?.totalPages,
               total: nftCollectionsMeta?.total,
               limit: nftCollectionsMeta?.limit || browseState.collections.limit,
               hasMore: nftCollectionsMeta?.hasMore,
             })}
             hasMore={Boolean(nftCollectionsMeta?.hasMore)}
             onPrevious={() => updateCollections((current) => ({ page: Math.max(1, current.page - 1) }))}
             onNext={() => updateCollections((current) => ({ page: current.page + 1 }))}
          />
        ) : browseState.selectedCollectionId === "all" && browseState.mode === NFT_BROWSE_MODES.INDIVIDUAL ? (
          <NftPaginationControls
            page={Number(nftMeta?.page || browseState.list.page) || 1}
            totalPages={flatListTotalPages}
            hasMore={Boolean(nftMeta?.hasMore)}
            onPrevious={() =>
              updateList((current) => ({ page: Math.max(1, current.page - 1) }))
            }
            onNext={() => updateList((current) => ({ page: current.page + 1 }))}
          />
        ) : browseState.mode === NFT_BROWSE_MODES.MARKETPLACE ? (
          <NftPaginationControls
            page={Number(
              mktSubMode === "all" ? (marketplaceMeta?.page || browseState.marketplace.page) :
              mktSubMode === "my_listings" ? (myListingsMeta?.page || browseState.myListings.page) :
              (myOrdersMeta?.page || browseState.myOrders.page)
            ) || 1}
            totalPages={resolvePaginationTotalPages({
              page: mktSubMode === "all" ? (marketplaceMeta?.page || browseState.marketplace.page) :
                    mktSubMode === "my_listings" ? (myListingsMeta?.page || browseState.myListings.page) :
                    (myOrdersMeta?.page || browseState.myOrders.page),
              total: mktSubMode === "all" ? marketplaceMeta?.total :
                     mktSubMode === "my_listings" ? myListingsMeta?.total :
                     myOrdersMeta?.total,
              limit: mktSubMode === "all" ? (marketplaceMeta?.limit || 24) :
                     mktSubMode === "my_listings" ? (myListingsMeta?.limit || 24) :
                     (myOrdersMeta?.limit || 24),
              hasMore: mktSubMode === "all" ? marketplaceMeta?.hasMore :
                       mktSubMode === "my_listings" ? myListingsMeta?.hasMore :
                       myOrdersMeta?.hasMore,
            })}
            hasMore={Boolean(
              mktSubMode === "all" ? marketplaceMeta?.hasMore :
              mktSubMode === "my_listings" ? myListingsMeta?.hasMore :
              myOrdersMeta?.hasMore
            )}
            onPrevious={() => {
              if (mktSubMode === "all") updateMarketplace((current) => ({ page: Math.max(1, current.page - 1) }));
              else if (mktSubMode === "my_listings") updateMyListings((current) => ({ page: Math.max(1, current.page - 1) }));
              else updateMyOrders((current) => ({ page: Math.max(1, current.page - 1) }));
            }}
            onNext={() => {
              if (mktSubMode === "all") updateMarketplace((current) => ({ page: current.page + 1 }));
              else if (mktSubMode === "my_listings") updateMyListings((current) => ({ page: current.page + 1 }));
              else updateMyOrders((current) => ({ page: current.page + 1 }));
            }}
          />
        ) : selectedCollectionMeta ? (
          <NftPaginationControls
            page={Number(selectedCollectionMeta?.page || browseState.detail.page) || 1}
            totalPages={resolvePaginationTotalPages({
              page: selectedCollectionMeta?.page || browseState.detail.page,
              totalPages: selectedCollectionMeta?.totalPages,
              total: selectedCollectionMeta?.total,
              limit: selectedCollectionMeta?.limit || browseState.detail.limit,
              hasMore: selectedCollectionMeta?.hasMore,
            })}
            hasMore={Boolean(selectedCollectionMeta?.hasMore)}
            onPrevious={() =>
              updateDetail((current) => ({ page: Math.max(1, current.page - 1) }))
            }
            onNext={() => updateDetail((current) => ({ page: current.page + 1 }))}
          />
        ) : null}
      </div>

    </motion.div>
  );
}
