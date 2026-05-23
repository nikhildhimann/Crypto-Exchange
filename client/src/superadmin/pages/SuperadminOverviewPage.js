import { useMemo } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  ActivitySquare,
  AlertTriangle,
  ArrowRight,
  DatabaseZap,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
  Users,
  Vault,
  Wallet,
  Waypoints,
} from "lucide-react";
import { Link } from "react-router";
import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminOverviewStatCard } from "../components/overview/SuperadminOverviewStatCard";
import { SuperadminOverviewStatusBadge } from "../components/overview/SuperadminOverviewStatusBadge";
import { getSuperadminRoute } from "../config/routes";
import { useSuperadminOverview } from "../hooks/useSuperadminOverview";
import { humanizeValue, truncateMiddle } from "../utils/common";

const WITHDRAWAL_ATTENTION_STATUSES = new Set([
  "created",
  "pending",
  "queued",
  "processing",
  "failed",
  "rejected",
]);

const numberFormatter = new Intl.NumberFormat("en-US");
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatMetric(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "--";
  }

  if (Math.abs(numericValue) >= 1000) {
    return compactNumberFormatter.format(numericValue);
  }

  return numberFormatter.format(numericValue);
}

function formatCountLabel(value, noun) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return `No ${noun}`;
  }

  return `${numberFormatter.format(numericValue)} ${noun}`;
}

function formatRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unavailable";
  }

  return formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

function formatExactTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }

  return format(timestamp, "PPpp");
}

