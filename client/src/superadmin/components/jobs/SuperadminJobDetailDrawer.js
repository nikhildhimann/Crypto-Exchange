import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminRuntimeBadge } from "../runtime/SuperadminRuntimeBadge";
import {
  formatBooleanState,
  formatIntervalMs,
  formatRuntimeMetadataValue,
  getRuntimeStatusTone,
  humanizeRuntimeValue,
} from "../runtime/utils";

function DetailSection({ title, description, children }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4 sm:p-5">
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
        {description ? <p className="text-xs leading-5 text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function KeyValueGrid({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3.5"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {item.label}
          </p>
          <p className="mt-2 break-all text-sm leading-6 text-white">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4 sm:p-5">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded-full bg-white/10" />
            <div className="h-6 w-48 rounded-full bg-white/[0.08]" />
            <div className="h-4 w-full rounded-full bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-[24px] border border-rose-300/15 bg-rose-400/10 p-5">
      <p className="text-base font-semibold text-rose-50">Job details unavailable</p>
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

export function SuperadminJobDetailDrawer({
  jobName,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const job = state.data;
  const quickLinks = job
    ? [
        { label: "Open runtime page", to: "/superadmin/runtime" },
        { label: "Open audit logs", to: `/superadmin/audit?search=${job.jobName}` },
      ]
    : [];

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminRuntimeBadge tone={getRuntimeStatusTone(job?.status)}>
                {humanizeRuntimeValue(job?.status || "loading")}
              </SuperadminRuntimeBadge>
              <SuperadminRuntimeBadge tone={job?.enabled ? "emerald" : "rose"}>
                {formatBooleanState(job?.enabled)}
              </SuperadminRuntimeBadge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Job inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {job?.jobName || jobName}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only job visibility for schedule posture, queue state, and safe runtime metadata.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-200 transition hover:bg-white/[0.06]"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 lg:px-6">
          {state.loading && !job ? <LoadingState /> : null}
          {state.error && !job ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {job ? (
            <div className="space-y-4">
              <DetailSection
                title="Job summary"
                description="Core scheduler fields returned by the job detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Job name", value: job.jobName || "Unavailable" },
                    { label: "Status", value: humanizeRuntimeValue(job.status) || "Unavailable" },
                    { label: "Enabled", value: formatBooleanState(job.enabled) },
                    { label: "Scheduled", value: formatBooleanState(job.scheduled) },
                    { label: "Running", value: formatBooleanState(job.running) },
                    { label: "Interval", value: formatIntervalMs(job.intervalMs) },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Runtime and queue posture"
                description="Runtime signals currently available for this scheduler entry."
              >
                <KeyValueGrid
                  items={[
                    { label: "Queue enabled", value: formatBooleanState(job.queueEnabled) },
                    { label: "Runtime enabled", value: formatBooleanState(job.runtime?.enabled) },
                    { label: "Runtime scheduled", value: formatBooleanState(job.runtime?.scheduled) },
                    { label: "Runtime running", value: formatBooleanState(job.runtime?.running) },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Configuration summary"
                description="Current jobs contract exposes interval and enablement only; run history is not yet available."
              >
                <KeyValueGrid
                  items={[
                    { label: "Configured interval", value: formatIntervalMs(job.config?.intervalMs) },
                    { label: "Configured enabled", value: formatBooleanState(job.config?.enabled) },
                    { label: "Health status", value: formatRuntimeMetadataValue(job.health?.status) },
                    { label: "Health enabled", value: formatBooleanState(job.health?.enabled) },
                  ]}
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {quickLinks.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="inline-flex items-center justify-between rounded-[18px] border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <span>{item.label}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </DetailSection>

              <DetailSection
                title="History limitation"
                description="The current read contract stays intentionally light to avoid exposing misleading or incomplete run telemetry."
              >
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                  <p className="text-sm font-medium text-white">No run-history mutation surface</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Last run, last success, last error, and lock reset controls are not exposed yet. This module stays focused on runtime posture and safe operational inspection.
                  </p>
                </div>
              </DetailSection>
            </div>
          ) : null}
        </div>
      </div>
    </SuperadminDetailModal>
  );
}
