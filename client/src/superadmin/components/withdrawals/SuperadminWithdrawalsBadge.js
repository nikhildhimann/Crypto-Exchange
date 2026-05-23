export function SuperadminWithdrawalsBadge({ tone = "slate", children }) {
  const toneClasses = {
    slate: "border-slate-300/20 bg-slate-400/10 text-slate-200",
    amber: "border-amber-300/20 bg-amber-400/10 text-amber-200",
    cyan: "border-cyan-300/20 bg-cyan-400/10 text-cyan-200",
    emerald: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
    rose: "border-rose-300/20 bg-rose-400/10 text-rose-200",
  };

  return (
    <div
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${toneClasses[tone] || toneClasses.slate}`}
    >
      {children}
    </div>
  );
}
