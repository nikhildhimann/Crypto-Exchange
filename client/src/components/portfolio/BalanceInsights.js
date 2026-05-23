import { useNavigate } from "react-router";
import { ArrowLeft, TrendingUp, TrendingDown, Eye, Activity, PieChart, Coins } from "lucide-react";
import { motion } from "motion/react";
import { useAppContext } from "../../contexts/AppContext";

export function BalanceInsights() {
  const navigate = useNavigate();
  const { assets, fiatCurrency, visibleAssetsTotalFiat } = useAppContext();
  const totalBalance = Number(visibleAssetsTotalFiat || 0) || 0;

  return (
    <motion.div 
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="aura-container"
    >
      <section className="insights-header-section sticky top-0 z-50">
        <div className="insights-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <h1 className="aura-header-title">Detailed Insights</h1>
          <div className="w-10" />
        </div>
      </section>

      <div className="flex-1 px-5 mt-8 space-y-8 overflow-y-auto pb-24">
        {/* Total Wealth Summary */}
        <div className="text-center space-y-2">
           <Eye size={32} className="mx-auto text-indigo-400 mb-2" />
           <p className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">Net Worth Breakdown</p>
           <h2 className="text-5xl font-black text-white">{fiatCurrency}{totalBalance.toLocaleString()}</h2>
           <div className="flex items-center justify-center space-x-2 text-emerald-400 bg-emerald-500/10 px-4 py-1.5 rounded-full w-max mx-auto border border-emerald-500/20 mt-4">
              <TrendingUp size={16} strokeWidth={3} />
              <span className="text-xs font-black uppercase tracking-tighter">+₹14,560.24 (24h)</span>
           </div>
        </div>

        {/* Wealth Chart Placeholder */}
        <div className="w-full h-40 bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 flex items-end justify-between space-x-2">
           {[40, 70, 45, 90, 65, 80, 55].map((h, i) => (
             <motion.div 
                key={i} 
                initial={{ height: 0 }} 
                animate={{ height: `${h}%` }}
                transition={{ duration: 1, delay: i * 0.1 }}
                className={`flex-1 rounded-t-xl ${i === 3 ? 'bg-indigo-500 shadow-[0_0_15px_indigo]' : 'bg-slate-800'}`} 
             />
           ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 space-y-1 group hover:border-indigo-500/50 transition-colors">
              <Activity size={24} className="text-rose-400 mb-2" />
              <h4 className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest">Volatility</h4>
              <p className="text-xl font-black">Medium</p>
           </div>
           <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 space-y-1 group hover:border-indigo-500/50 transition-colors">
              <PieChart size={24} className="text-emerald-400 mb-2" />
              <h4 className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest">Allocation</h4>
              <p className="text-xl font-black">8 Assets</p>
           </div>
        </div>

        {/* Asset Distribution */}
        <div className="space-y-4">
           <h3 className="text-lg font-black px-1">Top Holdings</h3>
           <div className="space-y-3">
              {assets.slice(0, 3).map(asset => (
                <div key={asset.id} className="bg-slate-900/50 p-4 rounded-3xl border border-slate-800 flex items-center justify-between">
                   <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden">
                        <img src={asset.iconUrl} alt={asset.symbol} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-sm font-bold">{asset.name}</span>
                   </div>
                   <div className="text-right">
                      <p className="text-sm font-black">{Math.floor(asset.fiatValue / totalBalance * 100)}%</p>
                      <div className="w-20 h-1 bg-slate-800 rounded-full mt-1">
                         <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.floor(asset.fiatValue / totalBalance * 100)}%` }} />
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </motion.div>
  );
}
