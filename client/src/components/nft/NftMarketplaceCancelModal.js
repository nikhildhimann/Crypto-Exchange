import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  X,
  ShieldCheck,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  ImageOff
} from "lucide-react";
import { toast } from "sonner";
import { cancelListing } from "../../api/marketplace";
import { getErrorMessage } from "../../lib/errorMessage";

const STEPS = {
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

export function NftMarketplaceCancelModal({ open, listing, walletId, onClose, onCompleted }) {
  const [step, setStep] = useState(STEPS.CONFIRM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(STEPS.CONFIRM);
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

  const handleCancelListing = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await cancelListing({
        walletId,
        listingId: listing.orderId,
        chain: "polygon"
      });

      if (response.success) {
        setResult(response.data);
        setStep(STEPS.SUCCESS);
        toast.success("Listing cancelled successfully!");
      } else {
        throw new Error(response.message || "Cancellation failed");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to cancel listing. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const priceMatic = formatWeiToMatic(listing?.priceInWei);
  const nftTitle = listing?.token?.name || `Token #${listing?.token?.tokenId}`;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className="relative z-10 w-full max-w-md rounded-t-[2.5rem] border border-white/5 bg-slate-950 shadow-2xl sm:mb-6 sm:rounded-[2.5rem] overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div className="w-8" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                {step === STEPS.SUCCESS ? "Cancelled" : "Cancel Listing"}
              </h2>
              <button 
                onClick={handleClose} 
                disabled={loading} 
                className="p-2 -mr-2 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-8">
              {step === STEPS.CONFIRM && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-8"
                >
                   <div className="flex flex-col items-center">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xl border border-white/10 mb-5 bg-slate-900 flex items-center justify-center text-slate-700">
                      <ImageOff size={32} />
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-xl font-bold text-white">{nftTitle}</h3>
                      <p className="text-sm text-slate-500 font-medium">{priceMatic} MATIC</p>
                    </div>
                  </div>

                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5 flex items-start gap-4">
                    <AlertCircle size={20} className="text-rose-500 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-rose-200">Are you sure?</p>
                      <p className="text-xs text-rose-300/70 leading-relaxed font-medium">
                        Cancelling this listing will remove it from the public marketplace. 
                        This action will be broadcasted to OpenSea.
                      </p>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
                      <AlertCircle size={18} className="text-rose-400 mt-0.5 shrink-0" />
                      <p className="text-xs font-bold text-rose-300 leading-relaxed">{error}</p>
                    </div>
                  )}

                  <div className="space-y-4 pt-2">
                    <button
                      disabled={loading}
                      onClick={handleCancelListing}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-rose-900/20 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <LoaderCircle size={20} className="animate-spin" />
                          <span>Cancelling...</span>
                        </>
                      ) : (
                        <span>Confirm Cancellation</span>
                      )}
                    </button>
                    
                    <div className="flex items-center justify-center gap-2">
                      <ShieldCheck size={14} className="text-slate-500" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                        Off-chain invalidation first
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === STEPS.SUCCESS && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-6 space-y-8"
                >
                  <div className="mx-auto w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                    <CheckCircle2 size={40} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black text-white">Listing Removed</h3>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed px-4">
                      The listing has been successfully cancelled and removed from the marketplace.
                    </p>
                  </div>
                  
                  <button
                    onClick={() => {
                      onCompleted?.(result);
                      handleClose();
                    }}
                    className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl shadow-2xl hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Done
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
