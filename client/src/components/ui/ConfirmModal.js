import { motion, AnimatePresence } from "motion/react";
import { LogOut, X } from "lucide-react";

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description = "Please confirm this action to proceed.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading = false,
}) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Backdrop Glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
             <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px]" />
        </div>

        {/* Modal */}
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
          className="relative w-full max-w-sm mx-auto bg-slate-950 border-t sm:border border-slate-800 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl z-10 sm:mb-0 mb-safe"
        >
          {/* Handle for mobile */}
          <div className="sm:hidden w-12 h-1 bg-slate-800 rounded-full mx-auto -mt-2 mb-6 opacity-50" />

          <div className="flex flex-col items-center text-center">
            {/* Icon Box */}
            <div className="w-20 h-20 bg-rose-500/10 rounded-[2rem] flex items-center justify-center mb-6 border border-rose-500/20 relative">
               <div className="absolute inset-0 bg-rose-500/5 blur-xl rounded-full" />
               <LogOut size={32} className="text-rose-500 relative z-10" />
            </div>

            <h3 className="text-2xl font-black tracking-tight text-white mb-3">
              {title}
            </h3>
            <p className="text-slate-400 font-medium leading-relaxed px-2">
              {description}
            </p>

            <div className="w-full space-y-3 mt-10">
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className="w-full bg-rose-500 hover:bg-rose-400 text-white font-black py-4.5 rounded-2xl transition-all shadow-[0_10px_25px_-5px_rgba(244,63,94,0.3)] active:scale-[0.98] flex items-center justify-center space-x-2 text-base disabled:opacity-50"
              >
                {isLoading && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                )}
                <span>{confirmLabel}</span>
              </button>

              <button
                onClick={onClose}
                disabled={isLoading}
                className="w-full bg-slate-900/50 border border-slate-800 hover:bg-slate-800/80 text-slate-300 font-bold py-4.5 rounded-2xl transition-all text-center text-base disabled:opacity-50"
              >
                {cancelLabel}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
