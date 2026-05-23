import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LogOut, X } from "lucide-react";
import { cn } from "../../lib/utils";

export function SuperadminConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description = "Please confirm this action to proceed.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "rose",
  isLoading = false,
  icon: Icon = LogOut,
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const toneClasses = {
    rose: "bg-rose-400/10 text-rose-300 border-rose-400/20 hover:bg-rose-400/20",
    buttonRose: "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-900/20",
    cyan: "bg-cyan-400/10 text-cyan-300 border-cyan-400/20 hover:bg-cyan-400/20",
    buttonCyan: "bg-cyan-500 hover:bg-cyan-600 text-white shadow-cyan-900/20",
  };

  const selectedTone = toneClasses[tone] || toneClasses.rose;
  const buttonTone = tone === "cyan" ? toneClasses.buttonCyan : toneClasses.buttonRose;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-lg animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div
        ref={modalRef}
        className="relative w-full max-w-md scale-100 transform overflow-hidden rounded-[32px] border border-white/10 bg-[#0b1424] p-6 shadow-[0_40px_100px_rgba(2,6,23,0.8)] transition-all animate-in zoom-in-95 fade-in duration-300 sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className={cn("mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors", selectedTone)}>
            <Icon className="h-7 w-7" />
          </div>

          <h3 className="text-2xl font-semibold tracking-tight text-white">{title}</h3>
          <p className="mt-3 leading-relaxed text-slate-400">{description}</p>

          <div className="mt-10 flex w-full flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                "order-2 flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 sm:order-1",
                buttonTone
              )}
            >
              {isLoading && (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              )}
              {confirmLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="order-1 flex flex-1 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] py-4 text-sm font-bold uppercase tracking-widest text-slate-300 transition-all hover:bg-white/[0.06] hover:text-white active:scale-95 disabled:opacity-50 sm:order-2"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
