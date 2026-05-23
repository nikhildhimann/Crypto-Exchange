import { ArrowLeft, Zap, Images, X, ScanLine, Info, QrCode, Copy, Share2, CheckCircle2, Download, ShieldCheck, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import QrScanner from "qr-scanner";
import { useAppContext } from "../../contexts/AppContext";
import { copyTextToClipboard } from "../../lib/clipboard";

QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";

// Local Image Imports
import ethLogo from "../../img/eth.png";

const MOCK_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const EVM_QR_COMPATIBLE_CHAINS = new Set(["eth", "bnb", "avax", "polygon"]);

function isEvmAddress(value = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function isBtcAddress(value = "") {
  return /^(bc1|tb1|[13mn2])[a-zA-Z0-9]{20,}$/i.test(String(value || "").trim());
}

function isLtcAddress(value = "") {
  return /^(ltc1[ac-hj-np-z02-9]{8,}|[LM][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(
    String(value || "").trim(),
  );
}

function isAdaAddress(value = "") {
  return /^(addr1|addr_test1)[a-z0-9]+$/i.test(String(value || "").trim());
}

function isHbarAccountId(value = "") {
  return /^\d+\.\d+\.\d+$/.test(String(value || "").trim());
}

function isTonRawAddress(value = "") {
  return /^[+-]?\d+:[0-9a-fA-F]{64}$/.test(String(value || "").trim());
}

function isTonFriendlyAddress(value = "") {
  return /^[A-Za-z0-9_-]{48}$/.test(String(value || "").trim());
}

function detectRawAddressChain(value = "", defaultEvmChain = "") {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  if (isEvmAddress(normalizedValue)) {
    return EVM_QR_COMPATIBLE_CHAINS.has(defaultEvmChain) ? defaultEvmChain : "eth";
  }

  if (isBtcAddress(normalizedValue)) {
    return "btc";
  }

  if (isLtcAddress(normalizedValue)) {
    return "ltc";
  }

  if (isAdaAddress(normalizedValue)) {
    return "ada";
  }

  if (isHbarAccountId(normalizedValue)) {
    return "hbar";
  }

  if (isTonRawAddress(normalizedValue) || isTonFriendlyAddress(normalizedValue)) {
    return "ton";
  }

  return "";
}

function parseQrPayload(rawData = "", options = {}) {
  const trimmedValue = String(rawData || "").trim();
  const defaultEvmChain = String(options.defaultEvmChain || "").trim().toLowerCase();

  if (!trimmedValue) {
    return {
      chain: "",
      address: "",
      executionParams: {},
    };
  }

  if (isTonRawAddress(trimmedValue)) {
    return {
      chain: "ton",
      address: trimmedValue,
      executionParams: {},
    };
  }

  const delimiterIndex = trimmedValue.indexOf(":");
  if (delimiterIndex === -1) {
    return {
      chain: detectRawAddressChain(trimmedValue, defaultEvmChain),
      address: trimmedValue,
      executionParams: {},
    };
  }

  const scheme = trimmedValue.slice(0, delimiterIndex).toLowerCase();
  const remainder = trimmedValue.slice(delimiterIndex + 1);
  const [addressPart = "", queryPart = ""] = remainder.split("?", 2);
  const normalizedAddressPart = addressPart.replace(/^\/\//, "");
  const queryParams = new URLSearchParams(queryPart);

  if (scheme === "ethereum") {
    return {
      chain: EVM_QR_COMPATIBLE_CHAINS.has(defaultEvmChain) ? defaultEvmChain : "eth",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "polygon" || scheme === "matic" || scheme === "pol") {
    return {
      chain: "polygon",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "bnb") {
    return {
      chain: "bnb",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "solana") {
    return {
      chain: "solana",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "tron") {
    return {
      chain: "tron",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "bitcoin") {
    return {
      chain: "btc",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  // if (scheme === "dogecoin") {
  //   return {
  //     chain: "doge",
  //     address: normalizedAddressPart,
  //     executionParams: {},
  //   };
  // }

  if (scheme === "litecoin") {
    return {
      chain: "ltc",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "cardano" || scheme === "web+cardano") {
    return {
      chain: "ada",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "hedera" || scheme === "hbar") {
    return {
      chain: "hbar",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "sui") {
    return {
      chain: "sui",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "ton") {
    return {
      chain: "ton",
      address: normalizedAddressPart || remainder,
      executionParams: {},
    };
  }

  if (scheme === "aptos") {
    return {
      chain: "aptos",
      address: normalizedAddressPart,
      executionParams: {},
    };
  }

  if (scheme === "xrp" || scheme === "ripple") {
    const destinationTag = queryParams.get("dt") || queryParams.get("destinationTag") || "";

    return {
      chain: "xrp",
      address: normalizedAddressPart,
      executionParams:
        destinationTag !== ""
          ? { destinationTag }
          : {},
    };
  }

  return {
    chain: detectRawAddressChain(trimmedValue, defaultEvmChain),
    address: normalizedAddressPart || trimmedValue,
    executionParams: {},
  };
}

function formatNetworkBadge(networkLabel = "", networkCode = "") {
  if (networkLabel) {
    return networkLabel;
  }

  const normalizedNetworkCode = String(networkCode || "").trim().toLowerCase();
  if (!normalizedNetworkCode) {
    return "Network Ready";
  }

  return `${normalizedNetworkCode.charAt(0).toUpperCase()}${normalizedNetworkCode.slice(1)} Ready`;
}

export function Scanner() {
  const navigate = useNavigate();
  const { activeWallet, visibleAssets } = useAppContext();
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const hasScannedRef = useRef(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [activeTab, setActiveTab] = useState("scan"); 
  const [copied, setCopied] = useState(false);
  const primaryAsset =
    (visibleAssets || []).find(
      (asset) =>
        (asset?.walletId && asset.walletId === activeWallet?.walletId) &&
        asset?.assetType !== "token",
    ) ||
    (visibleAssets || []).find((asset) => asset?.walletId === activeWallet?.walletId) ||
    null;
  const displayWalletName =
    activeWallet?.walletLabel ||
    activeWallet?.displayName ||
    activeWallet?.name ||
    "Main Wallet";
  const displayNetworkLabel = formatNetworkBadge(
    activeWallet?.networkLabel,
    activeWallet?.network,
  );
  const displayAddress =
    activeWallet?.address ||
    primaryAsset?.address ||
    MOCK_ADDRESS;
  const displayIcon =
    primaryAsset?.iconUrl ||
    activeWallet?.icon ||
    ethLogo;

  function processScanResult({ chain, address, executionParams, rawData }) {
    if (!address) return;

    // Keep navigation minimal and safe
    navigate("/app/send", {
      state: {
        scannedAddress: address,
        scannedChain: chain,
        scannedExecutionParams: executionParams || {},
        raw: rawData,
      },
    });
  }

  function handleScan(rawData) {
    if (!rawData) return;

    try {
      const { chain, address, executionParams } = parseQrPayload(rawData, {
        defaultEvmChain: String(activeWallet?.chain || primaryAsset?.chain || "").toLowerCase(),
      });
      processScanResult({ chain, address, executionParams, rawData });
    } catch (err) {
      console.error("QR parse error:", err);
      processScanResult({ chain: "", address: rawData, executionParams: {}, rawData });
    }
  }

  useEffect(() => {
    if (activeTab !== "scan") return;
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment" } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          const scanner = new QrScanner(
            videoRef.current,
            (result) => {
              if (hasScannedRef.current) return;
              hasScannedRef.current = true;
              handleScan(result.data);
            },
            {
              returnDetailedScanResult: true,
            }
          );
          
          scanner.start();
          scannerRef.current = scanner;
        }
        setHasPermission(true);
      } catch (err) {
        setHasPermission(false);
      }
    }
    setupCamera();
    return () => {
      const stream = videoRef.current?.srcObject;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleCopy = async () => {
    if (!displayAddress) {
      return;
    }

    try {
      await copyTextToClipboard(displayAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="aura-container !bg-slate-950 min-h-screen flex flex-col">
      
      <section className="scanner-header-section sticky top-0 z-50">
        <div className="scanner-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button">
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex bg-slate-900/50 p-1 rounded-2xl border border-white/5 shadow-inner">
             <button 
               onClick={() => setActiveTab("scan")}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center space-x-2 ${activeTab === "scan" ? "bg-white text-slate-950 shadow-2xl" : "text-white/30 hover:text-white/50"}`}
             >
               <ScanLine size={14} />
               <span>Scan</span>
             </button>
             <button 
               onClick={() => setActiveTab("myqr")}
               className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center space-x-2 ${activeTab === "myqr" ? "bg-white text-slate-950 shadow-2xl" : "text-white/30 hover:text-white/50"}`}
             >
               <QrCode size={14} />
               <span>Show</span>
             </button>
          </div>
 
          <button className="aura-header-button text-indigo-400 border-indigo-500/20 bg-indigo-500/5">
            <Zap size={20} className="animate-pulse" />
          </button>
        </div>
      </section>

      <div className="flex-1">
        <AnimatePresence mode="wait">
          {activeTab === "scan" ? (
            <motion.div 
              key="scan-view"
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col"
            >
              <section className="scanner-scanview-section relative flex flex-col min-h-[600px] overflow-hidden">
                <div className="scanner-scanview-inner relative flex items-center justify-center bg-black h-full flex-1">
                  {hasPermission === false ? (
                    <div className="z-30 text-center px-10 py-20 space-y-10">
                      <div className="relative inline-block">
                        <div className="w-28 h-28 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20 text-rose-500">
                          <X size={56} />
                        </div>
                        <div className="absolute -inset-4 bg-rose-500/10 rounded-full blur-2xl -z-10 animate-pulse" />
                      </div>
                      <div className="space-y-3">
                        <h2 className="text-3xl font-black text-white">Camera Offline</h2>
                        <p className="text-sm text-slate-400 max-w-[280px] mx-auto leading-relaxed">We need your permission to access the camera for scanning QR codes.</p>
                      </div>
                      <button className="w-full bg-rose-500 text-white font-black py-5 rounded-[2rem] shadow-2xl shadow-rose-500/30">Grant Access</button>
                    </div>
                  ) : (
                    <>
                      <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover opacity-80" />
                      
                      {/* Viewfinder Overlay with Neon Vibe */}
                      <div className="absolute inset-0 bg-black/40" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60" />

                      {/* Neon Scanner Visualizer */}
                      <div className="relative w-72 h-72 z-10">
                        {/* Corners with Intense Glow */}
                        <div className="absolute top-0 left-0 w-20 h-20 border-t-[3px] border-l-[3px] border-indigo-500 rounded-tl-[3.5rem] shadow-[-10px_-10px_30px_rgba(99,102,241,0.4)]" />
                        <div className="absolute top-0 right-0 w-20 h-20 border-t-[3px] border-r-[3px] border-indigo-500 rounded-tr-[3.5rem] shadow-[10px_-10px_30px_rgba(99,102,241,0.4)]" />
                        <div className="absolute bottom-0 left-0 w-20 h-20 border-b-[3px] border-l-[3px] border-indigo-500 rounded-bl-[3.5rem] shadow-[-10px_10px_30px_rgba(99,102,241,0.4)]" />
                        <div className="absolute bottom-0 right-0 w-20 h-20 border-b-[3px] border-r-[3px] border-indigo-500 rounded-br-[3.5rem] shadow-[10px_10px_30px_rgba(99,102,241,0.4)]" />
                        
                        {/* Dynamic Scan Line */}
                        <motion.div 
                          animate={{ top: ['2%', '98%', '2%'] }} 
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} 
                          className="absolute left-4 right-4 h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_20px_#818cf8] z-20" 
                        />
                        
                        {/* Viewfinder Interior */}
                        <div className="absolute inset-0 border border-white/10 rounded-[3.5rem] bg-indigo-500/5 backdrop-blur-[1px]" />
                      </div>

                      {/* Floating Info Panel */}
                      <div className="absolute bottom-12 w-full px-8 z-20 space-y-4">
                         <div className="bg-white/10 backdrop-blur-3xl p-5 rounded-[2.5rem] border border-white/10 flex items-center justify-between shadow-2xl">
                            <div className="flex items-center space-x-4">
                               <div className="w-10 h-10 bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-lg">
                                  <ScanLine size={20} />
                               </div>
                               <div className="space-y-0.5">
                                  <h4 className="text-xs font-black text-white uppercase tracking-widest">Scanning...</h4>
                                  <p className="text-[10px] font-bold text-white/40 uppercase">Align QR in frame</p>
                               </div>
                            </div>
                            <button className="p-3 bg-white/5 rounded-2xl text-white">
                               <Images size={20} />
                            </button>
                         </div>
                      </div>
                    </>
                  )}
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.div 
              key="myqr-view"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              className="flex flex-col items-center p-8 py-14 space-y-12 bg-slate-950"
            >
              {/* Grand QR Card Experience */}
              <section className="scanner-showqr-card-section w-full max-w-sm">
                <div className="scanner-showqr-card-inner bg-gradient-to-b from-slate-900 to-black rounded-[4rem] p-10 border border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative group overflow-hidden">
                   {/* Card Accents */}
                   <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px]" />
                   <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px]" />
                   
                   <div className="relative z-10 flex flex-col items-center space-y-10">
                      <div className="flex flex-col items-center space-y-3">
                         <h3 className="text-2xl font-black text-white tracking-tight">{displayWalletName}</h3>
                         <div className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center space-x-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400">{displayNetworkLabel}</span>
                         </div>
                      </div>

                      {/* Radiant QR Frame */}
                      <div className="relative">
                         <div className="absolute -inset-4 bg-indigo-500/5 rounded-[3rem] blur-xl" />
                         <div className="bg-white p-7 rounded-[3rem] shadow-2xl relative block border-[10px] border-white">
                            <div className="w-48 h-48 relative grid grid-cols-7 grid-rows-7 gap-1">
                               {Array.from({ length: 49 }).map((_, i) => (
                                 <div key={i} className={`rounded-sm ${Math.random() > 0.4 ? 'bg-slate-950' : 'bg-transparent'}`} />
                               ))}
                               {/* Floating Central Badge */}
                               <div className="absolute inset-0 m-auto w-12 h-12 bg-white rounded-xl shadow-xl border border-slate-100 flex items-center justify-center p-2">
                                  <img src={displayIcon} className="w-6 h-6 object-contain" alt="wallet" />
                               </div>
                            </div>
                         </div>
                      </div>

                      <div className="w-full space-y-5">
                         <div className="flex flex-col items-center space-y-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Your Public Receipt ID</span>
                            <div className="flex items-center justify-between w-full bg-white/5 border border-white/5 p-4 rounded-3xl group/addr hover:bg-white/10 transition-all cursor-pointer" onClick={handleCopy}>
                               <span className="text-[11px] font-mono font-bold text-indigo-300 truncate mr-4">{displayAddress}</span>
                               <div className="p-2 transition-transform active:scale-90 text-white/40 group-hover/addr:text-white">
                                  {copied ? <CheckCircle2 size={18} className="text-emerald-400" /> : <Copy size={18} />}
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
              </section>

              {/* High-Action Grid */}
              <section className="scanner-showqr-actions-section w-full max-w-sm">
                <div className="scanner-showqr-actions-inner grid grid-cols-2 gap-5 w-full">
                   <button className="bg-slate-900/50 border border-white/5 p-6 rounded-[2.5rem] flex flex-col items-center space-y-4 active:scale-95 transition-all shadow-xl hover:border-indigo-500/30">
                      <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/10">
                         <Share2 size={24} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Share Asset</span>
                   </button>
                   
                   <button className="bg-slate-900/50 border border-white/5 p-6 rounded-[2.5rem] flex flex-col items-center space-y-4 active:scale-95 transition-all shadow-xl hover:border-purple-500/30">
                      <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 border border-purple-500/10">
                         <Download size={24} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Save Picture</span>
                   </button>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Supreme Safety Footer */}
      <section className="scanner-footer-section mt-auto">
        <div className="scanner-footer-inner bg-slate-950 px-8 py-12 border-t border-white/5">
          <div className="bg-indigo-600/5 border border-indigo-500/10 p-6 rounded-[3rem] shadow-2xl flex items-center justify-between group">
             <div className="flex items-center space-x-5">
                <div className="w-14 h-14 bg-indigo-500 border border-indigo-400 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-indigo-600/30 group-hover:scale-110 transition-transform">
                   <ShieldCheck size={32} />
                </div>
                <div className="space-y-1">
                   <h4 className="text-sm font-black text-white">Triple Encrypted</h4>
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Crypto Wallet military-grade privacy</p>
                </div>
             </div>
             <ChevronRight size={24} className="text-slate-700" />
          </div>
        </div>
      </section>

      {/* Account for Bottom Nav */}
      <div className="h-24 shrink-0" />
    </div>
  );
}
