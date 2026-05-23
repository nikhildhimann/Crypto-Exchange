import { ChevronLeft, ChevronRight, Eye, RefreshCw } from "lucide-react";
import { SuperadminCopyValue } from "../SuperadminCopyValue";
import { SuperadminTableScrollArea } from "../SuperadminTableScrollArea";
import { SuperadminRuntimeBadge } from "../runtime/SuperadminRuntimeBadge";
import {
  formatRuntimeAbsoluteTime,
  formatRuntimeRelativeTime,
  getRuntimeChainTone,
  getRuntimeStatusTone,
  humanizeRuntimeValue,
} from "../runtime/utils";

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_0.9fr_0.8fr_0.8fr_0.8fr_0.8fr_0.7fr] gap-3 rounded-[20px] border border-white/8 bg-slate-950/45 px-4 py-4"
        >
          {Array.from({ length: 7 }).map((__, cellIndex) => (
            <div key={cellIndex} className="h-4 rounded-full bg-white/[0.06]" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[24px] border border-dashed border-white/12 bg-slate-950/40 px-5 py-8 text-center">
      <p className="text-base font-semibold text-white">No chains matched these filters</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Adjust the runtime filters or search criteria to broaden the chain result set.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-[24px] border border-rose-300/15 bg-rose-400/10 px-5 py-6">
      <p className="text-base font-semibold text-rose-50">Chains list unavailable</p>
      <p className="mt-2 text-sm leading-6 text-rose-100/85">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.1] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.16]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}

function MobileCard({ item, onView }) {
  return (
    <button
      type="button"
      onClick={() => onView(item.code)}
      className="w-full rounded-[24px] border border-white/10 bg-slate-950/45 p-4 text-left transition hover:border-cyan-300/20 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">{item.label || item.code.toUpperCase()}</p>
          <p className="text-xs leading-5 text-slate-400">
            {item.code.toUpperCase()} • {humanizeRuntimeValue(item.family)}
          </p>
        </div>
        <SuperadminRuntimeBadge tone={getRuntimeStatusTone(item.runtimeStatus)}>
          {humanizeRuntimeValue(item.runtimeStatus)}
        </SuperadminRuntimeBadge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <SuperadminRuntimeBadge tone={item.enabled ? "emerald" : "rose"}>
          {item.enabled ? "Enabled" : "Disabled"}
        </SuperadminRuntimeBadge>
        <SuperadminRuntimeBadge tone={item.maintenance ? "amber" : "slate"}>
          {item.maintenance ? "Maintenance" : "Normal"}
        </SuperadminRuntimeBadge>
      </div>
    </button>
  );
}

export function SuperadminChainsTable({
  state,
  onRetry,
  onPageChange,
  onView,
}) {
  const data = state.data;
  const items = data?.items || [];

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(2,6,23,0.24)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">Chains</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Runtime-capable chain inventory with health posture and independent detail inspection.
          </p>
        </div>
        {state.loading && data ? <SuperadminRuntimeBadge tone="cyan">Updating</SuperadminRuntimeBadge> : null}
      </div>

      <div className="px-5 py-5 sm:px-6">
        {state.error && !data ? <ErrorState message={state.error} onRetry={onRetry} /> : null}
        {state.loading && !data ? <TableSkeleton /> : null}
        {!state.loading && !state.error && items.length === 0 ? <EmptyState /> : null}
        {state.error && data ? (
          <div className="mb-4 rounded-[20px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{state.error}. Showing the last successful chain result set.</p>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.14]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="space-y-3 md:hidden">
              {items.map((item) => (
                <MobileCard key={item.id} item={item} onView={onView} />
              ))}
            </div>

            <SuperadminTableScrollArea className="hidden md:block" viewportClassName="pb-2">
              <table className="min-w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      <th className="px-4 py-2">Chain</th>
                      <th className="px-4 py-2">Family</th>
                      <th className="px-4 py-2">Networks</th>
                      <th className="px-4 py-2">Enablement</th>
                      <th className="px-4 py-2">Maintenance</th>
                      <th className="px-4 py-2">Runtime status</th>
                      <th className="px-4 py-2">Updated</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="bg-slate-950/45 text-sm text-slate-300">
                        <td className="rounded-l-[20px] border border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-2">
                            <SuperadminCopyValue
                              className="font-semibold"
                              compact
                              label="chain code"
                              value={item.code}
                              displayValue={item.label || item.code.toUpperCase()}
                              mono={false}
                            />
                            <SuperadminRuntimeBadge tone={getRuntimeChainTone(item.code)}>
                              {item.code.toUpperCase()}
                            </SuperadminRuntimeBadge>
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          {humanizeRuntimeValue(item.family)}
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          {item.supportedNetworkCount}
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <SuperadminRuntimeBadge tone={item.enabled ? "emerald" : "rose"}>
                            {item.enabled ? "Enabled" : "Disabled"}
                          </SuperadminRuntimeBadge>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <SuperadminRuntimeBadge tone={item.maintenance ? "amber" : "slate"}>
                            {item.maintenance ? "Maintenance" : "Normal"}
                          </SuperadminRuntimeBadge>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1">
                            <SuperadminRuntimeBadge tone={getRuntimeStatusTone(item.runtimeStatus)}>
                              {humanizeRuntimeValue(item.runtimeStatus)}
                            </SuperadminRuntimeBadge>
                            {item.runtimeStatusReason ? (
                              <p className="text-xs text-slate-500">{item.runtimeStatusReason}</p>
                            ) : null}
                          </div>
                        </td>
                        <td
                          className="border border-l-0 border-r-0 border-white/8 px-4 py-4"
                          title={formatRuntimeAbsoluteTime(item.updatedAt)}
                        >
                          {formatRuntimeRelativeTime(item.updatedAt)}
                        </td>
                        <td className="rounded-r-[20px] border border-l-0 border-white/8 px-4 py-4">
                          <button
                            type="button"
                            onClick={() => onView(item.code)}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SuperadminTableScrollArea>

            <div className="mt-5 flex flex-col gap-4 border-t border-white/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">
                Showing page {data.page} of {data.totalPages || 1} with {data.total} chains.
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onPageChange(data.page - 1)}
                  disabled={!data.hasPrevPage}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => onPageChange(data.page + 1)}
                  disabled={!data.hasNextPage}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}