function buildRouteWithQuery(path, query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function getStatusTone(status) {
  const normalized = String(status || "").trim().toLowerCase();

  if (!normalized) {
    return "slate";
  }

  if (["active", "healthy", "ok", "success", "completed", "enabled", "scheduled"].includes(normalized)) {
    return "emerald";
  }

  if (["running", "idle", "info"].includes(normalized)) {
    return "cyan";
  }

  if (["pending", "queued", "processing", "warning", "degraded", "created"].includes(normalized)) {
    return "amber";
  }

  if (["failed", "error", "disabled", "locked", "inactive", "revoked", "denied"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}

function getWithdrawalTone(status) {
  return WITHDRAWAL_ATTENTION_STATUSES.has(String(status || "").trim().toLowerCase())
    ? getStatusTone(status)
    : "emerald";
}

function OverviewFooterLink({ to, label }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export function SuperadminOverviewPage() {
  const { summary, widgets, refreshAll, loadSummary, loadWidget, isRefreshing } = useSuperadminOverview();

  const overview = summary.data;
  const usersRoute = getSuperadminRoute("users")?.fullPath || "/superadmin/users";
  const accountsRoute = getSuperadminRoute("accounts")?.fullPath || "/superadmin/accounts";
  const sessionsRoute = getSuperadminRoute("sessions")?.fullPath || "/superadmin/sessions";
  const treasuryRoute = getSuperadminRoute("treasury")?.fullPath || "/superadmin/treasury";
  const transactionsRoute = getSuperadminRoute("transactions")?.fullPath || "/superadmin/transactions";
  const walletsRoute = getSuperadminRoute("wallets")?.fullPath || "/superadmin/wallets";

  const stats = useMemo(() => {
    const counts = overview?.counts || {};
    const queues = overview?.queues || {};
    const sessions = overview?.sessions || {};
    const treasury = overview?.treasury || {};

    return [
      {
        id: "users",
        label: "Total users",
        value: formatMetric(counts.totalUsers),
        helper: `${formatCountLabel(counts.activeUsers, "active users")} are currently active across the wallet platform population.`,
        icon: Users,
        tone: "cyan",
        to: usersRoute,
      },
      {
        id: "accounts",
        label: "Accounts",
        value: formatMetric(counts.totalAccounts),
        helper: `${formatCountLabel(counts.totalWallets, "wallets")} currently provisioned across all users.`,
        icon: UserRoundCog,
        tone: "emerald",
        to: accountsRoute,
      },

      {
        id: "transactions",
        label: "Failed transactions",
        value: formatMetric(queues.failedTransactions),
        helper: `${formatCountLabel(queues.pendingTransactions, "pending transactions")} are still moving through settlement or execution.`,
        icon: ActivitySquare,
        tone: "rose",
        to: buildRouteWithQuery(transactionsRoute, { status: "failed" }),
      },
      {
        id: "sessions",
        label: "Active sessions",
        value: formatMetric(sessions.totalActiveSessions),
        helper: `${formatCountLabel(sessions.activeSuperadminSessions, "superadmin sessions")} are currently live.`,
        icon: ShieldCheck,
        tone: "emerald",
        to: buildRouteWithQuery(sessionsRoute, { status: "active", scope: "all" }),
      },
      {
        id: "treasury",
        label: "Treasury wallets",
        value: formatMetric(treasury.totalWallets),
        helper: `${formatCountLabel(treasury.activeWallets, "active reserve wallets")} are available right now.`,
        icon: Vault,
        tone: "cyan",
        to: treasuryRoute,
      },
      {
        id: "wallets",
        label: "Wallet inventory",
        value: formatMetric(counts.totalWallets),
        helper: `${formatCountLabel(counts.totalTransactions, "transactions")} tracked across the platform ledger.`,
        icon: Wallet,
        tone: "slate",
        to: walletsRoute,
      },
    ];
  }, [
    accountsRoute,
    overview,
    sessionsRoute,
    transactionsRoute,
    treasuryRoute,
    usersRoute,
    walletsRoute,
  ]);

  const runtimeHealthTone = getStatusTone(overview?.runtime?.healthStatus);
  const alerts = Array.isArray(overview?.alerts) ? overview.alerts : [];
  const lastUpdatedLabel = summary.lastUpdatedAt ? formatRelativeTime(summary.lastUpdatedAt) : "";

  return (
    <SuperadminPage
      header={(
        <SuperadminPageHeader
          eyebrow="Operations command"
          title="Superadmin Overview"
          description="Platform activity, runtime health, and current alerts."
          actions={(
            <>
              <SuperadminOverviewStatusBadge tone={runtimeHealthTone}>
                Runtime {humanizeValue(overview?.runtime?.healthStatus || "loading")}
              </SuperadminOverviewStatusBadge>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300">
                <AlertTriangle className="h-4 w-4 text-amber-200" />
                {summary.loading && !overview
                  ? "Loading alerts"
                  : `${formatMetric(alerts.length)} active alerts`}
              </div>
              <button
                type="button"
                onClick={refreshAll}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Refreshing" : "Refresh"}
              </button>
            </>
          )}
        />
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300">
          <ShieldCheck className="h-4 w-4 text-cyan-200" />
          {summary.loading && !overview
            ? "Loading session pulse"
            : `${formatCountLabel(overview?.sessions?.totalActiveSessions, "active sessions")}`}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300">
          <DatabaseZap className="h-4 w-4 text-cyan-200" />
          {summary.loading && !overview
            ? "Loading jobs"
            : `${formatCountLabel(overview?.runtime?.jobs?.active, "active jobs")} in the scheduler`}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300">
          <Waypoints className="h-4 w-4 text-cyan-200" />
          {summary.loading && !overview
            ? "Loading chain health"
            : `${formatCountLabel(overview?.runtime?.activeChains, "active chains")} across runtime config`}
        </div>
        {lastUpdatedLabel ? (
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300"
            title={formatExactTime(summary.lastUpdatedAt)}
          >
            Last updated {lastUpdatedLabel}
          </div>
        ) : null}
      </div>

      {summary.error && !overview ? (
        <SuperadminSectionCard
          title="Overview metrics unavailable"
          description="The overview summary did not load, but the rest of the superadmin page can still recover panel by panel."
          className="border-rose-300/15 bg-rose-400/[0.06]"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm leading-6 text-rose-100/90">
              {summary.error}
            </p>
            <button
              type="button"
              onClick={() => void loadSummary()}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-white/[0.1]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry summary
            </button>
          </div>
        </SuperadminSectionCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <SuperadminOverviewStatCard
            key={stat.id}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            helper={stat.helper}
            tone={stat.tone}
            loading={summary.loading && !overview}
            to={stat.to}
          />
        ))}
      </div>


    </SuperadminPage>
  );
}
