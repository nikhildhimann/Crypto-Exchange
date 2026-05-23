import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminCopyValue, isLikelyCopyableDetail } from "../SuperadminCopyValue";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminUsersBadge } from "./SuperadminUsersBadge";
import {
  formatMetadataValue,
  formatUserAbsoluteTime,
  formatUserCount,
  formatUserDisplayId,
  formatUserRelativeTime,
  getUserRoleTone,
  getUserStatusTone,
  humanizeUserValue,
  truncateMiddle,
} from "./utils";

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
        <div
          key={index}
          className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4 sm:p-5"
        >
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
      <p className="text-base font-semibold text-rose-50">User details unavailable</p>
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

export function SuperadminUserDetailDrawer({
  userId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const user = state.data;
  const metadataItems = Object.entries(user?.metadata || {}).slice(0, 8);
  const quickLinks = [
    { label: "Open accounts", to: `/superadmin/accounts?userId=${userId}` },
    { label: "Open wallets", to: `/superadmin/wallets?userId=${userId}` },
    { label: "Open sessions", to: `/superadmin/sessions?userId=${userId}` },
    { label: "Open audit logs", to: `/superadmin/audit?userId=${userId}` },
  ];

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminUsersBadge tone={getUserStatusTone(user?.status)}>
                {humanizeUserValue(user?.status || "loading")}
              </SuperadminUsersBadge>
              <SuperadminUsersBadge tone={getUserRoleTone(user?.role)}>
                {humanizeUserValue(user?.role || "user")}
              </SuperadminUsersBadge>
              <SuperadminUsersBadge tone={user?.mfaEnabled ? "emerald" : "slate"}>
                {user?.mfaEnabled ? "MFA enabled" : "MFA disabled"}
              </SuperadminUsersBadge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                User inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {user ? formatUserDisplayId(user) : truncateMiddle(userId, 12, 6)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only operational visibility for identity, security posture, and recent activity.
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
          {state.loading && !user ? <LoadingState /> : null}
          {state.error && !user ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {user ? (
            <div className="space-y-4">
              <DetailSection
                title="Profile and identity"
                description="Core identity fields exposed by the superadmin user detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "User id", value: user.id || "Unavailable" },
                    { label: "Public address", value: truncateMiddle(user.publicAddress, 14, 8) },
                    { label: "Public key", value: truncateMiddle(user.publicKey, 14, 8) },
                    { label: "Primary chain", value: user.primaryChain ? String(user.primaryChain).toUpperCase() : "Unavailable" },
                    { label: "Created", value: formatUserAbsoluteTime(user.createdAt) || "Unavailable" },
                    { label: "Updated", value: formatUserAbsoluteTime(user.updatedAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Security and access"
                description="Authentication posture and recent access timing."
              >
                <KeyValueGrid
                  items={[
                    { label: "Status", value: humanizeUserValue(user.status) || "Unavailable" },
                    { label: "Role", value: humanizeUserValue(user.role) || "Unavailable" },
                    { label: "MFA", value: user.mfaEnabled ? "Enabled" : "Disabled" },
                    { label: "Last access", value: formatUserAbsoluteTime(user.lastAccessAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Activity summary"
                description="Linked resource counts currently supported by the user detail contract."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: "Accounts", value: user.metrics.accountsCount },
                    { label: "Wallets", value: user.metrics.walletsCount },
                    { label: "Transactions", value: user.metrics.transactionsCount },
                    { label: "Deposits", value: user.metrics.depositsCount },
                    { label: "Withdrawals", value: user.metrics.withdrawalsCount },
                    { label: "Sessions", value: user.metrics.sessionsCount },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                        {formatUserCount(item.value)}
                      </p>
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

              {metadataItems.length > 0 ? (
                <DetailSection
                  title="Metadata summary"
                  description="Only safe metadata values returned by the read endpoint are surfaced here."
                >
                  <KeyValueGrid
                    items={metadataItems.map(([label, value]) => ({
                      label: humanizeUserValue(label),
                      value: formatMetadataValue(value),
                    }))}
                  />
                </DetailSection>
              ) : null}

              <DetailSection
                title="Recent sessions"
                description="Latest session activity attached to this user."
              >
                <div className="space-y-3">
                  {user.recentSessions.length > 0 ? (
                    user.recentSessions.map((session) => (
                      <div
                        key={session.id || session.sessionId}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {session.deviceLabel || session.platform || "Unknown device"}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {session.platform || "Platform unavailable"} • {session.appVersion || "Version unavailable"}
                            </p>
                          </div>
                          <SuperadminUsersBadge tone={getUserStatusTone(session.status)}>
                            {humanizeUserValue(session.status)}
                          </SuperadminUsersBadge>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                          <span title={formatUserAbsoluteTime(session.lastUsedAt)}>
                            Last used {formatUserRelativeTime(session.lastUsedAt)}
                          </span>
                          <span>{session.ipAddress || "IP unavailable"}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                      <p className="text-sm font-medium text-white">No recent sessions</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        The current detail contract did not return recent session entries for this user.
                      </p>
                    </div>
                  )}
                </div>
              </DetailSection>

              <DetailSection
                title="Recent audit events"
                description="Recent security and lifecycle events returned by the user detail read endpoint."
              >
                <div className="space-y-3">
                  {user.recentAuditEvents.length > 0 ? (
                    user.recentAuditEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {humanizeUserValue(event.action)} on {humanizeUserValue(event.resource)}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {event.ipAddress || "IP unavailable"}
                            </p>
                          </div>
                          <SuperadminUsersBadge tone={getUserStatusTone(event.status)}>
                            {humanizeUserValue(event.status)}
                          </SuperadminUsersBadge>
                        </div>
                        <p
                          className="mt-3 text-xs text-slate-500"
                          title={formatUserAbsoluteTime(event.createdAt)}
                        >
                          {formatUserRelativeTime(event.createdAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                      <p className="text-sm font-medium text-white">No recent audit events</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Audit visibility is limited to the recent event slice already returned by the backend detail endpoint.
                      </p>
                    </div>
                  )}
                </div>
              </DetailSection>
            </div>
          ) : null}
        </div>
      </div>
    </SuperadminDetailModal>
  );
}
