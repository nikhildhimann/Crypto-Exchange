import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "../../../lib/utils";
import { SuperadminOverviewStatusBadge } from "./SuperadminOverviewStatusBadge";

function LoadingRows({ count }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-[22px] border border-white/8 bg-slate-950/45 px-4 py-4"
        >
          <div className="space-y-3">
            <div className="h-2.5 w-32 rounded-full bg-white/10" />
            <div className="h-2 w-full max-w-xs rounded-full bg-white/6" />
            <div className="h-2 w-20 rounded-full bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SuperadminOverviewActivityList({
  title,
  description = "",
  items = [],
  loading = false,
  error = "",
  emptyTitle = "No data available",
  emptyDescription = "This panel will populate once matching activity is available.",
  loadingRows = 4,
  onRetry,
  footer = null,
  renderItem,
  className,
}) {
  const hasItems = items.length > 0;
  const showLoadingState = loading && !hasItems;
  const showErrorState = !showLoadingState && !hasItems && error;
  const showEmptyState = !showLoadingState && !showErrorState && !hasItems;

  return (
    <div className={cn("rounded-[24px] border border-white/10 bg-slate-950/45 p-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
          {description ? (
            <p className="text-xs leading-5 text-slate-400">{description}</p>
          ) : null}
        </div>
        {loading && hasItems ? (
          <SuperadminOverviewStatusBadge tone="cyan">Updating</SuperadminOverviewStatusBadge>
        ) : null}
      </div>

      <div className="mt-4">
        {showLoadingState ? <LoadingRows count={loadingRows} /> : null}

        {showErrorState ? (
          <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" />
              <div className="space-y-3">
                <div>
                  <p className="font-medium">{error}</p>
                  <p className="mt-1 text-rose-100/80">
                    Retry this panel to restore the latest operational data.
                  </p>
                </div>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-rose-50 transition hover:bg-white/15"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {showEmptyState ? (
          <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
            <p className="text-sm font-medium text-white">{emptyTitle}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{emptyDescription}</p>
          </div>
        ) : null}

        {hasItems ? (
          <div className="space-y-3">
            {items.map((item, index) => renderItem(item, index))}
          </div>
        ) : null}
      </div>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  );
}
