import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft,
  X,
  ShieldCheck,
  LoaderCircle,
  CheckCircle2,
  ImageOff,
  AlertCircle,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { listNftForSale } from "../../api/marketplace";
import { getErrorMessage } from "../../lib/errorMessage";

const STEPS = {
  INPUT: "INPUT",
  CONFIRM: "CONFIRM",
  SUCCESS: "SUCCESS"
};

const EXPIRY_OPTIONS = [
  { label: "3 Days", value: 3 },
  { label: "7 Days", value: 7 },
  { label: "30 Days", value: 30 },
  { label: "90 Days", value: 90 }
];

export function NftListForSaleModal({ open, nft, walletId, onClose, onCompleted }) {
  const [step, setStep] = useState(STEPS.INPUT);
  const [price, setPrice] = useState("");
  const [expirationDays, setExpirationDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) {
      // Reset state when closed
      setTimeout(() => {
        setStep(STEPS.INPUT);
        setPrice("");
        setExpirationDays(7);
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

  const handlePriceChange = (e) => {
    const val = e.target.value.replace(/,/g, ".");
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setPrice(val);
      setError("");
    }
  };

  const handleNextStep = () => {
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      setError("Please enter a valid listing price");
      return;
    }
    setStep(STEPS.CONFIRM);
  };

  const handleListForSale = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await listNftForSale({
        walletId,
        nftId: nft.id || nft._id,
        priceInMatic: parseFloat(price),
        expirationDays,
        chain: nft.chain || "polygon"
      });

      if (response.success) {
        setResult(response.data);
        setStep(STEPS.SUCCESS);
        toast.success("NFT listed successfully!");
      } else {
        throw new Error(response.message || "Failed to create listing");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Listing failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const platformFeePercent = 2.5;
  const platformFee = price ? (parseFloat(price) * platformFeePercent) / 100 : 0;
  const earnings = price ? parseFloat(price) - platformFee : 0;

  const nftTitle = nft?.name || (nft?.tokenId ? `Token #${nft.tokenId}` : "NFT Asset");
  const imageUrl = nft?.imageUrl || nft?.image || "";

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
                {step === STEPS.SUCCESS ? "Success" : "List for Sale"}
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
                  {/* NFT Preview */}
                  <div className="flex flex-col items-center">
                    <div className="w-28 h-28 rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 mb-4 bg-slate-900">
                      {imageUrl ? (
                        <img src={imageUrl} alt={nftTitle} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700">
                          <ImageOff size={32} />
                        </div>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-white text-center line-clamp-1">{nftTitle}</h3>
                    <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">
                      {nft?.collectionName || "Polygon Network"}
                    </p>
                  </div>

                  {/* Price Input */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Set Price (MATIC)
                    </label>
                    <div className="relative group">
                      <input
                        autoFocus
                        type="text"
                        inputMode="decimal"
                        value={price}
                        onChange={handlePriceChange}
                        placeholder="0.00"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white text-3xl font-black focus:outline-none focus:border-indigo-600 transition-all placeholder:text-slate-800"
                      />
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 font-black text-lg">
                        MATIC
                      </div>
                    </div>
                  </div>

                  {/* Expiry Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      <Calendar size={12} />
                      <span>Duration</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {EXPIRY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setExpirationDays(opt.value)}
                          className={`py-3 rounded-xl text-[10px] font-black transition-all border ${
                            expirationDays === opt.value
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                              : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
                      <AlertCircle size={18} className="text-rose-400 mt-0.5 shrink-0" />
                      <p className="text-xs font-bold text-rose-300 leading-relaxed">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleNextStep}
                    className="aura-btn-primary w-full py-5 rounded-[1.5rem]"
                  >
                    Continue
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
                    <h3 className="text-2xl font-black text-white">Review Listing</h3>
                    <p className="text-slate-400 text-sm mt-1">Check the details before publishing</p>
                  </div>

                  {/* Summary Card */}
                  <div className="bg-white/5 border border-white/5 rounded-[2rem] p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm font-medium">NFT</span>
                      <span className="text-white text-sm font-bold truncate max-w-[180px]">{nftTitle}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm font-medium">Listing Price</span>
                      <span className="text-white text-sm font-bold">{price} MATIC</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm font-medium">Duration</span>
                      <span className="text-white text-sm font-bold">
                        {EXPIRY_OPTIONS.find((o) => o.value === expirationDays)?.label}
                      </span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm font-medium">Platform Fee (2.5%)</span>
                      <span className="text-slate-400 text-sm font-bold">{platformFee.toFixed(4)} MATIC</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-white text-sm font-bold">You will earn</span>
                      <span className="text-emerald-400 text-lg font-black">{earnings.toFixed(4)} MATIC</span>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
                      <AlertCircle size={18} className="text-rose-400 mt-0.5 shrink-0" />
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-rose-300 leading-relaxed">{error}</p>
                        <button 
                          onClick={() => setStep(STEPS.INPUT)}
                          className="text-[10px] font-black text-rose-400 underline uppercase tracking-widest"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <button
                      disabled={loading}
                      onClick={handleListForSale}
                      className="aura-btn-primary w-full py-5 rounded-[1.5rem] flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <LoaderCircle size={20} className="animate-spin" />
                          <span>Listing NFT...</span>
                        </>
                      ) : (
                        <span>Confirm Listing</span>
                      )}
                    </button>
                    
                    <div className="flex items-center justify-center gap-2">
                      <ShieldCheck size={14} className="text-indigo-400" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Published via Seaport Protocol
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
                  <div className="mx-auto w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                    <CheckCircle2 size={48} />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-white">NFT Listed!</h3>
                    <p className="text-slate-400 mt-3 leading-relaxed">
                      Your NFT is now live on the marketplace. You can manage your listings from your profile.
                    </p>
                  </div>
                  
                  {result?.orderId && (
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-left">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Order Hash</p>
                      <p className="text-xs font-mono text-white break-all bg-black/30 p-3 rounded-lg border border-white/5">
                        {result.orderId}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      onCompleted?.(result);
                      handleClose();
                    }}
                    className="w-full bg-white text-slate-950 font-black py-5 rounded-[1.5rem] shadow-2xl hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Done
                  </button>
                </motion.div>
              )}
            </div>

            {/* Safety Banner */}
            {step !== STEPS.SUCCESS && (
              <div className="px-6 py-5 bg-slate-900/30 border-t border-white/5">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] italic">
                    Gasless Listing via Seaport
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
