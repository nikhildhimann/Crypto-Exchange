import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Globe, Share2, Star, Zap, Shield, Rocket } from "lucide-react";
import { motion } from "motion/react";
import { UI_ASSETS } from "../../config/uiAssets";

export function DAppDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <motion.div 
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="aura-container"
    >
      <section className="dapp-detail-header-section sticky top-0 z-50">
        <div className="dapp-detail-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <h1 className="aura-header-title capitalize">{id}</h1>
          <button className="aura-header-button">
            <Share2 size={20} />
          </button>
        </div>
      </section>

      <div className="flex-1 px-5 mt-8 space-y-8 overflow-y-auto pb-24">
        {/* Banner */}
        <div className="w-full h-48 bg-slate-900 rounded-[2.5rem] relative overflow-hidden shadow-2xl group border border-slate-800">
           <img src={UI_ASSETS.dappBanner} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" alt="banner" />
           <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent" />
           <div className="absolute bottom-6 left-6 flex items-center space-x-4">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center shadow-2xl border border-white/20">
                 <Zap className="text-pink-400" size={32} />
              </div>
              <div>
                 <h2 className="text-xl font-black capitalize tracking-tight">{id}</h2>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Exchange • DeFi</p>
              </div>
           </div>
        </div>

        {/* Stats */}
        <div className="flex justify-between items-center px-4">
           <div className="text-center space-y-1">
              <div className="flex items-center space-x-1 text-amber-500 justify-center">
                 <Star size={16} fill="currentColor" />
                 <span className="text-sm font-black">4.9</span>
              </div>
              <p className="text-[10px] font-extrabold text-slate-600 uppercase">Rating</p>
           </div>
           <div className="w-px h-8 bg-slate-900" />
           <div className="text-center space-y-1">
              <span className="text-sm font-black">1.2M+</span>
              <p className="text-[10px] font-extrabold text-slate-600 uppercase">Users</p>
           </div>
           <div className="w-px h-8 bg-slate-900" />
           <div className="text-center space-y-1">
              <span className="text-sm font-black">$4.5B</span>
              <p className="text-[10px] font-extrabold text-slate-600 uppercase">Volume</p>
           </div>
        </div>

        {/* Security Badge */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-[2rem] flex items-center space-x-3 shadow-lg">
           <Shield className="text-emerald-500" size={24} />
           <p className="text-xs font-bold text-emerald-500/80 leading-relaxed uppercase tracking-widest">Audited by CertiK • Verified Protocol</p>
        </div>

        {/* Features list */}
        <div className="space-y-4">
           <h3 className="text-lg font-black px-1">Key Features</h3>
           <div className="grid grid-cols-1 gap-3">
              {[
                { label: "Zero gas fees on swaps", icon: Zap, color: "text-amber-400" },
                { label: "High liquidity for top pairs", icon: Rocket, color: "text-indigo-400" },
              ].map(f => (
                <div key={f.label} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex items-center space-x-4">
                   <div className={`w-10 h-10 ${f.color} bg-white/5 rounded-xl flex items-center justify-center`}>
                      <f.icon size={20} />
                   </div>
                   <span className="text-sm font-bold">{f.label}</span>
                </div>
              ))}
           </div>
        </div>

        {/* Floating Connect Button */}
        <div className="fixed bottom-10 left-0 right-0 px-8 max-w-md mx-auto z-30">
           <button onClick={() => alert('Connected!')} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-full transition-all shadow-2xl shadow-indigo-600/40 text-sm uppercase tracking-[0.2em]">Open Wallet Connect</button>
        </div>
      </div>
    </motion.div>
  );
}
