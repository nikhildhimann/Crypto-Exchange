import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminCopyValue, isLikelyCopyableDetail } from "../SuperadminCopyValue";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminRuntimeBadge } from "../runtime/SuperadminRuntimeBadge";
import {
  formatBooleanState,
  formatRuntimeMetadataValue,
  getRuntimeChainTone,
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
          <SuperadminCopyValue
            className="mt-2 w-full"
            compact
            label={item.label}
            value={item.value}
            displayValue={item.value}
            mono={item.mono ?? true}
            disabled={item.copyable === false || !isLikelyCopyableDetail(item.label, item.value)}
          />
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
      <p className="text-base font-semibold text-rose-50">Chain details unavailable</p>
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

export function SuperadminChainDetailDrawer({
  chainId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const chain = state.data;
  const quickLinks = chain
    ? [
        { label: "Open wallets", to: `/superadmin/wallets?chain=${chain.code}` },
        { label: "Open transactions", to: `/superadmin/transactions?chain=${chain.code}` },
        { label: "Open treasury", to: `/superadmin/treasury?chain=${chain.code}` },
      ]
    : [];

  const featureItems = Object.entries(chain?.features || {});
  const toggleItems = Object.entries(chain?.toggles || {});

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminRuntimeBadge tone={getRuntimeChainTone(chain?.code)}>
                {String(chain?.code || "chain").toUpperCase()}
              </SuperadminRuntimeBadge>
              <SuperadminRuntimeBadge tone={getRuntimeStatusTone(chain?.runtimeStatus)}>
                {humanizeRuntimeValue(chain?.runtimeStatus || "loading")}
              </SuperadminRuntimeBadge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Chain inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {chain?.label || String(chainId || "").toUpperCase()}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only chain visibility for runtime status, capability posture, and supported-network context.
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
          {state.loading && !chain ? <LoadingState /> : null}
          {state.error && !chain ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {chain ? (
            <div className="space-y-4">
              <DetailSection
                title="Chain summary"
                description="Core chain runtime fields returned by the chain detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Chain code", value: chain.code.toUpperCase() },
                    { label: "Label", value: chain.label || "Unavailable" },
                    { label: "Family", value: humanizeRuntimeValue(chain.family) || "Unavailable" },
                    { label: "Native asset", value: chain.nativeAssetSymbol || "Unavailable" },
                    { label: "Default network", value: chain.defaultNetwork || "Unavailable" },
                    { label: "Runtime status", value: humanizeRuntimeValue(chain.runtimeStatus) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Networks and capabilities"
                description="Supported runtime networks and feature posture exposed safely by the backend."
              >
                <KeyValueGrid
                  items={[
                    { label: "Configured networks", value: chain.configuredNetworks.join(", ") || "Unavailable" },
                    { label: "Runtime networks", value: chain.runtimeNetworks.join(", ") || "Unavailable" },
                    { label: "Explorer support", value: chain.explorer?.supported ? "Supported" : "Unavailable" },
                    { label: "Provisioning", value: formatRuntimeMetadataValue(chain.provisioning) },
                  ]}
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {featureItems.map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {humanizeRuntimeValue(label)}
                      </p>
                      <p className="mt-2 text-sm text-white">{formatBooleanState(value)}</p>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <DetailSection
                title="Runtime toggles"
                description="Current read-only toggle posture; no mutation controls are exposed here."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {toggleItems.map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {humanizeRuntimeValue(label)}
                      </p>
                      <p className="mt-2 text-sm text-white">{formatBooleanState(value)}</p>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <DetailSection
                title="Assets, tokens, and requirements"
                description="Environment requirement names are safe to show; raw values remain hidden."
              >
                <KeyValueGrid
                  items={[
                    { label: "Assets", value: String(chain.assets?.length || 0) },
                    { label: "Tokens", value: String(chain.tokens?.length || 0) },
                    { label: "Base unit", value: chain.baseUnitName || "Unavailable" },
                    { label: "Decimals", value: chain.decimals == null ? "Unavailable" : String(chain.decimals) },
                  ]}
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(chain.environmentRequirements || []).slice(0, 6).map((entry) => (
                    <div
                      key={entry.name}
                      className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-white">{entry.name}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{entry.description}</p>
                    </div>
                  ))}
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
            </div>
          ) : null}
        </div>
      </div>
    </SuperadminDetailModal>
  );
}
