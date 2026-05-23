import { useEffect } from "react";

export function SuperadminDetailModal({
  open,
  onClose,
  closeLabel = "Close details",
  children,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6 lg:p-8">
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/82 backdrop-blur-sm"
      />

      <div className="relative z-[1] w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-[#06111f] shadow-[0_30px_120px_rgba(2,6,23,0.68)]">
        {children}
      </div>
    </div>
  );
}
