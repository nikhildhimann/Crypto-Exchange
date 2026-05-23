import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  PieChart as PieChartIcon,
  TrendingUp,
  LayoutGrid,
  Coins,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useAppContext } from "../../contexts/AppContext";
import { motion, AnimatePresence } from "motion/react";
import { NftSyncBanner, getNftSyncMessage } from "../nft/NftSyncBanner";

function formatBalance(value) {
  const num = Number(value || 0);
  if (num === 0) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function getDisplayFiatValue(value) {
  return Number(value || 0) || 0;
}

function getAssetBadge(asset = {}) {
  return String(asset.displayKind || asset.assetType || "").toLowerCase() === "token"
    ? {
      label: asset.displayKindLabel || "Token",
      className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
    }
    : {
      label: asset.displayKindLabel || "Native",
      className: "bg-indigo-500/10 border-indigo-500/20 text-indigo-300",
    };
}

export function Portfolio() {
  const navigate = useNavigate();
  const {
    assets,
    portfolioRows,
    visibleAssetsTotalFiat,
    nfts,
    nftMeta,
    nftSync,
    nftsLoading,
    nftsSyncing,
    nftCollections,
    nftRefreshPending,
    nftSupportedWallets,
    selectedNftWallet,
    selectedNftWalletId,
    setSelectedNftWallet,
    refreshBalances,
    fiatCurrency,
    balancesLoading,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState("assets");

  const totalBalance = Number(visibleAssetsTotalFiat || 0) || 0;
  const shouldHidePortfolioBalance = !assets.length && balancesLoading;

  const hasNftSupportedWallets = nftSupportedWallets.length > 0;
  const currentNftWallet = selectedNftWallet || nftSupportedWallets[0] || null;
  const currentNftWalletId = currentNftWallet?.walletId || "";
  const currentNftSync =
    nftMeta?.walletId === currentNftWalletId ? nftSync || nftMeta?.sync || null : null;
  const currentNftMessage = getNftSyncMessage(currentNftSync);

  useEffect(() => {
    refreshBalances().catch(() => null);
  }, [refreshBalances]);

  function handleSelectNftWallet(walletId) {
    if (!walletId || walletId === selectedNftWalletId) return;
    setSelectedNftWallet(walletId);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="aura-container"
    >
      <section className="portfolio-header-section sticky top-0 z-50">
        <div className="portfolio-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft
              size={20}
              className="group-hover:-translate-x-0.5 transition-transform"
            />
          </button>
          <h1 className="aura-header-title">Portfolio</h1>
          <button className="aura-header-button">
            <PieChartIcon size={20} />
          </button>
        </div>
      </section>

      <div className="px-5 mt-4 space-y-6">
        <section className="portfolio-balance-section">
          <div className="portfolio-balance-inner">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full h-48 bg-gradient-to-br from-slate-900 to-indigo-950 rounded-3xl border border-indigo-500/20 relative overflow-hidden shadow-xl"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full -translate-y-20 translate-x-20 blur-3xl" />
              <div className="absolute inset-0 p-6 flex flex-col justify-between z-10">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-400">Net Worth</p>
                  <h2 className="text-4xl font-extrabold text-white">
                    {shouldHidePortfolioBalance
                      ? ""
                      : `${fiatCurrency}${totalBalance.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                  </h2>
                </div>
                <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md w-max px-3 py-1.5 rounded-full">
                  <TrendingUp size={16} className="text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400">Live Portfolio</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="portfolio-filters-section">
          <div className="portfolio-filters-inner flex justify-between items-center bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800">
            {["1D", "7D", "1M", "1Y", "ALL"].map((period) => (
              <button
                key={period}
                className={`px-4 py-2 rounded-xl text-[10px] font-extrabold transition-all ${period === "1D"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                    : "text-slate-500 hover:text-white"
                  }`}
              >
                {period}
              </button>
            ))}
          </div>
        </section>

        <section className="portfolio-tabs-section">
          <div className="portfolio-tabs-inner flex p-1.5 bg-slate-900 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab("assets")}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === "assets"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-slate-300"
                }`}
            >
              <Coins size={18} />
              <span>Assets</span>
            </button>
            <button
              onClick={() => setActiveTab("nfts")}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === "nfts"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-slate-300"
                }`}
            >
              <LayoutGrid size={18} />
              <span>NFTs</span>
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === "analytics"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-slate-300"
                }`}
            >
              <PieChartIcon size={18} />
              <span>Analysis</span>
            </button>
          </div>
        </section>

        <section className="portfolio-content-section">
          <div className="portfolio-content-inner">
            <AnimatePresence mode="wait">
              {activeTab === "assets" ? (
                <motion.div
                  key="assets"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-lg font-bold text-white">Token Balances</h3>
                  </div>

                  <div className="space-y-3">
                    {portfolioRows.map((asset) => {
                      const badge = getAssetBadge(asset);

                      return (
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          key={asset.id}
                          onClick={() => navigate(`/app/asset/${asset.id}`)}
                          className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors cursor-pointer shadow-lg"
                        >
                          <div className="flex items-center space-x-4 min-w-0">
                            {asset.iconUrl ? (
                              <img
                                src={asset.iconUrl}
                                alt={asset.name}
                                className="w-12 h-12 rounded-full object-cover shadow-sm shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-400 shrink-0">
                                {asset.symbol.charAt(0)}
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <h4 className="text-base font-bold text-white leading-tight truncate">
                                  {asset.displayTitle || asset.name}
                                </h4>
                                <span
                                  className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-500 truncate">
                                {asset.displaySubtitle ||
                                  `${formatBalance(asset.balance)} ${asset.symbol}`}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-base font-bold text-white leading-tight">
                              {fiatCurrency}
                              {getDisplayFiatValue(asset.fiatValue).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </p>
                            <p
                              className={`text-sm font-medium mt-0.5 ${asset.change >= 0 ? "text-emerald-400" : "text-rose-400"
                                }`}
                            >
                              {asset.change >= 0 ? "+" : ""}
                              {asset.change}%
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ) : activeTab === "nfts" ? (
                <motion.div
                  key="nfts"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 pb-20"
                >
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                        NFT Hub
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-white">
                        Open the dedicated NFT browser
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate("/app/nfts")}
                      className="shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-indigo-500 bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-500 transition-colors"
                    >
                      <span>Open NFTs</span>
                      <ArrowUpRight size={16} />
                    </button>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                    <p className="text-sm text-slate-300">
                      NFT browsing now lives on its own screen with saved search, collection,
                      filter, sort, and pagination state.
                    </p>

                    {hasNftSupportedWallets ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {nftSupportedWallets.map((wallet) => {
                          const isSelected = wallet.walletId === currentNftWalletId;
                          const label =
                            wallet.label ||
                            wallet.name ||
                            wallet.walletLabel ||
                            wallet.chainName ||
                            "Polygon";

                          return (
                            <button
                              key={wallet.walletId}
                              type="button"
                              onClick={() => handleSelectNftWallet(wallet.walletId)}
                              className={`px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all ${
                                isSelected
                                  ? "bg-indigo-600 border-indigo-500 text-white"
                                  : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">
                        NFTs are currently supported only for Polygon wallets.
                      </div>
                    )}

                    {hasNftSupportedWallets ? (
                      <NftSyncBanner message={currentNftMessage} />
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                          Saved NFTs
                        </p>
                        <p className="mt-2 text-2xl font-black text-white">
                          {nftMeta?.total ?? nfts.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                          Collections
                        </p>
                        <p className="mt-2 text-2xl font-black text-white">
                          {nftCollections.length}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">
                          Full browsing, collection drill-down, activity, and transfer tools
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Your current NFT data stays DB-first and sync-aware on the dedicated
                          screen.
                        </p>
                      </div>
                      <LayoutGrid size={18} className="text-slate-500 shrink-0" />
                    </div>

                    {(nftsLoading || nftRefreshPending || nftsSyncing) && hasNftSupportedWallets ? (
                      <p className="text-xs font-semibold text-slate-400">
                        NFT data is refreshing in the background. Opening the dedicated screen
                        will keep your current browsing context intact.
                      </p>
                    ) : null}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6 pb-20"
                >
                  <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 flex flex-col items-center">
                    <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest mb-6">
                      Asset Allocation
                    </h3>

                    <div className="w-48 h-48 rounded-full border-[16px] border-slate-800 relative flex items-center justify-center">
                      <div className="absolute top-0 left-0 w-full h-full border-[16px] border-indigo-500 rounded-full border-t-transparent border-l-transparent -rotate-45" />
                      <div className="absolute top-0 left-0 w-full h-full border-[16px] border-emerald-500 rounded-full border-b-transparent border-r-transparent rotate-12" />
                      <div className="text-center">
                        <p className="text-2xl font-black text-white">100%</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">
                          Diversified
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-8 w-full">
                      {assets.map((a) => (
                        <div key={a.id} className="flex items-center space-x-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: a.color || "#6366f1" }}
                          />
                          <span className="text-xs font-bold text-slate-400">{a.symbol}</span>
                          <span className="text-xs font-black text-white ml-auto">
                            {Math.floor(Math.random() * 40) + 10}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

    </motion.div>
  );
}
