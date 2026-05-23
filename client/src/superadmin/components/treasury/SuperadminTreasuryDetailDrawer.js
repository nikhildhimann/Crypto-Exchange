import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminRuntimeBadge } from "../runtime/SuperadminRuntimeBadge";
import {
  formatRuntimeAbsoluteTime,
  formatRuntimeBalance,
  getRuntimeChainTone,
  getRuntimeStatusTone,
  humanizeRuntimeValue,
  truncateMiddle,
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
      <p className="text-base font-semibold text-rose-50">Treasury details unavailable</p>
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

export function SuperadminTreasuryDetailDrawer({
  treasuryId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const treasury = state.data;
  const quickLinks = treasury
    ? [
        { label: "Open chain view", to: `/superadmin/chains?search=${treasury.chain}` },
        { label: "Open deposits", to: `/superadmin/deposits?chain=${treasury.chain}&asset=${treasury.asset}` },
        { label: "Open withdrawals", to: `/superadmin/withdrawals?chain=${treasury.chain}&asset=${treasury.asset}` },
      ]
    : [];

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminRuntimeBadge tone={getRuntimeStatusTone(treasury?.status)}>
                {humanizeRuntimeValue(treasury?.status || "loading")}
              </SuperadminRuntimeBadge>
              <SuperadminRuntimeBadge tone={getRuntimeChainTone(treasury?.chain)}>
                {String(treasury?.chain || "chain").toUpperCase()}
              </SuperadminRuntimeBadge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Treasury inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {treasury ? truncateMiddle(treasury.address, 12, 8) : truncateMiddle(treasuryId, 12, 6)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only reserve wallet visibility for balance posture, usage metrics, and safe operational context.
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
          {state.loading && !treasury ? <LoadingState /> : null}
          {state.error && !treasury ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {treasury ? (
            <div className="space-y-4">
              <DetailSection
                title="Treasury summary"
                description="Core reserve wallet fields returned by the treasury detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Treasury id", value: treasury.id || "Unavailable" },
                    { label: "Chain", value: String(treasury.chain || "").toUpperCase() || "Unavailable" },
                    { label: "Asset", value: String(treasury.asset || "").toUpperCase() || "Unavailable" },
                    { label: "Wallet type", value: humanizeRuntimeValue(treasury.walletType) || "Unavailable" },
                    { label: "Balance", value: formatRuntimeBalance(treasury.balance, treasury.asset) },
                    { label: "Status", value: humanizeRuntimeValue(treasury.status) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Address and lifecycle"
                description="Safe operational context available on the current treasury contract."
              >
                <KeyValueGrid
                  items={[
                    { label: "Address", value: treasury.address || "Unavailable" },
                    { label: "Created", value: formatRuntimeAbsoluteTime(treasury.createdAt) || "Unavailable" },
                    { label: "Updated", value: formatRuntimeAbsoluteTime(treasury.updatedAt) || "Unavailable" },
                    { label: "Network", value: "Not exposed by current contract" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Activity summary"
                description="Counts derived safely for this treasury wallet."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Inbound deposits
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                      {treasury.metrics?.inboundDepositsCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Outbound withdrawals
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                      {treasury.metrics?.outboundWithdrawalsCount ?? 0}
                    </p>
                  </div>
                </div>

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
                title="Configuration posture"
                description="Thresholds, reserve targets, and sync telemetry are not exposed by the current treasury read contract."
              >
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                  <p className="text-sm font-medium text-white">Treasury configuration is intentionally limited</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    This view stays read-only and does not expose threshold settings, secrets, or mutation controls. Additional treasury controls can be layered in later without changing the surrounding runtime shell.
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
