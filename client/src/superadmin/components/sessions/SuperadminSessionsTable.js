import { ChevronLeft, ChevronRight, Eye, RefreshCw } from "lucide-react";
import { SuperadminCopyValue } from "../SuperadminCopyValue";
import { SuperadminTableScrollArea } from "../SuperadminTableScrollArea";
import { SuperadminSessionsBadge } from "./SuperadminSessionsBadge";
import {
  formatSessionAbsoluteTime,
  formatSessionDisplayId,
  formatSessionRelativeTime,
  getSessionActorLabel,
  getSessionPlatformTone,
  getSessionScopeTone,
  getSessionStatusTone,
  humanizeSessionValue,
  truncateMiddle,
} from "./utils";

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_1fr_0.75fr_1fr_0.8fr_0.9fr_0.9fr_0.9fr_0.9fr_0.7fr] gap-3 rounded-[20px] border border-white/8 bg-slate-950/45 px-4 py-4"
        >
          {Array.from({ length: 10 }).map((__, cellIndex) => (
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
      <p className="text-base font-semibold text-white">No sessions matched these filters</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Adjust the server-side filters or search criteria to broaden the result set.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-[24px] border border-rose-300/15 bg-rose-400/10 px-5 py-6">
      <p className="text-base font-semibold text-rose-50">Sessions list unavailable</p>
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
      onClick={() => onView(item.sessionId, item.scope)}
      className="w-full rounded-[24px] border border-white/10 bg-slate-950/45 p-4 text-left transition hover:border-cyan-300/20 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">{formatSessionDisplayId(item)}</p>
          <p className="text-xs leading-5 text-slate-400">
            {getSessionActorLabel(item.actor, item.scope)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SuperadminSessionsBadge tone={getSessionStatusTone(item.status)}>
            {humanizeSessionValue(item.status)}
          </SuperadminSessionsBadge>
          <SuperadminSessionsBadge tone={getSessionScopeTone(item.scope)}>
            {humanizeSessionValue(item.scope)}
          </SuperadminSessionsBadge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Platform</p>
          <p className="mt-1 text-slate-200">{item.platform || "Unavailable"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">IP</p>
          <p className="mt-1 text-slate-200">{item.ipAddress || "Unavailable"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Last used</p>
          <p className="mt-1 text-slate-200">{formatSessionRelativeTime(item.lastUsedAt)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Expires</p>
          <p className="mt-1 text-slate-200">{formatSessionRelativeTime(item.expiresAt)}</p>
        </div>
      </div>
    </button>
  );
}

export function SuperadminSessionsTable({
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
          <h2 className="text-lg font-semibold tracking-tight text-white">Sessions</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Global access sessions with actor context, device posture, and independent detail inspection.
          </p>
        </div>
        {state.loading && data ? (
          <SuperadminSessionsBadge tone="cyan">Updating</SuperadminSessionsBadge>
        ) : null}
      </div>

      <div className="px-5 py-5 sm:px-6">
        {state.error && !data ? <ErrorState message={state.error} onRetry={onRetry} /> : null}
        {state.loading && !data ? <TableSkeleton /> : null}
        {!state.loading && !state.error && items.length === 0 ? <EmptyState /> : null}
        {state.error && data ? (
          <div className="mb-4 rounded-[20px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{state.error}. Showing the last successful result set.</p>
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
                      <th className="px-4 py-2">Session</th>
                      <th className="px-4 py-2">Identity</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Device</th>
                      <th className="px-4 py-2">Platform</th>
                      <th className="px-4 py-2">Security</th>
                      <th className="px-4 py-2">Last used</th>
                      <th className="px-4 py-2">Expires</th>
                      <th className="px-4 py-2">Created</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="bg-slate-950/45 text-sm text-slate-300">
                        <td className="rounded-l-[20px] border border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1">
                            <SuperadminCopyValue
                              className="font-semibold text-sm"
                              compact
                              label="session id"
                              value={item.sessionId}
                              displayValue={formatSessionDisplayId(item)}
                              mono={false}
                            />
                            <SuperadminCopyValue
                              className="text-xs text-slate-500"
                              compact
                              label="session id"
                              value={item.sessionId}
                              displayValue={truncateMiddle(item.sessionId, 10, 6)}
                            />
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-2">
                            <p className="text-white">{truncateMiddle(getSessionActorLabel(item.actor, item.scope), 14, 8)}</p>
                            <div className="flex flex-wrap gap-2">
                              <SuperadminSessionsBadge tone={getSessionScopeTone(item.scope)}>
                                {humanizeSessionValue(item.scope)}
                              </SuperadminSessionsBadge>
                              {item.actor?.role ? (
                                <SuperadminSessionsBadge tone="slate">
                                  {humanizeSessionValue(item.actor.role)}
                                </SuperadminSessionsBadge>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <SuperadminSessionsBadge tone={getSessionStatusTone(item.status)}>
                            {humanizeSessionValue(item.status)}
                          </SuperadminSessionsBadge>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1">
                            <p className="text-white">{item.deviceLabel || "Unnamed device"}</p>
                            <SuperadminCopyValue
                              className="text-xs text-slate-500"
                              compact
                              label="device id"
                              value={item.deviceId}
                              displayValue={truncateMiddle(item.deviceId, 12, 6)}
                              disabled={!item.deviceId}
                            />
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <SuperadminSessionsBadge tone={getSessionPlatformTone(item.platform)}>
                              {humanizeSessionValue(item.platform || "unknown")}
                            </SuperadminSessionsBadge>
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1">
                            <p className="text-white">{item.biometricCapable ? "Biometric capable" : "No biometric flag"}</p>
                            <p className="text-xs text-slate-500">{item.ipAddress || "IP unavailable"}</p>
                          </div>
                        </td>
                        <td
                          className="border border-l-0 border-r-0 border-white/8 px-4 py-4"
                          title={formatSessionAbsoluteTime(item.lastUsedAt)}
                        >
                          {formatSessionRelativeTime(item.lastUsedAt)}
                        </td>
                        <td
                          className="border border-l-0 border-r-0 border-white/8 px-4 py-4"
                          title={formatSessionAbsoluteTime(item.expiresAt)}
                        >
                          {formatSessionRelativeTime(item.expiresAt)}
                        </td>
                        <td
                          className="border border-l-0 border-r-0 border-white/8 px-4 py-4"
                          title={formatSessionAbsoluteTime(item.createdAt)}
                        >
                          {formatSessionRelativeTime(item.createdAt)}
                        </td>
                        <td className="rounded-r-[20px] border border-l-0 border-white/8 px-4 py-4">
                          <button
                            type="button"
                            onClick={() => onView(item.sessionId, item.scope)}
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
                Showing page {data.page} of {data.totalPages || 1} with {data.total} total sessions.
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



