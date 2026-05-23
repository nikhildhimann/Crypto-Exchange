import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminCopyValue, isLikelyCopyableDetail } from "../SuperadminCopyValue";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminDepositsBadge } from "./SuperadminDepositsBadge";
import {
  formatDepositAbsoluteTime,
  formatDepositAmount,
  formatDepositDisplayId,
  formatDepositRelativeTime,
  getDepositChainTone,
  getDepositStatusTone,
  humanizeDepositValue,
  truncateMiddle,
} from "./utils";

function formatMetadataValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}...` : serialized;
  } catch (_error) {
    return "Complex value";
  }
}

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
      <p className="text-base font-semibold text-rose-50">Deposit details unavailable</p>
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

export function SuperadminDepositDetailDrawer({
  depositId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const deposit = state.data;
  const metadataEntries = Object.entries(deposit?.metadata || {});
  const quickLinks = [
    {
      label: "Open linked user",
      to: deposit?.user?.id ? `/superadmin/users?selected=${deposit.user.id}` : "/superadmin/users",
    },
    {
      label: "Open linked account",
      to: deposit?.account?.id ? `/superadmin/accounts?selected=${deposit.account.id}` : "/superadmin/accounts",
    },
    {
      label: "Open linked wallet",
      to: deposit?.wallet?.id ? `/superadmin/wallets?selected=${deposit.wallet.id}` : "/superadmin/wallets",
    },
    {
      label: "Open transactions",
      to: deposit?.transactionId
        ? `/superadmin/transactions?selected=${deposit.transactionId}`
        : deposit?.txHash
        ? `/superadmin/transactions?search=${encodeURIComponent(deposit.txHash)}`
        : deposit?.walletId
          ? `/superadmin/transactions?walletId=${deposit.walletId}`
          : "/superadmin/transactions",
    },
  ];

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminDepositsBadge tone={getDepositStatusTone(deposit?.status)}>
                {humanizeDepositValue(deposit?.status || "loading")}
              </SuperadminDepositsBadge>
              <SuperadminDepositsBadge tone={getDepositChainTone(deposit?.chain)}>
                {String(deposit?.chain || "deposit").toUpperCase()}
              </SuperadminDepositsBadge>
              {deposit?.asset ? (
                <SuperadminDepositsBadge tone="slate">{deposit.asset}</SuperadminDepositsBadge>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Deposit inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {deposit ? formatDepositDisplayId(deposit) : truncateMiddle(depositId, 12, 6)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only operational visibility for deposit identity, linked entities, confirmations, and reconciliation context.
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
          {state.loading && !deposit ? <LoadingState /> : null}
          {state.error && !deposit ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {deposit ? (
            <div className="space-y-4">
              <DetailSection
                title="Deposit summary"
                description="Core deposit identity fields returned by the superadmin detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Deposit id", value: deposit.id || "Unavailable" },
                    { label: "Transaction id", value: deposit.transactionId || "Unavailable" },
                    { label: "Chain", value: String(deposit.chain || "").toUpperCase() || "Unavailable" },
                    { label: "Network", value: deposit.network || deposit.wallet?.network || "Unavailable" },
                    { label: "Asset", value: deposit.asset || "Unavailable" },
                    { label: "Amount", value: formatDepositAmount(deposit.amount, deposit.asset) },
                    { label: "Address", value: deposit.address || "Unavailable" },
                    { label: "Tx hash", value: deposit.txHash || "Unavailable" },
                    { label: "Vout", value: deposit.vout || "Unavailable" },
                    { label: "Created", value: formatDepositAbsoluteTime(deposit.createdAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Linked entities"
                description="Linked user, account, and wallet summaries currently returned with this deposit detail payload."
              >
                <KeyValueGrid
                  items={[
                    { label: "User", value: deposit.user?.publicAddress || "Unavailable" },
                    { label: "User id", value: deposit.user?.id || deposit.userId || "Unavailable" },
                    { label: "Account", value: deposit.account?.name || "Unavailable" },
                    { label: "Account id", value: deposit.account?.id || deposit.accountId || "Unavailable" },
                    { label: "Wallet", value: deposit.wallet?.label || deposit.wallet?.address || "Unavailable" },
                    { label: "Wallet id", value: deposit.wallet?.id || deposit.walletId || "Unavailable" },
                    { label: "Wallet network", value: deposit.wallet?.network || deposit.network || "Unavailable" },
                    { label: "Wallet chain", value: deposit.wallet?.chain ? String(deposit.wallet.chain).toUpperCase() : "Unavailable" },
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
                title="Amount and confirmations"
                description="Current deposit amount and confirmation state supported by the backend contract."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: "Amount", value: formatDepositAmount(deposit.amount, deposit.asset) },
                    { label: "Confirmations", value: String(deposit.confirmations) },
                    { label: "Status", value: humanizeDepositValue(deposit.status) || "Unavailable" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-3 text-lg font-semibold tracking-tight text-white">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <DetailSection
                title="Hash and on-chain info"
                description="Hash and deposit-address visibility currently returned by the backend."
              >
                <KeyValueGrid
                  items={[
                    { label: "Tx hash", value: deposit.txHash || "Unavailable" },
                    { label: "Deposit address", value: deposit.address || "Unavailable" },
                    { label: "Chain", value: String(deposit.chain || "").toUpperCase() || "Unavailable" },
                    { label: "Network", value: deposit.network || deposit.wallet?.network || "Unavailable" },
                  ]}
                />

                <div className="mt-4 rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                  <p className="text-sm font-medium text-white">Explorer link not available yet</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    The current deposit read contract does not expose an explorer URL directly, so this view stays limited to safe hash and address visibility.
                  </p>
                </div>
              </DetailSection>

              <DetailSection
                title="State and lifecycle"
                description="Operational state and timestamps currently available on this deposit."
              >
                <div className="flex flex-wrap gap-2">
                  <SuperadminDepositsBadge tone={getDepositStatusTone(deposit.status)}>
                    {humanizeDepositValue(deposit.status)}
                  </SuperadminDepositsBadge>
                  {deposit.chainStatus ? (
                    <SuperadminDepositsBadge tone="slate">
                      {humanizeDepositValue(deposit.chainStatus)}
                    </SuperadminDepositsBadge>
                  ) : null}
                  <SuperadminDepositsBadge tone="slate">
                    {deposit.confirmations} confirmations
                  </SuperadminDepositsBadge>
                </div>

                <div className="mt-4">
                  <KeyValueGrid
                    items={[
                      { label: "Created", value: formatDepositAbsoluteTime(deposit.createdAt) || "Unavailable" },
                      { label: "Updated", value: formatDepositAbsoluteTime(deposit.updatedAt) || "Unavailable" },
                      { label: "Confirmed", value: formatDepositAbsoluteTime(deposit.confirmedAt || deposit.chainTimestamp) || "Unavailable" },
                      { label: "Relative time", value: formatDepositRelativeTime(deposit.confirmedAt || deposit.createdAt) },
                    ]}
                  />
                </div>
              </DetailSection>

              <DetailSection
                title="Related transaction summary"
                description="Related transaction linkage and on-chain identifiers returned by the backend."
              >
                <KeyValueGrid
                  items={[
                    { label: "Transaction id", value: deposit.transactionId || "Unavailable" },
                    { label: "Tx hash", value: deposit.txHash || "Unavailable" },
                    { label: "Chain status", value: humanizeDepositValue(deposit.chainStatus) || "Unavailable" },
                    { label: "Network", value: deposit.network || deposit.wallet?.network || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Metadata and reconciliation summary"
                description="Safe reconciliation metadata returned by the backend."
              >
                {metadataEntries.length > 0 ? (
                  <KeyValueGrid
                    items={metadataEntries.map(([label, value]) => ({
                      label: humanizeDepositValue(label),
                      value: formatMetadataValue(value),
                    }))}
                  />
                ) : (
                  <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                    <p className="text-sm font-medium text-white">No additional reconciliation metadata returned</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      The backend returned no extra reconciliation metadata for this deposit.
                    </p>
                  </div>
                )}
              </DetailSection>
            </div>
          ) : null}
        </div>
      </div>
    </SuperadminDetailModal>
  );
}
