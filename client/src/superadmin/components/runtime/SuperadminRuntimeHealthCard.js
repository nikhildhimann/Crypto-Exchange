import { SuperadminRuntimeBadge } from "./SuperadminRuntimeBadge";

export function SuperadminRuntimeHealthCard({
  title,
  value,
  helper,
  tone = "slate",
  badgeLabel,
  icon: Icon,
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {title}
          </p>
          <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <div className="rounded-[18px] border border-white/8 bg-white/[0.04] p-3 text-slate-200">
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </div>
      </div>
      {helper ? <p className="mt-3 text-sm leading-6 text-slate-400">{helper}</p> : null}
      <div className="mt-4">
        <SuperadminRuntimeBadge tone={tone}>{badgeLabel || title}</SuperadminRuntimeBadge>
      </div>
    </div>
  );
}
