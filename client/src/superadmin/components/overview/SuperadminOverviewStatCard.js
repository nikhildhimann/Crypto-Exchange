import { cn } from "../../../lib/utils";
import { Link } from "react-router";
import { SuperadminOverviewStatusBadge } from "./SuperadminOverviewStatusBadge";

const TONE_CLASSES = {
  slate: "from-white/10 via-white/[0.05] to-transparent",
  cyan: "from-cyan-400/20 via-cyan-300/8 to-transparent",
  emerald: "from-emerald-400/20 via-emerald-300/8 to-transparent",
  amber: "from-amber-400/20 via-amber-300/8 to-transparent",
  rose: "from-rose-400/20 via-rose-300/8 to-transparent",
};

export function SuperadminOverviewStatCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "slate",
  badge = null,
  loading = false,
  className,
  to = "",
}) {
  const content = (
    <>
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br",
          TONE_CLASSES[tone] || TONE_CLASSES.slate,
        )}
      />

      <div className="relative flex h-full flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.05] text-slate-100">
            {Icon ? <Icon className="h-5 w-5" /> : null}
          </div>
          {badge ? <SuperadminOverviewStatusBadge tone={tone}>{badge}</SuperadminOverviewStatusBadge> : null}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            {label}
          </p>

          {loading ? (
            <div className="space-y-3">
              <div className="h-8 w-28 rounded-full bg-white/10" />
              <div className="h-2.5 w-36 rounded-full bg-white/6" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-3xl font-semibold tracking-tight text-white sm:text-[2rem]">
                {value}
              </p>
              <p className="min-h-[40px] text-sm leading-6 text-slate-400">
                {helper}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  const baseClassName = cn(
    "relative min-h-[178px] overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.34)]",
    to
      ? "group block cursor-pointer transition hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/30"
      : "",
    className,
  );

  if (to) {
    return (
      <Link to={to} className={baseClassName}>
        {content}
      </Link>
    );
  }

  return (
    <article className={baseClassName}>
      {content}
    </article>
  );
}
