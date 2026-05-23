import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminCopyValue, isLikelyCopyableDetail } from "../SuperadminCopyValue";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
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
      <p className="text-base font-semibold text-rose-50">Session details unavailable</p>
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

export function SuperadminSessionDetailDrawer({
  sessionId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const session = state.data;
  const quickLinks = [];

  if (session?.scope === "user" && session?.actor?.id) {
    quickLinks.push({
      label: "Open linked user",
      to: `/superadmin/users?selected=${session.actor.id}`,
    });
    quickLinks.push({
      label: "Open audit logs",
      to: `/superadmin/audit?userId=${session.actor.id}`,
    });
  } else {
    quickLinks.push({
      label: "Open audit logs",
      to: "/superadmin/audit",
    });
  }

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminSessionsBadge tone={getSessionStatusTone(session?.status)}>
                {humanizeSessionValue(session?.status || "loading")}
              </SuperadminSessionsBadge>
              <SuperadminSessionsBadge tone={getSessionScopeTone(session?.scope)}>
                {humanizeSessionValue(session?.scope || "session")}
              </SuperadminSessionsBadge>
              <SuperadminSessionsBadge tone={getSessionPlatformTone(session?.platform)}>
                {humanizeSessionValue(session?.platform || "unknown")}
              </SuperadminSessionsBadge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Session inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {session ? formatSessionDisplayId(session) : truncateMiddle(sessionId, 12, 6)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only operational visibility for actor identity, device posture, lifecycle state, and access metadata.
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
          {state.loading && !session ? <LoadingState /> : null}
          {state.error && !session ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {session ? (
            <div className="space-y-4">
              <DetailSection
                title="Session summary"
                description="Core session identity fields returned by the superadmin detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Session id", value: session.sessionId || "Unavailable" },
                    { label: "Scope", value: humanizeSessionValue(session.scope) || "Unavailable" },
                    { label: "Status", value: humanizeSessionValue(session.status) || "Unavailable" },
                    { label: "Platform", value: humanizeSessionValue(session.platform) || "Unavailable" },
                    { label: "App version", value: session.appVersion || "Unavailable" },
                    { label: "Created", value: formatSessionAbsoluteTime(session.createdAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Linked identity"
                description="Actor summary currently returned with this session detail payload."
              >
                <KeyValueGrid
                  items={[
                    { label: "Actor", value: getSessionActorLabel(session.actor, session.scope) },
                    { label: "Actor id", value: session.actorId || session.actor?.id || "Unavailable" },
                    { label: "Role", value: humanizeSessionValue(session.actor?.role) || "Unavailable" },
                    { label: "Actor status", value: humanizeSessionValue(session.actor?.status) || "Unavailable" },
                    {
                      label: "Primary chain",
                      value: session.scope === "user"
                        ? (session.actor?.primaryChain ? String(session.actor.primaryChain).toUpperCase() : "Unavailable")
                        : "Not applicable",
                    },
                    {
                      label: "Last actor access",
                      value:
                        formatSessionAbsoluteTime(
                          session.actor?.lastAccessAt || session.actor?.lastLoginAt,
                        ) || "Unavailable",
                    },
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
                title="Device information"
                description="Device and client environment signals currently surfaced by the backend."
              >
                <KeyValueGrid
                  items={[
                    { label: "Device label", value: session.deviceLabel || "Unavailable" },
                    { label: "Device id", value: session.deviceId || "Unavailable" },
                    { label: "Platform", value: session.platform || "Unavailable" },
                    { label: "App version", value: session.appVersion || "Unavailable" },
                    { label: "Biometric capable", value: session.biometricCapable ? "Yes" : "No" },
                    { label: "User agent", value: session.userAgent || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Access and security summary"
                description="Current network and revocation visibility supported by the session detail contract."
              >
                <KeyValueGrid
                  items={[
                    { label: "IP address", value: session.ipAddress || "Unavailable" },
                    { label: "Status", value: humanizeSessionValue(session.status) || "Unavailable" },
                    { label: "Revoked at", value: formatSessionAbsoluteTime(session.revokedAt) || "Not revoked" },
                    { label: "Revoked reason", value: session.revokedReason || "Not provided" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Lifecycle and timestamps"
                description="Session lifecycle timestamps currently available on this record."
              >
                <KeyValueGrid
                  items={[
                    { label: "Created", value: formatSessionAbsoluteTime(session.createdAt) || "Unavailable" },
                    { label: "Last used", value: formatSessionAbsoluteTime(session.lastUsedAt) || "Unavailable" },
                    { label: "Expires", value: formatSessionAbsoluteTime(session.expiresAt) || "Unavailable" },
                    { label: "Updated", value: formatSessionAbsoluteTime(session.updatedAt) || "Unavailable" },
                    { label: "Relative last use", value: formatSessionRelativeTime(session.lastUsedAt) },
                    { label: "Relative expiry", value: formatSessionRelativeTime(session.expiresAt) },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Metadata and environment summary"
                description="The current session detail contract intentionally keeps this surface minimal."
              >
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                  <p className="text-sm font-medium text-white">No additional metadata returned</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Sensitive session tokens, refresh hashes, and internal auth secrets remain excluded. The current read contract exposes only safe operational fields.
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
