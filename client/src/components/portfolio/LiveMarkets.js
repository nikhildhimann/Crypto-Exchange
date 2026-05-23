import { ArrowLeft, Search, TrendingDown, TrendingUp, Info, Star, ChevronRight, Activity, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";

// Local Assets/Lib
import cryptoWalletLogo from "../../img/crypto-wallet-logo.png";
import btcLogo from "../../img/btc.png";
import adaLogo from "../../img/cardano-ada.webp";
// import dogeLogo from "../../img/dog.webp"; // Temporarily disabled while Dogecoin support is commented out.
import avaxLogo from "../../img/avax.webp";
import ethLogo from "../../img/eth.png";
import hbarLogo from "../../img/hedera.webp";
import xrpLogo from "../../img/xrp.png";
import usdtLogo from "../../img/usdt.png";
import solLogo from "../../img/sol.png";
import { fetchMarketPrices, fetchMarketChart } from "../../api/market";
import { useAppContext } from "../../contexts/AppContext";
import normalizeAssetMarketData, { DEFAULT_WATCHLIST } from "../../lib/assets";
import { runtimeConfig } from "../../lib/runtimeConfig";

const LOGO_MAP = {
  BTC: btcLogo,
  ADA: adaLogo,
  ETH: ethLogo,
  AVAX: avaxLogo,
  HBAR: hbarLogo,
  // DOGE: dogeLogo, // Temporarily disabled while Dogecoin support is commented out.
  XRP: xrpLogo,
  USDT: usdtLogo,
  SOL: solLogo,
};

const WATCHLIST_META_BY_SYMBOL = DEFAULT_WATCHLIST.reduce((acc, asset) => {
  acc[asset.symbol] = asset;
  return acc;
}, {});

const EMPTY_ASSET = Object.freeze({
  id: "",
  symbol: "",
  name: "",
  icon: cryptoWalletLogo,
  color: "#6366f1",
  price: 0,
  priceUsd: 0,
  change: 0,
  change24h: 0,
  fiatValue: 0,
  usdValue: 0,
  isLoading: true,
});

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function toFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function resolvePreferredSelectedAssetId(items = [], activeWallet = null) {
  const activeWalletId = String(activeWallet?.walletId || activeWallet?.id || "").trim();
  const normalizedActiveSymbol = normalizeSymbol(activeWallet?.asset);

  return (
    items.find((asset) => String(asset?.walletId || "").trim() === activeWalletId)?.id ||
    items.find((asset) => asset.symbol === normalizedActiveSymbol)?.id ||
    items[0]?.id ||
    ""
  );
}

function createMarketItem(baseAsset = {}, marketData = null, options = {}) {
  const symbol = normalizeSymbol(baseAsset.symbol || baseAsset.asset);
  const fallbackMeta = WATCHLIST_META_BY_SYMBOL[symbol] || {};
  const mergedMarket =
    marketData && typeof marketData === "object"
      ? {
          ...(baseAsset.market && typeof baseAsset.market === "object" ? baseAsset.market : {}),
          ...marketData,
        }
      : baseAsset.market;

  const normalized = normalizeAssetMarketData({
    ...fallbackMeta,
    ...baseAsset,
    symbol,
    market: mergedMarket,
  });

  const priceUsd = toFiniteNumber(normalized?.priceUsd);
  const change24h = toFiniteNumber(normalized?.change24h ?? normalized?.change);
  const fiatValue = toFiniteNumber(
    options.fiatValue ?? normalized?.fiatValue ?? baseAsset?.fiatValue ?? normalized?.usdValue,
  );
  const usdValue = toFiniteNumber(
    options.usdValue ?? normalized?.usdValue ?? baseAsset?.usdValue ?? fiatValue,
  );

  return {
    ...normalized,
    id: baseAsset.id || normalized?.id || symbol.toLowerCase(),
    symbol,
    name: baseAsset.name || normalized?.name || fallbackMeta.name || symbol,
    icon:
      baseAsset.icon ||
      baseAsset.iconUrl ||
      normalized?.icon ||
      normalized?.iconUrl ||
      LOGO_MAP[symbol] ||
      cryptoWalletLogo,
    color: baseAsset.color || normalized?.color || fallbackMeta.color || "#6366f1",
    priceUsd,
    change24h,
    change: change24h,
    price: priceUsd,
    fiatValue,
    usdValue,
    isLoading: Boolean(options.isLoading),
  };
}

function createFallbackWatchlistItem(asset = {}) {
  return createMarketItem(
    {
      ...asset,
      id: normalizeSymbol(asset.symbol).toLowerCase(),
      icon: LOGO_MAP[normalizeSymbol(asset.symbol)] || cryptoWalletLogo,
      market: {
        priceUsd: 0,
        change24h: 0,
      },
    },
    null,
    {
      fiatValue: 0,
      usdValue: 0,
      isLoading: true,
    },
  );
}

function buildWalletDerivedMarketList(wallets = []) {
  const marketAssetsByKey = new Map();

  for (const wallet of wallets) {
    const normalizedWallet = normalizeAssetMarketData(wallet);
    const symbol = normalizeSymbol(
      wallet?.asset ||
      wallet?.chainMeta?.nativeAssetSymbol ||
      wallet?.chainMeta?.symbol ||
      normalizedWallet?.symbol,
    );

    if (!symbol) {
      continue;
    }

    // Key by chain:symbol so chains sharing the same native symbol (e.g. ETH
    // on both Ethereum and Arbitrum) each get their own market row.
    const chain = String(wallet?.chain || normalizedWallet?.chain || "").toLowerCase();
    const groupKey = chain ? `${chain}:${symbol}` : symbol;

    const existingAsset = marketAssetsByKey.get(groupKey);
    const fallbackMeta = WATCHLIST_META_BY_SYMBOL[symbol] || {};
    const chainSymbol = normalizeSymbol(
      wallet?.chainMeta?.symbol || wallet?.chainMeta?.nativeAssetSymbol,
    );
    const preferredName =
      existingAsset?.name ||
      (wallet?.chainMeta?.name || wallet?.chainName || "") ||
      fallbackMeta.name ||
      wallet?.asset ||
      normalizedWallet?.symbol ||
      symbol;

    const walletIdentity =
      wallet?.walletId || wallet?.id || normalizedWallet?.id || "";

    marketAssetsByKey.set(
      groupKey,
      createMarketItem(
        {
          ...(existingAsset || {}),
          ...normalizedWallet,
          id:
            existingAsset?.id ||
            walletIdentity ||
            (chain ? `${chain}:${symbol.toLowerCase()}` : symbol.toLowerCase()),
          symbol,
          name: preferredName,
          icon:
            existingAsset?.icon ||
            wallet?.icon ||
            wallet?.iconUrl ||
            normalizedWallet?.icon ||
            normalizedWallet?.iconUrl ||
            LOGO_MAP[symbol] ||
            cryptoWalletLogo,
          color:
            existingAsset?.color ||
            wallet?.chainMeta?.color ||
            fallbackMeta.color ||
            normalizedWallet?.color ||
            "#6366f1",
          market:
            normalizedWallet?.market ||
            existingAsset?.market || {
              priceUsd: toFiniteNumber(normalizedWallet?.priceUsd),
              change24h: toFiniteNumber(normalizedWallet?.change24h ?? normalizedWallet?.change),
            },
        },
        null,
        {
          fiatValue:
            toFiniteNumber(existingAsset?.fiatValue) + toFiniteNumber(normalizedWallet?.fiatValue),
          usdValue:
            toFiniteNumber(existingAsset?.usdValue) +
            toFiniteNumber(normalizedWallet?.usdValue ?? normalizedWallet?.fiatValue),
          isLoading: true,
        },
      ),
    );
  }

  return Array.from(marketAssetsByKey.values());
}

export function LiveMarkets() {
  const navigate = useNavigate();
  const { walletCards, visibleWalletCards, activeWallet } = useAppContext();

  const walletSource = useMemo(
    () => (visibleWalletCards?.length ? visibleWalletCards : walletCards || []),
    [visibleWalletCards, walletCards],
  );

  const marketBaseItems = useMemo(() => {
    const walletDerivedItems = buildWalletDerivedMarketList(walletSource);

    if (walletDerivedItems.length) {
      return walletDerivedItems;
    }

    return DEFAULT_WATCHLIST.map(createFallbackWatchlistItem);
  }, [walletSource]);

  const [watchlist, setWatchlist] = useState(marketBaseItems);
  const [selectedAssetId, setSelectedAssetId] = useState(() =>
    resolvePreferredSelectedAssetId(marketBaseItems, activeWallet),
  );
  const [chartData, setChartData] = useState([]);
  const [isLoadingChart, setIsLoadingChart] = useState(true);

  useEffect(() => {
    setWatchlist((prev) =>
      marketBaseItems.map((asset) => {
        const existingAsset = prev.find((entry) => entry.id === asset.id);

        if (!existingAsset) {
          return asset;
        }

        return {
          ...existingAsset,
          ...asset,
          price: existingAsset.price,
          priceUsd: existingAsset.priceUsd,
          change: existingAsset.change,
          change24h: existingAsset.change24h,
          isLoading: existingAsset.isLoading,
        };
      }),
    );
  }, [marketBaseItems]);

  // 1. Fetch watchlist prices for the current real wallet symbols (or the default fallback list)
  useEffect(() => {
    let isMounted = true;
    const symbols = Array.from(new Set(marketBaseItems.map((asset) => asset.symbol).filter(Boolean)));

    if (!symbols.length) {
      setWatchlist([]);
      return () => {
        isMounted = false;
      };
    }

    async function loadPrices() {
      try {
        const prices = await fetchMarketPrices(symbols);
        if (!isMounted) return;

        setWatchlist((prev) =>
          marketBaseItems.map((asset) => {
            const existingAsset = prev.find((entry) => entry.id === asset.id);
            return createMarketItem(
              {
                ...(existingAsset || {}),
                ...asset,
              },
              prices?.[asset.symbol],
              {
                fiatValue: asset.fiatValue,
                usdValue: asset.usdValue,
                isLoading: false,
              },
            );
          }),
        );
      } catch (err) {
        console.error("Failed to fetch market prices:", err);
        if (!isMounted) return;

        setWatchlist((prev) =>
          marketBaseItems.map((asset) => {
            const existingAsset = prev.find((entry) => entry.id === asset.id);
            return createMarketItem(
              {
                ...(existingAsset || {}),
                ...asset,
              },
              null,
              {
                fiatValue: asset.fiatValue,
                usdValue: asset.usdValue,
                isLoading: false,
              },
            );
          }),
        );
      }
    }

    loadPrices();
    const interval = setInterval(loadPrices, runtimeConfig.marketPriceRefreshIntervalMs);
    return () => { isMounted = false; clearInterval(interval); };
  }, [marketBaseItems]);

  useEffect(() => {
    if (!watchlist.length) {
      if (selectedAssetId) {
        setSelectedAssetId("");
      }
      return;
    }

    const stillExists = watchlist.some((asset) => asset.id === selectedAssetId);
    if (stillExists) {
      return;
    }

    const nextSelectedAssetId = resolvePreferredSelectedAssetId(watchlist, activeWallet);

    if (nextSelectedAssetId && nextSelectedAssetId !== selectedAssetId) {
      setSelectedAssetId(nextSelectedAssetId);
    }
  }, [watchlist, selectedAssetId, activeWallet]);

  const selectedAsset = useMemo(
    () =>
      watchlist.find((asset) => asset.id === selectedAssetId) ||
      watchlist[0] ||
      EMPTY_ASSET,
    [watchlist, selectedAssetId],
  );

  // 3. Fetch Chart Data
  useEffect(() => {
    if (!selectedAsset?.symbol) {
      setChartData([]);
      setIsLoadingChart(false);
      return;
    }

    let isMounted = true;

    async function loadChart() {
      setIsLoadingChart(true);
      try {
        const data = await fetchMarketChart(selectedAsset.symbol, "1D");
        if (isMounted) {
          setChartData(Array.isArray(data) ? data : []);
          setIsLoadingChart(false);
        }
      } catch (err) {
        console.error("Failed to fetch chart:", err);
        if (isMounted) {
          setChartData([]);
          setIsLoadingChart(false);
        }
      }
    }

    loadChart();
    return () => { isMounted = false; };
  }, [selectedAsset?.symbol]);

  // 4. Generate Candlestick Data from real points
  const { candleData, maPath, maPoints } = useMemo(() => {
    if (!chartData || chartData.length < 5) {
      return { candleData: [], maPath: "", maPoints: [] };
    }

    const count = 25; 
    const width = 8;
    const gap = 6;
    const startX = 15;
    
    // Group raw points into buckets to form candles
    const pointsPerCandle = Math.floor(chartData.length / count) || 1;
    
    const candles = [];
    for (let i = 0; i < count; i++) {
        const startIdx = i * pointsPerCandle;
        const bucket = chartData.slice(startIdx, startIdx + pointsPerCandle);
        if (bucket.length === 0) continue;

        const prices = bucket.map(p => p.price);
        const open = bucket[0].price;
        const close = bucket[bucket.length - 1].price;
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        
        candles.push({ open, close, high, low, x: startX + i * (width + gap), width });
    }

    // Normalize Y coordinates (Viewbox 400x180)
    const allPrices = chartData.map(p => p.price);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = (maxPrice - minPrice) || 1;

    const normalizeY = (p) => 160 - ((p - minPrice) / priceRange) * 120;

    const formattedCandles = candles.map(c => ({
        ...c,
        high: normalizeY(c.high),
        low: normalizeY(c.low),
        open: normalizeY(c.open),
        close: normalizeY(c.close),
        isUp: c.close < c.open // Lower Y means higher price
    }));

    const maPoints = formattedCandles.map((d) => ({
       x: d.x + d.width/2, 
       y: (d.open + d.close) / 2
    }));

    const maPath = maPoints.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(' ');

    return { candleData: formattedCandles, maPath, maPoints };
  }, [chartData]);

  const currentPriceY = candleData.length > 0 ? candleData[candleData.length - 1].close : 90;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="aura-container !bg-slate-950 min-h-screen"
    >
      <section className="markets-header-section sticky top-0 z-50">
        <div className="markets-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button">
            <ArrowLeft size={20} />
          </button>
          <h1 className="aura-header-title">Live Markets</h1>
          <button className="aura-header-button">
             <Search size={18} />
          </button>
        </div>
      </section>

      <div className="px-6 pt-6 space-y-10 pb-20">
        <section className="markets-intro-section">
          <div className="markets-intro-inner space-y-1 px-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] leading-relaxed">Interactive 24h performance index based on real-time market data.</p>
          </div>
        </section>
        
         {/* Main Performance Index Card */}
         <section className="markets-chart-section">
           <div className="markets-chart-inner">
             <motion.div 
                key={selectedAsset.id || selectedAsset.symbol}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900 border border-white/5 relative overflow-hidden shadow-2xl backdrop-blur-xl rounded-[2.5rem] p-4 mx-1"
             >
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] opacity-10 pointer-events-none" style={{ backgroundColor: selectedAsset.color }} />
           
           <div className="flex items-center justify-between relative z-10 mb-4 px-2">
              <div className="flex items-center space-x-3">
                 <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/10 shadow-lg p-2.5 bg-white/5">
                    <img src={selectedAsset.icon} className="w-full h-full object-contain" alt={selectedAsset.name} />
                 </div>
                 <div className="flex flex-col">
                    <h2 className="text-base font-black text-white leading-tight">{selectedAsset.symbol}</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedAsset.name}</p>
                 </div>
              </div>
              <div className="text-right flex flex-col items-end">
                 <h3 className="text-lg font-black text-white leading-tight">${selectedAsset.price > 0 ? selectedAsset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "---"}</h3>
                 <div className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mt-1 inline-block ${selectedAsset.change >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {selectedAsset.change > 0 ? '+' : ''}{selectedAsset.change.toFixed(2)}%
                 </div>
              </div>
           </div>
 
           <div className="relative h-72 w-full bg-slate-950/40 rounded-3xl border border-white/5 overflow-hidden">
              <AnimatePresence mode="wait">
                {isLoadingChart ? (
                   <motion.div 
                    key="loader"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center"
                   >
                      <RefreshCw size={24} className="text-indigo-500 animate-spin opacity-40" />
                   </motion.div>
                ) : (
                  <motion.svg 
                    key="svg"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="w-full h-full" viewBox="0 0 400 180" preserveAspectRatio="none"
                  >
                    {[0, 30, 60, 90, 120, 150].map((y) => (
                        <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#2b2b2b" strokeWidth="0.5" />
                    ))}
                    
                    <line x1="0" y1={currentPriceY} x2="400" y2={currentPriceY} stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
                    
                    {candleData.map((d, i) => {
                        const color = d.isUp ? "#10b981" : "#ef4444";
                        return (
                          <g key={i}>
                              <line x1={d.x + d.width/2} y1={d.high} x2={d.x + d.width/2} y2={d.low} stroke={color} strokeWidth="1" />
                              <rect x={d.x} y={Math.min(d.open, d.close)} width={d.width} height={Math.max(2, Math.abs(d.open - d.close))} fill={color} />
                          </g>
                        );
                    })}

                    {maPath && (
                      <g>
                        <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, ease: "easeInOut" }}
                            d={maPath} fill="none" stroke="#10b981" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" className="opacity-15 blur-[6px]" />
                        <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, ease: "easeInOut" }}
                            d={maPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" className="opacity-95" />
                      </g>
                    )}

                    {!isLoadingChart && maPoints.length > 0 && (
                      <motion.g animate={{ x: [0, 380] }} transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}>
                        <line x1="0" y1="0" x2="0" y2="150" stroke="rgba(99, 102, 241, 0.4)" strokeWidth="0.5" />
                        <motion.circle r="4" fill="#6366f1" cx="0" animate={{ cy: maPoints.map(p => p.y) }} 
                          transition={{ duration: 10, repeat: Infinity, ease: 'linear', times: maPoints.map((_, i) => i / (maPoints.length - 1)) }}
                          className="blur-[4px]" />
                        <circle r="2" fill="white" cx="0" className="opacity-80 blur-[0.5px]" />
                      </motion.g>
                    )}
                  </motion.svg>
                )}
              </AnimatePresence>
           </div>
          </motion.div>
        </div>
      </section>

        {/* Watchlist Section */}
        <section className="markets-watchlist-section">
          <div className="markets-watchlist-inner space-y-6">
             <div className="flex items-center justify-between px-2">
                <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">Your Live Watchlist</h4>
                <button className="text-[10px] font-black uppercase tracking-widest text-indigo-400">View All</button>
             </div>

             <div className="grid grid-cols-1 gap-4">
                {watchlist.map((asset) => (
                   <motion.div 
                      whileTap={{ scale: 0.98 }}
                      key={asset.id || asset.symbol}
                      onClick={() => !asset.isLoading && setSelectedAssetId(asset.id)}
                      className={`bg-slate-900 border p-5 rounded-[2.5rem] flex items-center justify-between transition-all cursor-pointer group ${selectedAsset.id === asset.id ? 'border-indigo-500 bg-indigo-500/5 shadow-2xl shadow-indigo-600/10' : 'border-white/5 hover:border-white/10'}`}
                   >
                      <div className="flex items-center space-x-5">
                         <div className="relative">
                            <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 p-3 group-hover:scale-110 transition-transform">
                               <img src={asset.icon} className="w-full h-full object-contain" alt={asset.name} />
                            </div>
                            {selectedAsset.id === asset.id && (
                               <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center border-2 border-slate-950">
                                  <Activity size={10} className="text-white animate-pulse" />
                               </div>
                            )}
                         </div>
                         <div>
                            <h4 className="text-base font-black text-white uppercase tracking-tight">{asset.symbol}</h4>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{asset.name}</p>
                         </div>
                      </div>

                      <div className="text-right">
                         {asset.isLoading ? (
                            <div className="space-y-2 flex flex-col items-end">
                               <div className="w-20 h-4 bg-slate-800 rounded animate-pulse" />
                               <div className="w-12 h-3 bg-slate-800 rounded animate-pulse" />
                            </div>
                         ) : (
                            <>
                              <p className="text-base font-black text-white">${asset.price > 0 ? asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "---"}</p>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${asset.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                 {asset.change > 0 ? '+' : ''}{asset.change.toFixed(2)}%
                              </span>
                            </>
                         )}
                      </div>
                   </motion.div>
                ))}
             </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
