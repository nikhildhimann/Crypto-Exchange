import { Link } from "react-router";
import { ArrowRight, ExternalLink, RefreshCw, X } from "lucide-react";
import { SuperadminCopyValue, isLikelyCopyableDetail } from "../SuperadminCopyValue";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminTransactionsBadge } from "./SuperadminTransactionsBadge";
import {
  formatMetadataValue,
  formatTransactionAbsoluteTime,
  formatTransactionAmount,
  formatTransactionCount,
  formatTransactionDisplayId,
  formatTransactionRelativeTime,
  getTransactionChainTone,
  getTransactionDirectionTone,
  getTransactionStatusTone,
  getTransactionTypeTone,
  humanizeTransactionValue,
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
      {Array.from({ length: 6 }).map((_, index) => (
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
      <p className="text-base font-semibold text-rose-50">Transaction details unavailable</p>
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

export function SuperadminTransactionDetailDrawer({
  transactionId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const transaction = state.data;
  const executionMetadataItems = Object.entries(transaction?.executionParamMetadata || {});
  const compositeDebitItems = Object.entries(transaction?.compositeDebit || {});
  const quickLinks = [
    {
      label: "Open linked user",
      to: transaction?.user?.id ? `/superadmin/users?selected=${transaction.user.id}` : "/superadmin/users",
    },
    {
      label: "Open linked account",
      to: transaction?.account?.id ? `/superadmin/accounts?selected=${transaction.account.id}` : "/superadmin/accounts",
    },
    {
      label: "Open linked wallet",
      to: transaction?.wallet?.id ? `/superadmin/wallets?selected=${transaction.wallet.id}` : "/superadmin/wallets",
    },
  ];

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminTransactionsBadge tone={getTransactionStatusTone(transaction?.status)}>
                {humanizeTransactionValue(transaction?.status || "loading")}
              </SuperadminTransactionsBadge>
              <SuperadminTransactionsBadge tone={getTransactionTypeTone(transaction?.transactionType)}>
                {humanizeTransactionValue(transaction?.transactionType || "external")}
              </SuperadminTransactionsBadge>
              <SuperadminTransactionsBadge tone={getTransactionDirectionTone(transaction?.normalizedDirection || transaction?.direction)}>
                {humanizeTransactionValue(transaction?.normalizedDirection || transaction?.direction || "direction")}
              </SuperadminTransactionsBadge>
              <SuperadminTransactionsBadge tone={getTransactionChainTone(transaction?.chain)}>
                {String(transaction?.chain || "tx").toUpperCase()}
              </SuperadminTransactionsBadge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Transaction inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {transaction ? formatTransactionDisplayId(transaction) : truncateMiddle(transactionId, 12, 6)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only operational visibility for linked entities, lifecycle timestamps, on-chain hashes, and fee structure.
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
          {state.loading && !transaction ? <LoadingState /> : null}
          {state.error && !transaction ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {transaction ? (
            <div className="space-y-4">
              <DetailSection
                title="Transaction summary"
                description="Core transaction identity fields returned by the superadmin detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Transaction id", value: transaction.id || "Unavailable" },
                    { label: "Type", value: humanizeTransactionValue(transaction.type || "transfer") },
                    { label: "Scope", value: humanizeTransactionValue(transaction.transactionType || "external") },
                    { label: "Direction", value: humanizeTransactionValue(transaction.normalizedDirection || transaction.direction) },
                    { label: "Chain", value: transaction.chainLabel || String(transaction.chain || "").toUpperCase() || "Unavailable" },
                    { label: "Network", value: transaction.networkLabel || transaction.network || "Unavailable" },
                    { label: "Asset", value: transaction.asset || transaction.currency || "Unavailable" },
                    { label: "Created", value: formatTransactionAbsoluteTime(transaction.createdAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Linked entities"
                description="Linked user, account, and wallet summaries currently returned with this transaction detail payload."
              >
                <KeyValueGrid
                  items={[
                    { label: "User", value: transaction.user?.publicAddress || "Unavailable" },
                    { label: "User id", value: transaction.user?.id || transaction.userId || "Unavailable" },
                    { label: "Account", value: transaction.account?.name || "Unavailable" },
                    { label: "Account id", value: transaction.account?.id || transaction.accountId || "Unavailable" },
                    { label: "Wallet", value: transaction.wallet?.label || transaction.wallet?.address || "Unavailable" },
                    { label: "Wallet id", value: transaction.wallet?.id || transaction.walletId || "Unavailable" },
                    { label: "Wallet chain", value: transaction.wallet?.chain ? String(transaction.wallet.chain).toUpperCase() : "Unavailable" },
                    { label: "Wallet network", value: transaction.wallet?.network || "Unavailable" },
                  ]}
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
                title="Amounts and fees"
                description="Amount fields currently surfaced by the transaction detail contract."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Amount", value: formatTransactionAmount(transaction.amount, transaction.asset) },
                    { label: "Recipient gets", value: formatTransactionAmount(transaction.recipientGets, transaction.asset) },
                    { label: "Network fee", value: formatTransactionAmount(transaction.networkFee, transaction.networkFeeAsset || transaction.asset) },
                    { label: "Platform fee", value: formatTransactionAmount(transaction.platformFee, transaction.asset) },
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
                      { label: "Total debit", value: formatTransactionAmount(transaction.totalDebit, transaction.asset) },
                      { label: "Asset type", value: humanizeTransactionValue(transaction.assetType) || "Unavailable" },
                      { label: "Standard", value: humanizeTransactionValue(transaction.standard) || "Unavailable" },
                      { label: "Contract address", value: transaction.contractAddress || "Unavailable" },
                    ]}
                  />
                </div>
              </DetailSection>

              <DetailSection
                title="Hash and on-chain info"
                description="Hash, explorer, and chain-linked transaction visibility returned by the backend."
              >
                <KeyValueGrid
                  items={[
                    { label: "Tx hash", value: transaction.txHash || "Unavailable" },
                    { label: "Ledger index", value: transaction.ledgerIndex || "Unavailable" },
                    { label: "Address explorer", value: transaction.addressExplorerUrl || "Unavailable" },
                    { label: "Related transaction", value: transaction.relatedTransactionId || "Unavailable" },
                  ]}
                />

                <div className="mt-4 flex flex-wrap gap-3">
                  {transaction.explorerUrl ? (
                    <a
                      href={transaction.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/15"
                    >
                      Open explorer
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  {transaction.addressExplorerUrl ? (
                    <a
                      href={transaction.addressExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:bg-white/[0.08]"
                    >
                      Open address explorer
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </DetailSection>

              <DetailSection
                title="State and lifecycle"
                description="Operational state and timestamp signals currently available on this transaction."
              >
                <div className="flex flex-wrap gap-2">
                  <SuperadminTransactionsBadge tone={getTransactionStatusTone(transaction.status)}>
                    {humanizeTransactionValue(transaction.status)}
                  </SuperadminTransactionsBadge>
                  {transaction.chainStatus ? (
                    <SuperadminTransactionsBadge tone="slate">
                      {humanizeTransactionValue(transaction.chainStatus)}
                    </SuperadminTransactionsBadge>
                  ) : null}
                  {transaction.systemStatus ? (
                    <SuperadminTransactionsBadge tone="slate">
                      {humanizeTransactionValue(transaction.systemStatus)}
                    </SuperadminTransactionsBadge>
                  ) : null}
                  {transaction.isSystemManaged ? (
                    <SuperadminTransactionsBadge tone="cyan">System managed</SuperadminTransactionsBadge>
                  ) : null}
                </div>

                <div className="mt-4">
                  <KeyValueGrid
                    items={[
                      { label: "On-chain time", value: formatTransactionAbsoluteTime(transaction.chainTimestamp) || "Unavailable" },
                      { label: "Confirmed", value: formatTransactionAbsoluteTime(transaction.confirmedAt) || "Unavailable" },
                      { label: "Updated", value: formatTransactionAbsoluteTime(transaction.updatedAt) || "Unavailable" },
                      { label: "Display time", value: formatTransactionAbsoluteTime(transaction.displayTimestamp) || "Unavailable" },
                    ]}
                  />
                </div>

                {transaction.errorMessage ? (
                  <div className="mt-4 rounded-[18px] border border-rose-300/15 bg-rose-400/10 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-100/80">
                      Error summary
                    </p>
                    <p className="mt-2 text-sm leading-6 text-rose-50">{transaction.errorMessage}</p>
                  </div>
                ) : null}
              </DetailSection>

              <DetailSection
                title="Address info"
                description="Source, destination, and chain-specific address data available on this transaction."
              >
                <KeyValueGrid
                  items={[
                    { label: "From address", value: transaction.fromAddress || "Unavailable" },
                    { label: "To address", value: transaction.toAddress || "Unavailable" },
                    { label: "Primary address", value: transaction.address || "Unavailable" },
                    { label: "Destination tag", value: transaction.destinationTag || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Related records summary"
                description="The current detail contract exposes ledger-entry previews for deeper transaction investigation."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Ledger entries
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                      {formatTransactionCount(transaction.ledgerEntries.length)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Relative time
                    </p>
                    <p className="mt-3 text-lg font-semibold tracking-tight text-white">
                      {formatTransactionRelativeTime(transaction.displayTimestamp)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {transaction.ledgerEntries.length > 0 ? (
                    transaction.ledgerEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {formatTransactionAmount(entry.amount, entry.asset)}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {humanizeTransactionValue(entry.category || "entry")} • {entry.wallet?.label || truncateMiddle(entry.wallet?.address || entry.walletId, 12, 8)}
                            </p>
                          </div>
                          <SuperadminTransactionsBadge tone={getTransactionDirectionTone(entry.direction)}>
                            {humanizeTransactionValue(entry.direction)}
                          </SuperadminTransactionsBadge>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                          <span>{entry.note || "No note"}</span>
                          <span title={formatTransactionAbsoluteTime(entry.createdAt)}>
                            {formatTransactionRelativeTime(entry.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                      <p className="text-sm font-medium text-white">No ledger entries returned</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Related deposit, withdrawal, and execution record linkage is still limited to the current ledger-entry preview contract.
                      </p>
                    </div>
                  )}
                </div>
              </DetailSection>

              {(executionMetadataItems.length > 0 || compositeDebitItems.length > 0) ? (
                <DetailSection
                  title="Metadata and execution summary"
                  description="Safe execution parameters and composite debit metadata currently surfaced by the backend."
                >
                  {executionMetadataItems.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Execution parameters
                      </p>
                      <KeyValueGrid
                        items={executionMetadataItems.map(([key, value]) => ({
                          label: value.label || humanizeTransactionValue(key),
                          value: formatMetadataValue(value.value),
                        }))}
                      />
                    </div>
                  ) : null}

                  {compositeDebitItems.length > 0 ? (
                    <div className={executionMetadataItems.length > 0 ? "mt-4" : ""}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Composite debit
                      </p>
                      <div className="mt-3">
                        <KeyValueGrid
                          items={compositeDebitItems.map(([key, value]) => ({
                            label: humanizeTransactionValue(key),
                            value: formatMetadataValue(value),
                          }))}
                        />
                      </div>
                    </div>
                  ) : null}
                </DetailSection>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </SuperadminDetailModal>
  );
}
