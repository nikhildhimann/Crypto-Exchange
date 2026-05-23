import { motion, AnimatePresence } from "motion/react";
import { Check, X, Clipboard, ExternalLink, Clock3 } from "lucide-react";
import { useAppContext } from "../../contexts/AppContext";

export function TransactionStatus() {
  const { transactionStatus, closeTransactionStatus, fiatCurrency } = useAppContext();

  if (!transactionStatus) return null;

  const {
    success,
    amount,
    asset,
    recipientAddress,
    recipientName,
    timestamp,
    errorReason,
    title,
    message,
    variant,
    pending,
    dismissible = true,
    primaryLabel,
    secondaryLabel,
    hideSecondaryAction,
  } = transactionStatus;
  const normalizedVariant = String(variant || "").trim().toLowerCase();
  const isPending = pending === true || normalizedVariant === "pending";
  const isFailed =
    !isPending &&
    (success === false ||
      normalizedVariant === "failed" ||
      normalizedVariant === "error");
  const isSuccess = !isPending && !isFailed;

  const handleShare = () => {
    alert("Transaction receipt shared!");
  };

  return (
    <AnimatePresence>
      {transactionStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissible ? () => closeTransactionStatus("backdrop") : undefined}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="relative transform overflow-hidden rounded-[2rem] bg-slate-900 border border-slate-800 p-4 shadow-2xl w-full max-w-[340px]"
          >
            <div className="flex flex-col items-center text-center">
              {/* Animated Icon - Smaller */}
              <div className="relative mb-5">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                  className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    isPending
                      ? "bg-amber-500/20 border border-amber-500/30 text-amber-400"
                      : isSuccess
                      ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400" 
                      : "bg-rose-500/20 border border-rose-500/30 text-rose-400"
                  } shadow-xl ${
                    isPending
                      ? "shadow-amber-500/20"
                      : isSuccess
                        ? "shadow-emerald-500/20"
                        : "shadow-rose-500/20"
                  }`}
                >
                  {isPending ? (
                    <Clock3 size={32} strokeWidth={2.6} className="animate-pulse" />
                  ) : isSuccess ? (
                    <motion.div
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.4 }}
                    >
                      <Check size={32} strokeWidth={3} />
                    </motion.div>
                  ) : (
                    <X size={32} strokeWidth={3} />
                  )}
                </motion.div>
              </div>

              <h2 className={`text-xl tracking-wider font-semibold font-black mb-1 ${
                isPending ? "text-amber-300" : isSuccess ? "text-white" : "text-rose-400"
              }`}>
                {title || (isPending ? "Pending" : isSuccess ? "Success!" : "Failed")}
              </h2>
              
              {(isPending || isFailed) && (
                <p className="text-slate-400 text-xs font-medium mb-5 leading-relaxed px-2">
                  {message || errorReason || (isPending
                    ? "Your transaction is processing."
                    : "Something went wrong. Please try again later.")}
                </p>
              )}

              {isSuccess && (
                <>
                  <div className="mb-6">
                    <span className="text-2xl tracking-wider font-extrabold text-white">
                      {amount} {asset?.symbol}
                    </span>
                    <p className="text-slate-500 text-[12px] font-bold mt-0.5 uppercase tracking-widest text-[10px]">
                       ≈ {fiatCurrency}{(parseFloat(amount) * (asset?.fiatValue / parseFloat(asset?.balance || "1"))).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  <div className="w-full space-y-3 mb-6">
                    <div className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-3 flex flex-col space-y-2.5">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">To</span>
                        <span className="text-white tracking-wider">{recipientName?.length > 15 ? recipientName.slice(0, 12) + "..." : recipientName}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">Address</span>
                        <div className="flex items-center space-x-1.5 cursor-pointer hover:text-indigo-400 transition-colors text-sm">
                           <span className="text-slate-400 font-mono text-[12px]">{recipientAddress?.slice(0, 4)}...{recipientAddress?.slice(-4)}</span>
                           <Clipboard size={10} className="text-slate-600" />
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">Time</span>
                        <span className="text-slate-400 font-medium text-[12px]">{timestamp}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className={`w-full ${hideSecondaryAction || !isSuccess ? "" : "grid grid-cols-2 gap-3"}`}>
                <button
                  onClick={() => closeTransactionStatus("primary")}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95 text-sm"
                >
                  {primaryLabel || (isPending ? "Close" : "Close")}
                </button>

                {!hideSecondaryAction && isSuccess ? (
                  <button
                    onClick={handleShare}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center justify-center space-x-1.5 text-sm"
                  >
                    <ExternalLink size={14} />
                    <span>{secondaryLabel || "Share"}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
