export function SuperadminEmptyState({
  eyebrow = "Not configured",
  title,
  description,
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/12 bg-slate-950/40 p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/75">
        {eyebrow}
      </p>
      <div className="mt-3 space-y-2">
        <h3 className="text-xl font-semibold tracking-tight text-white">{title}</h3>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
    </div>
  );
}
