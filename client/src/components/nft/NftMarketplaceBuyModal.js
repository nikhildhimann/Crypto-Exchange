import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft,
  X,
  ShieldCheck,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  ImageOff,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { buyNft } from "../../api/marketplace";
import { getErrorMessage } from "../../lib/errorMessage";

const STEPS = {
  INPUT: "INPUT",
  CONFIRM: "CONFIRM",
  SUCCESS: "SUCCESS"
};

function formatWeiToMatic(wei) {
  try {
    return (Number(BigInt(String(wei || "0"))) / 1e18).toFixed(4);
  } catch {
    return "0";
  }
}

function truncateAddress(addr = "", start = 6, end = 4) {
  const str = String(addr || "");
  if (str.length <= start + end + 2) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

export function NftMarketplaceBuyModal({ open, listing, walletId, onClose, onCompleted }) {
  const [step, setStep] = useState(STEPS.INPUT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(STEPS.INPUT);
        setError("");
        setLoading(false);
        setResult(null);
      }, 300);
    }
  }, [open]);

  const handleClose = () => {
    if (loading) return;
    onClose?.();
  };

  const handleConfirmPurchase = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await buyNft({
        walletId,
        orderId: listing.orderId,
        chain: "polygon"
      });

      if (response.success) {
        setResult(response.data);
        setStep(STEPS.SUCCESS);
        toast.success("NFT purchase submitted!");
      } else {
        throw new Error(response.message || "Purchase failed");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Purchase failed. Please check your balance or try again."));
    } finally {
      setLoading(false);
    }
  };

  const priceMatic = formatWeiToMatic(listing?.priceInWei);
  const nftTitle = listing?.token?.name || `Token #${listing?.token?.tokenId}`;
  const contractAddress = listing?.token?.contractAddress;
  const tokenId = listing?.token?.tokenId;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className="relative z-10 w-full max-w-md rounded-t-[2.5rem] border border-white/5 bg-slate-950 shadow-2xl sm:mb-6 sm:rounded-[2.5rem] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              {step === STEPS.CONFIRM && !loading ? (
                <button onClick={() => setStep(STEPS.INPUT)} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
                  <ChevronLeft size={24} />
                </button>
              ) : (
                <div className="w-8" />
              )}
              <h2 className="text-lg font-bold text-white tracking-tight">
                {step === STEPS.SUCCESS ? "Purchase Complete" : "Buy NFT"}
              </h2>
              <button onClick={handleClose} disabled={loading} className="p-2 -mr-2 text-slate-400 hover:text-white transition-colors disabled:opacity-30">
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-6 py-8 no-scrollbar">
              {step === STEPS.INPUT && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  {/* NFT Summary */}
                  <div className="flex flex-col items-center">
                    <div className="w-32 h-32 rounded-3xl overflow-hidden shadow-2xl border border-white/10 mb-6 bg-slate-900 group">
                      <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-900/50">
                        <ImageOff size={40} />
                      </div>
                    </div>
                    <div className="text-center space-y-1 px-4">
                      <h3 className="text-2xl font-black text-white leading-tight">{nftTitle}</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">
                        Polygon Network
                      </p>
                    </div>
                  </div>

                  {/* Price Display */}
                  <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 text-center space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Listing Price</p>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-4xl font-black text-white">{priceMatic}</span>
                      <span className="text-xl font-bold text-slate-400">MATIC</span>
                    </div>
                  </div>

                  {/* Info Rows */}
                  <div className="space-y-4 px-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 font-medium tracking-tight">Contract</span>
                      <span className="text-white font-bold">{truncateAddress(contractAddress)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 font-medium tracking-tight">Token ID</span>
                      <span className="text-white font-bold">{truncateAddress(tokenId, 12, 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 font-medium tracking-tight">Seller</span>
                      <span className="text-white font-bold">{truncateAddress(listing?.seller)}</span>
                    </div>
                  </div>

                  {/* Warning Box */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs font-bold text-amber-200/80 leading-relaxed">
                      This purchase is final and cannot be reversed. Please verify the asset and price before proceeding.
                    </p>
                  </div>

                  <button
                    onClick={() => setStep(STEPS.CONFIRM)}
                    className="aura-btn-primary w-full py-5 rounded-[1.5rem]"
                  >
                    Review Purchase
                  </button>
                </motion.div>
              )}

              {step === STEPS.CONFIRM && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div className="text-center">
                    <h3 className="text-2xl font-black text-white">Confirmation</h3>
                    <p className="text-slate-400 text-sm mt-1">Review the final transaction details</p>
                  </div>

                  {/* Summary Rows */}
                  <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold tracking-tight">Item Price</span>
                      <span className="text-white font-black">{priceMatic} MATIC</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold tracking-tight">Platform Fee</span>
                      <span className="text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded-lg border border-emerald-400/20 text-[11px] uppercase">Included</span>
                    </div>
                    <div className="h-px bg-white/5 w-full" />
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-white font-bold text-lg tracking-tight">Total to Pay</span>
                      <span className="text-white font-black text-2xl">{priceMatic} MATIC</span>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3 font-bold">
                      <AlertCircle size={18} className="text-rose-400 mt-0.5 shrink-0" />
                      <div className="space-y-2">
                        <p className="text-xs text-rose-300 leading-relaxed">{error}</p>
                        <button 
                          onClick={() => setStep(STEPS.INPUT)}
                          className="text-[10px] text-rose-400 underline uppercase tracking-widest"
                        >
                          Modify Selection
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <button
                      disabled={loading}
                      onClick={handleConfirmPurchase}
                      className="aura-btn-primary w-full py-5 rounded-[1.5rem] flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <LoaderCircle size={20} className="animate-spin" />
                          <span>Processing Purchase...</span>
                        </>
                      ) : (
                        <span>Confirm Purchase</span>
                      )}
                    </button>
                    
                    <div className="flex items-center justify-center gap-2">
                      <ShieldCheck size={14} className="text-indigo-400" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Atomic On-chain Settlement
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === STEPS.SUCCESS && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8 space-y-8"
                >
                  <div className="mx-auto w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 text-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.1)]">
                    <CheckCircle2 size={48} />
                  </div>
                  <div className="space-y-3 px-4">
                    <h3 className="text-3xl font-black text-white leading-tight">Purchase Submitted!</h3>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed">
                      Your transaction has been broadcasted. It usually takes 15-30 seconds to confirm on the blockchain.
                    </p>
                  </div>
                  
                  {result?.txHash && (
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-left">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 px-1">Transaction Hash</p>
                      <div className="flex items-center justify-between gap-3 bg-black/40 p-3.5 rounded-xl border border-white/5">
                        <span className="text-xs font-mono text-white/90 break-all leading-relaxed">
                          {truncateAddress(result.txHash, 14, 14)}
                        </span>
                        <ExternalLink size={14} className="text-slate-600 shrink-0" />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      onCompleted?.(result);
                      handleClose();
                    }}
                    className="w-full bg-white text-slate-950 font-black py-5 rounded-[1.5rem] shadow-2xl hover:bg-slate-200 transition-all active:scale-95"
                  >
                    View My NFTs
                  </button>
                </motion.div>
              )}
            </div>

            {/* Footer Safety Visual */}
            {step !== STEPS.SUCCESS && (
              <div className="p-6 bg-slate-900/40 border-t border-white/5 flex items-center justify-center gap-3">
                <ShieldCheck size={14} className="text-emerald-500" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                   Secure Custodial Fulfillment
                </p>
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
