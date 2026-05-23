import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminCopyValue, isLikelyCopyableDetail } from "../SuperadminCopyValue";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminAccountsBadge } from "./SuperadminAccountsBadge";
import {
  formatAccountAbsoluteTime,
  formatAccountCount,
  formatAccountDisplayId,
  formatAccountRelativeTime,
  getAccountStatusTone,
  getAccountTypeTone,
  humanizeAccountValue,
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
      <p className="text-base font-semibold text-rose-50">Account details unavailable</p>
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

export function SuperadminAccountDetailDrawer({
  accountId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const account = state.data;
  const quickLinks = [
    { label: "Open linked user", to: account?.user?.id ? `/superadmin/users?selected=${account.user.id}` : "/superadmin/users" },
    { label: "Open wallets", to: `/superadmin/wallets?accountId=${accountId}` },
    { label: "Open transactions", to: `/superadmin/transactions?accountId=${accountId}` },
  ];

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminAccountsBadge tone={getAccountStatusTone(account?.status)}>
                {humanizeAccountValue(account?.status || "loading")}
              </SuperadminAccountsBadge>
              <SuperadminAccountsBadge tone={getAccountTypeTone(account?.type)}>
                {humanizeAccountValue(account?.type || "untyped")}
              </SuperadminAccountsBadge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Account inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {account?.name || (account ? formatAccountDisplayId(account) : truncateMiddle(accountId, 12, 6))}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only operational visibility for linked user context, wallet footprint, and account activity.
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
          {state.loading && !account ? <LoadingState /> : null}
          {state.error && !account ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {account ? (
            <div className="space-y-4">
              <DetailSection
                title="Account summary"
                description="Core account identity fields returned by the superadmin detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Account id", value: account.id || "Unavailable" },
                    { label: "Name", value: account.name || "Unnamed account" },
                    { label: "Type", value: humanizeAccountValue(account.type) || "Unavailable" },
                    { label: "Status", value: humanizeAccountValue(account.status) || "Unavailable" },
                    { label: "Created", value: formatAccountAbsoluteTime(account.createdAt) || "Unavailable" },
                    { label: "Updated", value: formatAccountAbsoluteTime(account.updatedAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Linked user"
                description="User summary currently returned with this account detail payload."
              >
                <KeyValueGrid
                  items={[
                    { label: "User id", value: account.user?.id || account.userId || "Unavailable" },
                    { label: "Public address", value: truncateMiddle(account.user?.publicAddress, 14, 8) },
                    { label: "Role", value: humanizeAccountValue(account.user?.role) || "Unavailable" },
                    { label: "Status", value: humanizeAccountValue(account.user?.status) || "Unavailable" },
                    { label: "Primary chain", value: account.user?.primaryChain ? String(account.user.primaryChain).toUpperCase() : "Unavailable" },
                    { label: "Last access", value: formatAccountAbsoluteTime(account.user?.lastAccessAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Activity summary"
                description="Counts surfaced by the current account detail contract."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Wallets", value: account.metrics.walletsCount },
                    { label: "Transactions", value: account.metrics.transactionsCount },
                    { label: "Deposits", value: account.metrics.depositsCount },
                    { label: "Withdrawals", value: account.metrics.withdrawalsCount },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                        {formatAccountCount(item.value)}
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

              <DetailSection
                title="Wallet preview"
                description="The detail contract currently includes the latest wallet slice for this account."
              >
                <div className="space-y-3">
                  {account.wallets.length > 0 ? (
                    account.wallets.map((wallet) => (
                      <div
                        key={wallet.id}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {wallet.label || truncateMiddle(wallet.address, 12, 6)}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {String(wallet.chain || "").toUpperCase()} • {wallet.network || "Network unavailable"} • {wallet.asset || "Asset unavailable"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {wallet.isPrimary ? (
                              <SuperadminAccountsBadge tone="emerald">Primary</SuperadminAccountsBadge>
                            ) : null}
                            {wallet.archived ? (
                              <SuperadminAccountsBadge tone="rose">Archived</SuperadminAccountsBadge>
                            ) : null}
                            {wallet.hidden ? (
                              <SuperadminAccountsBadge tone="amber">Hidden</SuperadminAccountsBadge>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                          <span>{truncateMiddle(wallet.address, 12, 8)}</span>
                          <span>{humanizeAccountValue(wallet.sourceType) || "Source unavailable"}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                      <p className="text-sm font-medium text-white">No wallets returned</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Wallet inventory for this account is currently limited to the preview slice returned by the backend detail contract.
                      </p>
                    </div>
                  )}
                </div>
              </DetailSection>

              <DetailSection
                title="Provisioning notes"
                description="Sensitive account seed material and fingerprint data are intentionally withheld from the superadmin UI."
              >
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                  This account detail view is intentionally read-only and excludes encrypted mnemonic material, mnemonic fingerprints, and other secret provisioning internals. Use linked wallet and activity summaries for operational investigation.
                </div>
              </DetailSection>
            </div>
          ) : null}
        </div>
      </div>
    </SuperadminDetailModal>
  );
}
