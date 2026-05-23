import {
  AlertTriangle,
  DatabaseZap,
  HeartPulse,
  RefreshCw,
  ServerCog,
  Vault,
  Waypoints,
} from "lucide-react";
import { Link } from "react-router";
import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminSectionCard } from "../components/SuperadminSectionCard";
import { SuperadminRuntimeBadge } from "../components/runtime/SuperadminRuntimeBadge";
import { SuperadminRuntimeHealthCard } from "../components/runtime/SuperadminRuntimeHealthCard";
import {
  formatRuntimeBalance,
  formatRuntimeCount,
  formatRuntimeRelativeTime,
  getRuntimeChainTone,
  getRuntimeStatusTone,
  humanizeRuntimeValue,
} from "../components/runtime/utils";
import { useSuperadminRuntimeStatus } from "../hooks/useSuperadminRuntimeStatus";

function PanelError({ title, message, onRetry }) {
  return (
    <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 p-4">
      <p className="text-sm font-semibold text-rose-50">{title}</p>
      <p className="mt-2 text-sm leading-6 text-rose-100/85">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.1] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.16]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}

function CompactListItem({ children }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
      {children}
    </div>
  );
}

function EmptyPanel({ title, description }) {
  return (
    <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function FooterLink({ to, label }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
    >
      {label}
    </Link>
  );
}

export function SuperadminRuntimePage() {
  const { widgets, loadWidget, refreshAll, isRefreshing } = useSuperadminRuntimeStatus();
  const settingsState = widgets.settings;
  const overviewState = widgets.overview;
  const compactState = widgets.compactLists;

  const runtime = settingsState.data?.runtime || {};
  const queue = settingsState.data?.queue || {};
  const app = settingsState.data?.app || {};
  const overview = overviewState.data || {};
  const compact = compactState.data || {};

  const healthCards = [
    {
      title: "Runtime status",
      value: humanizeRuntimeValue(runtime.status || "Unknown"),
      helper: `${humanizeRuntimeValue(app.environment || "Unknown")} environment for ${app.name || runtime.appName || "the platform"}.`,
      tone: getRuntimeStatusTone(runtime.status),
      badgeLabel: humanizeRuntimeValue(runtime.status || "Unknown"),
      icon: HeartPulse,
    },
    {
      title: "Database",
      value: humanizeRuntimeValue(runtime.server?.status === "running" ? runtime.database?.status : "degraded"),
      helper: `Ready state ${runtime.database?.readyState ?? "--"} with server status ${humanizeRuntimeValue(runtime.server?.status || "unknown")}.`,
      tone: getRuntimeStatusTone(runtime.database?.status),
      badgeLabel: humanizeRuntimeValue(runtime.database?.status || "Unknown"),
      icon: ServerCog,
    },
    {
      title: "Queue scheduler",
      value: humanizeRuntimeValue(queue.runtime?.status || runtime.jobs?.status || "unknown"),
      helper: queue.enabled ? "Background processing is enabled for runtime jobs." : "Queue processing is disabled by configuration.",
      tone: getRuntimeStatusTone(queue.runtime?.status || runtime.jobs?.status),
      badgeLabel: queue.enabled ? "Queue enabled" : "Queue disabled",
      icon: DatabaseZap,
    },
    {
      title: "Active chains",
      value: formatRuntimeCount(runtime.activeChains?.length),
      helper: `${formatRuntimeCount((runtime.chains || []).filter((item) => item.status !== "active").length)} chain entries are not fully active.`,
      tone: "cyan",
      badgeLabel: "Chain runtime",
      icon: Waypoints,
    },
    {
      title: "Pending withdrawals",
      value: formatRuntimeCount(overview.queues?.pendingWithdrawals),
      helper: `${formatRuntimeCount(overview.queues?.failedTransactions)} failed transactions currently need review.`,
      tone: getRuntimeStatusTone(
        Number(overview.queues?.pendingWithdrawals || 0) > 0 ? "warning" : "ok",
      ),
      badgeLabel: "Queue attention",
      icon: AlertTriangle,
    },
    {
      title: "Treasury wallets",
      value: formatRuntimeCount(overview.treasury?.totalWallets),
      helper: `${formatRuntimeCount(overview.treasury?.activeWallets)} treasury wallets are currently marked active.`,
      tone: "emerald",
      badgeLabel: "Treasury",
      icon: Vault,
    },
  ];

  const chainIssues = (runtime.chains || []).filter((item) => item.status !== "active");
  const alerts = Array.isArray(overview.alerts) ? overview.alerts : [];

  return (
    <SuperadminPage
      header={(
        <SuperadminPageHeader
          eyebrow="Runtime health and alerts"
          title="Runtime"
          description="Review service health, alerts, queues, and chains."
          actions={(
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh runtime
            </button>
          )}
        />
      )}
    >
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {healthCards.map((card) => (
          <SuperadminRuntimeHealthCard key={card.title} {...card} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <SuperadminSectionCard
          title="Alerts and operational attention"
          description="Current runtime alerts."
        >
          {overviewState.error ? (
            <PanelError
              title="Runtime alerts unavailable"
              message={overviewState.error}
              onRetry={() => loadWidget("overview")}
            />
          ) : alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <CompactListItem key={alert.code}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{alert.message}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                        {alert.code}
                      </p>
                    </div>
                    <SuperadminRuntimeBadge tone={getRuntimeStatusTone(alert.severity)}>
                      {humanizeRuntimeValue(alert.severity)}
                    </SuperadminRuntimeBadge>
                  </div>
                </CompactListItem>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No active runtime alerts"
              description="The current overview contract is not reporting critical runtime alerts right now."
            />
          )}
        </SuperadminSectionCard>

        <SuperadminSectionCard
          title="Chain health"
          description="Current chain status."
        >
          {settingsState.error ? (
            <PanelError
              title="Chain health unavailable"
              message={settingsState.error}
              onRetry={() => loadWidget("settings")}
            />
          ) : chainIssues.length > 0 ? (
            <div className="space-y-3">
              {chainIssues.map((item) => (
                <CompactListItem key={item.chain}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {String(item.label || item.chain).toUpperCase()}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        {item.reason || "No runtime reason provided"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <SuperadminRuntimeBadge tone={getRuntimeChainTone(item.chain)}>
                        {String(item.chain || "").toUpperCase()}
                      </SuperadminRuntimeBadge>
                      <SuperadminRuntimeBadge tone={getRuntimeStatusTone(item.status)}>
                        {humanizeRuntimeValue(item.status)}
                      </SuperadminRuntimeBadge>
                    </div>
                  </div>
                </CompactListItem>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No degraded chains"
              description="Every runtime chain entry currently reports an active state."
            />
          )}

          <div className="mt-4">
            <FooterLink to="/superadmin/chains" label="Open chains module" />
          </div>
        </SuperadminSectionCard>

        <SuperadminSectionCard
          title="Job status snapshot"
          description="Current job status."
        >
          {compactState.error ? (
            <PanelError
              title="Job snapshot unavailable"
              message={compactState.error}
              onRetry={() => loadWidget("compactLists")}
            />
          ) : (compact.jobs || []).length > 0 ? (
            <div className="space-y-3">
              {compact.jobs.map((item) => (
                <CompactListItem key={item.jobName}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.jobName}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        {item.running ? "Currently running" : item.scheduled ? "Scheduled and waiting" : "Not scheduled"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <SuperadminRuntimeBadge tone={getRuntimeStatusTone(item.status)}>
                        {humanizeRuntimeValue(item.status)}
                      </SuperadminRuntimeBadge>
                      <SuperadminRuntimeBadge tone={item.enabled ? "emerald" : "rose"}>
                        {item.enabled ? "Enabled" : "Disabled"}
                      </SuperadminRuntimeBadge>
                    </div>
                  </div>
                </CompactListItem>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No job entries returned"
              description="The current jobs contract did not return any schedulers in the compact snapshot."
            />
          )}

          <div className="mt-4">
            <FooterLink to="/superadmin/jobs" label="Open jobs module" />
          </div>
        </SuperadminSectionCard>

        <SuperadminSectionCard
          title="Treasury snapshot"
          description="Current treasury balances."
        >
          {compactState.error ? (
            <PanelError
              title="Treasury snapshot unavailable"
              message={compactState.error}
              onRetry={() => loadWidget("compactLists")}
            />
          ) : (compact.treasury || []).length > 0 ? (
            <div className="space-y-3">
              {compact.treasury.map((item) => (
                <CompactListItem key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {String(item.chain || "").toUpperCase()} {String(item.asset || "").toUpperCase()}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        {formatRuntimeBalance(item.balance, item.asset)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <SuperadminRuntimeBadge tone={getRuntimeStatusTone(item.status)}>
                        {humanizeRuntimeValue(item.status)}
                      </SuperadminRuntimeBadge>
                      <SuperadminRuntimeBadge tone={getRuntimeStatusTone(item.walletType)}>
                        {humanizeRuntimeValue(item.walletType)}
                      </SuperadminRuntimeBadge>
                    </div>
                  </div>
                </CompactListItem>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No treasury wallets returned"
              description="The current treasury contract did not return reserve entries for this compact snapshot."
            />
          )}

          <div className="mt-4">
            <FooterLink to="/superadmin/treasury" label="Open treasury module" />
          </div>
        </SuperadminSectionCard>
      </div>

      <div className="mt-6">
        <SuperadminSectionCard
          title="Platform health summary"
          description="Current platform status."
        >
          {settingsState.error ? (
            <PanelError
              title="Runtime summary unavailable"
              message={settingsState.error}
              onRetry={() => loadWidget("settings")}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Server status", value: humanizeRuntimeValue(runtime.server?.status) || "Unavailable" },
                { label: "Database status", value: humanizeRuntimeValue(runtime.database?.status) || "Unavailable" },
                { label: "Server uptime", value: formatRuntimeCount(runtime.server?.uptimeSeconds) + " sec" },
                { label: "Request logging", value: app.requestLoggingEnabled ? "Enabled" : "Disabled" },
                { label: "Active chains", value: formatRuntimeCount(runtime.activeChains?.length) },
                { label: "Queue status", value: humanizeRuntimeValue(queue.runtime?.status) || "Unavailable" },
              ].map((item) => (
                <CompactListItem key={item.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white">{item.value}</p>
                </CompactListItem>
              ))}
            </div>
          )}
        </SuperadminSectionCard>
      </div>
    </SuperadminPage>
  );
}
