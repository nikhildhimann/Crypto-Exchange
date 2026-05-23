import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminAuditBadge } from "./SuperadminAuditBadge";
import {
  extractAuditMetadataHighlights,
  formatAuditAbsoluteTime,
  formatAuditDisplayId,
  formatAuditRelativeTime,
  formatMetadataValue,
  getAuditActionTone,
  getAuditStatusTone,
  humanizeAuditValue,
  sanitizeAuditMetadata,
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
      <p className="text-base font-semibold text-rose-50">Audit event unavailable</p>
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

export function SuperadminAuditDetailDrawer({
  auditId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const audit = state.data;
  const sanitizedMetadata = sanitizeAuditMetadata(audit?.metadata || {});
  const metadataItems = Object.entries(sanitizedMetadata).slice(0, 8);
  const metadataHighlights = extractAuditMetadataHighlights(sanitizedMetadata);
  const quickLinks = [];

  if (audit?.user?.id) {
    quickLinks.push({
      label: "Open linked user",
      to: `/superadmin/users?selected=${audit.user.id}`,
    });
    quickLinks.push({
      label: "Open sessions",
      to: `/superadmin/sessions?userId=${audit.user.id}`,
    });
  }

  if (audit?.resource) {
    const resource = String(audit.resource).toLowerCase();
    const resourceRouteMap = {
      user: "/superadmin/users",
      users: "/superadmin/users",
      account: "/superadmin/accounts",
      accounts: "/superadmin/accounts",
      wallet: "/superadmin/wallets",
      wallets: "/superadmin/wallets",
      transaction: "/superadmin/transactions",
      transactions: "/superadmin/transactions",
      deposit: "/superadmin/deposits",
      deposits: "/superadmin/deposits",
      withdrawal: "/superadmin/withdrawals",
      withdrawals: "/superadmin/withdrawals",
      session: "/superadmin/sessions",
      sessions: "/superadmin/sessions",
    };

    if (resourceRouteMap[resource]) {
      quickLinks.push({
        label: `Open ${humanizeAuditValue(resource)}`,
        to: resourceRouteMap[resource],
      });
    }
  }

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminAuditBadge tone={getAuditStatusTone(audit?.status)}>
                {humanizeAuditValue(audit?.status || "loading")}
              </SuperadminAuditBadge>
              <SuperadminAuditBadge tone={getAuditActionTone(audit?.action)}>
                {humanizeAuditValue(audit?.action || "audit")}
              </SuperadminAuditBadge>
              {audit?.resource ? (
                <SuperadminAuditBadge tone="slate">
                  {humanizeAuditValue(audit.resource)}
                </SuperadminAuditBadge>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Audit inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {audit ? formatAuditDisplayId(audit) : truncateMiddle(auditId, 12, 6)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only operational visibility for actor context, resource actions, request posture, and sanitized audit metadata.
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
          {state.loading && !audit ? <LoadingState /> : null}
          {state.error && !audit ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {audit ? (
            <div className="space-y-4">
              <DetailSection
                title="Audit summary"
                description="Core audit event fields returned by the superadmin detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Event id", value: audit.id || "Unavailable" },
                    { label: "Action", value: humanizeAuditValue(audit.action) || "Unavailable" },
                    { label: "Resource", value: humanizeAuditValue(audit.resource) || "Unavailable" },
                    { label: "Status", value: humanizeAuditValue(audit.status) || "Unavailable" },
                    { label: "Created", value: formatAuditAbsoluteTime(audit.createdAt) || "Unavailable" },
                    { label: "Updated", value: formatAuditAbsoluteTime(audit.updatedAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Actor and initiator"
                description="Linked user summary currently returned with this audit event payload."
              >
                <KeyValueGrid
                  items={[
                    {
                      label: "Linked user",
                      value: audit.user
                        ? (audit.user.publicAddress || audit.user.id || "Unavailable")
                        : "No linked user",
                    },
                    { label: "User id", value: audit.user?.id || audit.userId || "Unavailable" },
                    { label: "Role", value: humanizeAuditValue(audit.user?.role) || "Unavailable" },
                    { label: "User status", value: humanizeAuditValue(audit.user?.status) || "Unavailable" },
                  ]}
                />

                {quickLinks.length > 0 ? (
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
                ) : null}
              </DetailSection>

              <DetailSection
                title="Target entity"
                description="Resource-level context currently exposed directly or via sanitized metadata highlights."
              >
                <KeyValueGrid
                  items={[
                    { label: "Resource", value: humanizeAuditValue(audit.resource) || "Unavailable" },
                    {
                      label: "Target identifier",
                      value:
                        metadataHighlights.find((item) => /entity|target|resource/i.test(item.label))?.value ||
                        "Not exposed by current contract",
                    },
                    {
                      label: "Request id",
                      value:
                        metadataHighlights.find((item) => /request/i.test(item.label))?.value ||
                        "Not exposed by current contract",
                    },
                    {
                      label: "Session id",
                      value:
                        metadataHighlights.find((item) => /session/i.test(item.label))?.value ||
                        "Not exposed by current contract",
                    },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Request and network context"
                description="Current request posture supported by the audit event contract."
              >
                <KeyValueGrid
                  items={[
                    { label: "IP address", value: audit.ipAddress || "Unavailable" },
                    {
                      label: "User agent",
                      value:
                        metadataHighlights.find((item) => /user.?agent/i.test(item.label))?.value ||
                        "Not exposed by current contract",
                    },
                    {
                      label: "Method",
                      value:
                        metadataHighlights.find((item) => /method/i.test(item.label))?.value ||
                        "Not exposed by current contract",
                    },
                    {
                      label: "Path",
                      value:
                        metadataHighlights.find((item) => /path|route/i.test(item.label))?.value ||
                        "Not exposed by current contract",
                    },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Status and severity"
                description="Operational outcome is available directly; severity remains limited to what the current backend exposes."
              >
                <KeyValueGrid
                  items={[
                    { label: "Outcome", value: humanizeAuditValue(audit.status) || "Unavailable" },
                    { label: "Severity", value: "Not exposed by current contract" },
                    { label: "Relative created time", value: formatAuditRelativeTime(audit.createdAt) },
                    { label: "Relative updated time", value: formatAuditRelativeTime(audit.updatedAt) },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Metadata summary"
                description="Metadata is sanitized on the frontend before display to avoid exposing sensitive fields."
              >
                {metadataItems.length > 0 ? (
                  <>
                    <KeyValueGrid
                      items={metadataItems.map(([label, value]) => ({
                        label: humanizeAuditValue(label),
                        value: formatMetadataValue(value),
                      }))}
                    />
                    <div className="mt-4 rounded-[18px] border border-white/8 bg-slate-950/60 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Sanitized metadata
                      </p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-300">
                        {JSON.stringify(sanitizedMetadata, null, 2)}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                    <p className="text-sm font-medium text-white">No metadata returned</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      This audit event does not currently expose additional metadata beyond the core audit fields.
                    </p>
                  </div>
                )}
              </DetailSection>

              <DetailSection
                title="Related records summary"
                description="Relationship graph is intentionally light."
              >
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                  <p className="text-sm font-medium text-white">Relationship graph is intentionally light</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    The current audit contract does not expose a safe before/after diff, explicit related resource id, or incident-annotation model yet. This view stays focused on investigative read-only context.
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
