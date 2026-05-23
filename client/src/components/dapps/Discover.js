import { Search, Flame, LayoutGrid, Rocket, Zap, Newspaper, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { UI_ASSETS } from "../../config/uiAssets";

const DAPPS = [
  { id: "uniswap", name: "Uniswap", description: "Decentralized trading protocol", icon: Zap, color: "bg-pink-500" },
  { id: "opensea", name: "OpenSea", description: "NFT Marketplace", icon: LayoutGrid, color: "bg-blue-500" },
  { id: "aave", name: "Aave", description: "Liquidity protocol", icon: Flame, color: "bg-purple-500" },
  { id: "compound", name: "Compound", description: "Algorithmic money market", icon: Rocket, color: "bg-emerald-500" },
];

const MARKET_NEWS = [
  { title: "Bitcoin hits new ATH as ETF demand surges", time: "2h ago", source: "CoinDesk", image: UI_ASSETS.marketNewsBitcoin },
  { title: "Ethereum gas fees drop to 2-year lows", time: "4h ago", source: "DefiLlama", image: UI_ASSETS.marketNewsEthereum },
];

export function Discover() {
  const navigate = useNavigate();

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="aura-container"
    >
      <section className="discover-header-section sticky top-0 z-50">
        <div className="discover-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <h1 className="aura-header-title">Discover</h1>
          <div className="w-10" />
        </div>
      </section>

      <div className="px-5 mt-6 space-y-8">
        {/* Search Bar */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Search dApps or enter URL" 
            className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500/50 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium outline-none transition-all shadow-lg"
          />
        </div>

        {/* Categories */}
        <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide">
          {["All", "DeFi", "Exchanges", "NFTs", "Social"].map((cat, i) => (
            <button key={cat} className={`px-5 py-2 rounded-full text-xs font-bold border transition-all ${i === 0 ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}`}>
              {cat}
            </button>
          ))}
        </div>

        {/* Featured Banner */}
        <motion.div 
          whileHover={{ scale: 1.02 }}
          className="w-full h-44 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-3xl p-6 relative overflow-hidden shadow-xl"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-16 blur-2xl font-bold" />
          <div className="relative z-10 space-y-2">
            <span className="bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-widest font-extrabold">Featured</span>
            <h2 className="text-xl font-extrabold mt-2 leading-tight">New NFT Drop:<br/>MetaVoyagers</h2>
            <button onClick={() => navigate('/app/dapp/metavoyagers')} className="bg-white text-indigo-700 text-[10px] font-extrabold px-4 py-2 rounded-full mt-4 shadow-lg hover:bg-slate-100 transition-colors lowercase tracking-widest">EXPLORE NOW</button>
          </div>
          <LayoutGrid className="absolute bottom-4 right-6 text-white/10" size={100} strokeWidth={1} />
        </motion.div>

        {/* Popular dApps */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-extrabold">Popular dApps</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {DAPPS.map((dapp) => (
              <motion.div 
                whileTap={{ scale: 0.98 }}
                key={dapp.name} 
                onClick={() => navigate(`/app/dapp/${dapp.id}`)}
                className="bg-slate-900 border border-slate-800 p-4 rounded-3xl hover:border-slate-700 transition-all shadow-lg cursor-pointer group"
              >
                <div className={`w-12 h-12 ${dapp.color} rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/10 group-hover:scale-110 transition-transform`}>
                  <dapp.icon className="text-white" size={24} />
                </div>
                <h4 className="font-extrabold text-sm mb-1">{dapp.name}</h4>
                <p className="text-[10px] text-slate-500 font-bold line-clamp-1">{dapp.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Market News */}
        <div className="space-y-4 pb-20">
           <div className="flex items-center space-x-2 px-1">
             <Newspaper size={20} className="text-indigo-400" />
             <h3 className="text-lg font-extrabold">Market News</h3>
           </div>
           <div className="space-y-4">
             {MARKET_NEWS.map((news) => (
               <div key={news.title} className="flex space-x-4 items-center bg-slate-900/50 p-3 rounded-2xl border border-slate-800 hover:bg-slate-900 transition-colors cursor-pointer group">
                 <img src={news.image} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="news" />
                 <div className="space-y-1">
                    <p className="text-xs font-extrabold text-white leading-snug line-clamp-2 group-hover:text-indigo-400 transition-colors">{news.title}</p>
                    <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <span>{news.source}</span>
                      <span>•</span>
                      <span>{news.time}</span>
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
