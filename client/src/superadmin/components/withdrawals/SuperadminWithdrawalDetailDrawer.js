import { Link } from "react-router";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { SuperadminCopyValue, isLikelyCopyableDetail } from "../SuperadminCopyValue";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminWithdrawalsBadge } from "./SuperadminWithdrawalsBadge";
import {
  formatWithdrawalAbsoluteTime,
  formatWithdrawalAmount,
  formatWithdrawalDisplayId,
  formatWithdrawalRelativeTime,
  getWithdrawalChainTone,
  getWithdrawalStatusTone,
  humanizeWithdrawalValue,
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
      <p className="text-base font-semibold text-rose-50">Withdrawal details unavailable</p>
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

export function SuperadminWithdrawalDetailDrawer({
  withdrawalId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const withdrawal = state.data;
  const metadataEntries = Object.entries(withdrawal?.metadata || {});
  const quickLinks = [
    {
      label: "Open linked user",
      to: withdrawal?.user?.id ? `/superadmin/users?selected=${withdrawal.user.id}` : "/superadmin/users",
    },
    {
      label: "Open linked account",
      to: withdrawal?.account?.id ? `/superadmin/accounts?selected=${withdrawal.account.id}` : "/superadmin/accounts",
    },
    {
      label: "Open linked wallet",
      to: withdrawal?.wallet?.id ? `/superadmin/wallets?selected=${withdrawal.wallet.id}` : "/superadmin/wallets",
    },
    {
      label: "Open transactions",
      to: withdrawal?.transactionId
        ? `/superadmin/transactions?selected=${withdrawal.transactionId}`
        : withdrawal?.txHash
          ? `/superadmin/transactions?search=${encodeURIComponent(withdrawal.txHash)}`
        : withdrawal?.walletId
          ? `/superadmin/transactions?walletId=${withdrawal.walletId}`
        : withdrawal?.reference
          ? `/superadmin/transactions?search=${encodeURIComponent(withdrawal.reference)}`
          : "/superadmin/transactions",
    },
  ];

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminWithdrawalsBadge tone={getWithdrawalStatusTone(withdrawal?.status)}>
                {humanizeWithdrawalValue(withdrawal?.status || "loading")}
              </SuperadminWithdrawalsBadge>
              <SuperadminWithdrawalsBadge tone={getWithdrawalChainTone(withdrawal?.chain)}>
                {String(withdrawal?.chain || "withdrawal").toUpperCase()}
              </SuperadminWithdrawalsBadge>
              {withdrawal?.asset ? (
                <SuperadminWithdrawalsBadge tone="slate">
                  {withdrawal.asset}
                </SuperadminWithdrawalsBadge>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Withdrawal inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {withdrawal ? formatWithdrawalDisplayId(withdrawal) : truncateMiddle(withdrawalId, 12, 6)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only operational visibility for withdrawal identity, linked entities, routing, and execution context.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-200 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/30"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 lg:px-6">
          {state.loading && !withdrawal ? <LoadingState /> : null}
          {state.error && !withdrawal ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {withdrawal ? (
            <div className="space-y-4">
              {state.loading ? (
                <div className="rounded-[20px] border border-cyan-300/15 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
                  Refreshing withdrawal details without blocking the current inspection view.
                </div>
              ) : null}

              <DetailSection
                title="Withdrawal summary"
                description="Core withdrawal identity fields returned by the superadmin detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Withdrawal id", value: withdrawal.id || "Unavailable" },
                    { label: "Transaction id", value: withdrawal.transactionId || "Unavailable" },
                    { label: "Reference", value: withdrawal.reference || "Unavailable" },
                    { label: "Tx hash", value: withdrawal.txHash || "Unavailable" },
                    { label: "Chain", value: String(withdrawal.chain || "").toUpperCase() || "Unavailable" },
                    { label: "Network", value: withdrawal.network || withdrawal.wallet?.network || "Unavailable" },
                    { label: "Asset", value: withdrawal.asset || "Unavailable" },
                    { label: "Amount", value: formatWithdrawalAmount(withdrawal.amount, withdrawal.asset) },
                    { label: "Status", value: humanizeWithdrawalValue(withdrawal.status) || "Unavailable" },
                    { label: "Destination", value: withdrawal.destinationAddress || "Unavailable" },
                    { label: "Created", value: formatWithdrawalAbsoluteTime(withdrawal.createdAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Linked entities"
                description="Linked user, account, and wallet summaries currently returned with this withdrawal detail payload."
              >
                <KeyValueGrid
                  items={[
                    { label: "User", value: withdrawal.user?.publicAddress || "Unavailable" },
                    { label: "User id", value: withdrawal.user?.id || withdrawal.userId || "Unavailable" },
                    { label: "Account", value: withdrawal.account?.name || "Unavailable" },
                    { label: "Account id", value: withdrawal.account?.id || withdrawal.accountId || "Unavailable" },
                    { label: "Wallet", value: withdrawal.wallet?.label || withdrawal.wallet?.address || "Unavailable" },
                    { label: "Wallet id", value: withdrawal.wallet?.id || withdrawal.walletId || "Unavailable" },
                    { label: "Wallet network", value: withdrawal.wallet?.network || withdrawal.network || "Unavailable" },
                    { label: "Wallet chain", value: withdrawal.wallet?.chain ? String(withdrawal.wallet.chain).toUpperCase() : "Unavailable" },
                  ]}
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {quickLinks.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="inline-flex items-center justify-between rounded-[18px] border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/30"
                    >
                      <span>{item.label}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </DetailSection>

              <DetailSection
                title="Amounts and routing"
                description="Current withdrawal amount and routing context supported by the backend contract."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: "Amount", value: formatWithdrawalAmount(withdrawal.amount, withdrawal.asset) },
                    { label: "Asset", value: withdrawal.asset || "Unavailable" },
                    { label: "Chain", value: String(withdrawal.chain || "").toUpperCase() || "Unavailable" },
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

                <div className="mt-4">
                  <KeyValueGrid
                    items={[
                      { label: "Destination address", value: withdrawal.destinationAddress || "Unavailable" },
                      { label: "Wallet source", value: withdrawal.wallet?.address || "Unavailable" },
                      { label: "Wallet label", value: withdrawal.wallet?.label || "Unavailable" },
                      { label: "Network", value: withdrawal.network || withdrawal.wallet?.network || "Unavailable" },
                    ]}
                  />
                </div>
              </DetailSection>

              <DetailSection
                title="State and lifecycle"
                description="Operational state and timestamps currently available on this withdrawal."
              >
                <div className="flex flex-wrap gap-2">
                  <SuperadminWithdrawalsBadge tone={getWithdrawalStatusTone(withdrawal.status)}>
                    {humanizeWithdrawalValue(withdrawal.status)}
                  </SuperadminWithdrawalsBadge>
                  {withdrawal.chainStatus ? (
                    <SuperadminWithdrawalsBadge tone="slate">
                      {humanizeWithdrawalValue(withdrawal.chainStatus)}
                    </SuperadminWithdrawalsBadge>
                  ) : null}
                  {withdrawal.systemStatus ? (
                    <SuperadminWithdrawalsBadge tone="slate">
                      {humanizeWithdrawalValue(withdrawal.systemStatus)}
                    </SuperadminWithdrawalsBadge>
                  ) : null}
                  {withdrawal.reference ? (
                    <SuperadminWithdrawalsBadge tone="slate">
                      Reference present
                    </SuperadminWithdrawalsBadge>
                  ) : null}
                </div>

                <div className="mt-4">
                  <KeyValueGrid
                    items={[
                      { label: "Created", value: formatWithdrawalAbsoluteTime(withdrawal.createdAt) || "Unavailable" },
                      { label: "Updated", value: formatWithdrawalAbsoluteTime(withdrawal.updatedAt) || "Unavailable" },
                      { label: "Confirmed", value: formatWithdrawalAbsoluteTime(withdrawal.confirmedAt) || "Unavailable" },
                      { label: "Failed", value: formatWithdrawalAbsoluteTime(withdrawal.failedAt) || "Unavailable" },
                      { label: "Relative time", value: formatWithdrawalRelativeTime(withdrawal.confirmedAt || withdrawal.createdAt) },
                    ]}
                  />
                </div>
              </DetailSection>

              <DetailSection
                title="Related transaction summary"
                description="Direct transaction linkage and on-chain identifiers returned by the backend."
              >
                <KeyValueGrid
                  items={[
                    { label: "Transaction id", value: withdrawal.transactionId || "Unavailable" },
                    { label: "Tx hash", value: withdrawal.txHash || "Unavailable" },
                    { label: "Reference", value: withdrawal.reference || "Unavailable" },
                    { label: "Chain status", value: humanizeWithdrawalValue(withdrawal.chainStatus) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Execution summary"
                description="Safe execution and reconciliation metadata returned by the backend."
              >
                {Object.keys(withdrawal.executionParams || {}).length > 0 ? (
                  <KeyValueGrid
                    items={Object.entries(withdrawal.executionParams).slice(0, 8).map(([label, value]) => ({
                      label: humanizeWithdrawalValue(label),
                      value: formatMetadataValue(value),
                    }))}
                  />
                ) : null}

                {metadataEntries.length > 0 ? (
                  <div className={Object.keys(withdrawal.executionParams || {}).length > 0 ? "mt-4" : ""}>
                    <KeyValueGrid
                      items={metadataEntries.map(([label, value]) => ({
                        label: humanizeWithdrawalValue(label),
                        value: formatMetadataValue(value),
                      }))}
                    />
                  </div>
                ) : null}

                {!Object.keys(withdrawal.executionParams || {}).length && !metadataEntries.length ? (
                  <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                    <p className="text-sm font-medium text-white">No execution parameters returned</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      The backend returned no extra execution or reconciliation metadata for this withdrawal.
                    </p>
                  </div>
                ) : null}
              </DetailSection>
            </div>
          ) : null}
        </div>
      </div>
    </SuperadminDetailModal>
  );
}
