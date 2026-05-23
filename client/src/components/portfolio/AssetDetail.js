import { ArrowLeft, ArrowUpRight, ArrowDownLeft, RefreshCw, TrendingUp, Info, Activity, Globe, ShieldCheck } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { useAppContext } from "../../contexts/AppContext";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useMemo } from "react";
import { fetchMarketChart, fetchMarketStats } from "../../api/market";

export function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { assets, fiatCurrency } = useAppContext();
  const [period, setPeriod] = useState("1D");
  const [chartData, setChartData] = useState([]);
  const [marketStats, setMarketStats] = useState(null);
  const [isLoadingChart, setIsLoadingChart] = useState(true);

  const asset = assets.find((a) => a.id === id);

  useEffect(() => {
    if (!asset || !asset.symbol) return;

    let isMounted = true;

    async function loadData() {
      setIsLoadingChart(true);
      try {
        const [chart, stats] = await Promise.all([
          fetchMarketChart(asset.symbol, period),
          fetchMarketStats(asset.symbol)
        ]);
        
        if (isMounted) {
          setChartData(chart);
          if (stats) setMarketStats(stats);
          setIsLoadingChart(false);
        }
      } catch (error) {
        console.error("Failed to load market detail data:", error);
        if (isMounted) setIsLoadingChart(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [asset?.symbol, period]);

  // Generate SVG path from chart data
  const chartPath = useMemo(() => {
    if (!chartData || chartData.length < 2) return "";
    
    const prices = chartData.map(p => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    // Viewbox is 100x50. Margin top: 5, bottom: 5 (Height 40)
    const points = chartData.map((p, i) => {
      const x = (i / (chartData.length - 1)) * 100;
      const y = 45 - ((p.price - min) / range) * 40;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    return `M${points.join(" L")}`;
  }, [chartData]);

  // Generate area path for gradient
  const areaPath = useMemo(() => {
    if (!chartPath) return "";
    return `${chartPath} L100,50 L0,50 Z`;
  }, [chartPath]);

  if (!asset) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 text-white font-bold">
        Asset not found
      </div>
    );
  }

  const stats = [
    { 
      label: "Market Cap", 
      value: marketStats?.marketCap ? `${fiatCurrency}${marketStats.marketCap.toLocaleString()}` : "---", 
      icon: Globe 
    },
    { 
      label: "Volume (24h)", 
      value: marketStats?.volume24h ? `${fiatCurrency}${marketStats.volume24h.toLocaleString()}` : "---", 
      icon: Activity 
    },
    { 
      label: "High (24h)", 
      value: marketStats?.high24h ? `${fiatCurrency}${marketStats.high24h.toLocaleString()}` : "---", 
      icon: Info 
    },
    { 
      label: "Rank", 
      value: marketStats?.rank ? `#${marketStats.rank}` : "---", 
      icon: ShieldCheck 
    },
  ];

  const assetChange = Number(marketStats?.change24h ?? asset.change ?? 0);
  const isPositive = assetChange >= 0;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="aura-container"
    >
      {/* Background Glow */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div 
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-[120px] opacity-20"
          style={{ backgroundColor: asset.color || "#6366f1" }}
        />
        <div 
          className="absolute top-1/2 -left-24 w-64 h-64 rounded-full blur-[100px] opacity-10"
          style={{ backgroundColor: asset.color || "#6366f1" }}
        />
      </div>

      <section className="asset-detail-header-section sticky top-0 z-50">
        <div className="asset-detail-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="aura-header-title flex items-center justify-center space-x-3">
            {asset.iconUrl ? (
              <img src={asset.iconUrl} alt={asset.name} className="w-8 h-8 rounded-full object-cover shadow-lg border border-white/10" />
            ) : (
              <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center font-bold text-[10px] border border-white/10">{asset.symbol.charAt(0)}</div>
            )}
            <span className="leading-none">{asset.name}</span>
          </div>
          <button className="aura-header-button">
            <Info size={18} />
          </button>
        </div>
      </section>

      <div className="flex-1 px-5 mt-8 space-y-10 relative z-10 pb-32">
        <div className="text-center space-y-1">
          <p className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">Available Balance</p>
          <h2 className="text-5xl font-black text-white tracking-tighter">
            {Number(asset.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} <span className="text-2xl text-slate-600 ml-1">{asset.symbol}</span>
          </h2>
          <p className="text-lg font-bold text-slate-400">
            {fiatCurrency}{Number(asset.fiatValue || asset.usdValue || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="flex items-center justify-center mt-4 pt-1">
            <div className={`flex items-center space-x-2 ${isPositive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} border px-4 py-1.5 rounded-full shadow-lg`}>
              <TrendingUp size={14} className={isPositive ? "text-emerald-400" : "text-rose-400"} strokeWidth={3} />
              <span className="text-xs font-black uppercase tracking-tighter">{isPositive ? "+" : ""}{assetChange.toFixed(2)}% Today</span>
            </div>
          </div>
        </div>

        {/* Chart Area */}
        <div className="space-y-6">
          <div className="w-full h-56 bg-slate-900/40 rounded-[2.5rem] border border-slate-800/50 relative overflow-hidden shadow-2xl backdrop-blur-sm group">
            <AnimatePresence mode="wait">
              {isLoadingChart ? (
                <motion.div 
                  key="loader"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <RefreshCw size={24} className="text-indigo-500 animate-spin opacity-40" />
                </motion.div>
              ) : (
                <motion.div 
                  key="chart"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-x-0 bottom-0 h-4/5 opacity-80 group-hover:opacity-100 transition-opacity"
                >
                  <svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="assetGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={asset.color || "#6366f1"} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={asset.color || "#6366f1"} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {areaPath && <path d={areaPath} fill="url(#assetGrad)" />}
                    {chartPath && (
                      <motion.path 
                        initial={{ pathLength: 0 }} 
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                        d={chartPath} 
                        fill="none" 
                        stroke={asset.color || "#6366f1"} 
                        strokeWidth="2.5" 
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex justify-between items-center bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800">
            {["1H", "1D", "1W", "1M", "1Y"].map((p) => (
              <button 
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${period === p ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex justify-between space-x-4">
          {[
            { label: "Send", icon: ArrowUpRight, path: "/app/send", bg: "bg-rose-500/10", color: "text-rose-400", border: "border-rose-500/20" },
            { label: "Receive", icon: ArrowDownLeft, path: "/app/receive", bg: "bg-emerald-500/10", color: "text-emerald-400", border: "border-emerald-500/20" },
            { label: "Swap", icon: RefreshCw, path: "/app/swap", bg: "bg-indigo-500/10", color: "text-indigo-400", border: "border-indigo-500/20" },
          ].map((action) => (
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              key={action.label}
              onClick={() => navigate(action.path, { state: { assetContextId: asset.id } })}
              className="flex-1 flex flex-col items-center justify-center space-y-3"
            >
              <div className={`w-16 h-16 ${action.bg} border ${action.border} rounded-3xl flex items-center justify-center shadow-xl transition-all group-hover:shadow-indigo-500/10`}>
                <action.icon size={26} strokeWidth={2.5} className={action.color} />
              </div>
              <span className="text-[11px] font-extrabold text-slate-400 tracking-wider uppercase">{action.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Market Stats */}
        <div className="space-y-4 pt-4">
           <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest px-1">Market Statistics</h3>
           <div className="grid grid-cols-2 gap-4">
              {stats.map((stat, i) => (
                <div key={i} className="bg-slate-900/70 border border-slate-800/50 p-5 rounded-3xl space-y-2 hover:bg-slate-900 transition-colors shadow-lg">
                   <div className="flex items-center space-x-2 text-slate-500 font-bold mb-1">
                      <stat.icon size={14} className="text-indigo-400 opacity-60" />
                      <span className="text-[10px] uppercase tracking-widest">{stat.label}</span>
                   </div>
                   <p className="text-base font-black text-white truncate">{stat.value}</p>
                </div>
              ))}
           </div>
        </div>

        {/* Info Text */}
        <div className="bg-indigo-500/5 border border-indigo-500/10 p-6 rounded-[2.5rem] space-y-3">
           <h4 className="text-sm font-black text-white">About {asset.name}</h4>
           <div className="text-xs text-slate-500 font-medium leading-relaxed">
             {asset.name} ({asset.symbol}) is a high-performance blockchain platform and native cryptocurrency. 
             This asset is verified and secured within your Crypto Wallet.
             <button className="text-indigo-400 font-bold ml-1">Read More</button>
           </div>
        </div>
      </div>
    </motion.div>
  );
}
