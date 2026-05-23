import { Link } from "react-router";
import { ArrowRight, ExternalLink, RefreshCw, X } from "lucide-react";
import { SuperadminCopyValue, isLikelyCopyableDetail } from "../SuperadminCopyValue";
import { SuperadminDetailModal } from "../SuperadminDetailModal";
import { SuperadminWalletsBadge } from "./SuperadminWalletsBadge";
import {
  formatMetadataValue,
  formatWalletAbsoluteTime,
  formatWalletCount,
  formatWalletDisplayId,
  formatWalletRelativeTime,
  getWalletChainTone,
  getWalletStateTone,
  humanizeWalletValue,
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
      <p className="text-base font-semibold text-rose-50">Wallet details unavailable</p>
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

export function SuperadminWalletDetailDrawer({
  walletId,
  state,
  open,
  onClose,
  onRetry,
}) {
  if (!open) {
    return null;
  }

  const wallet = state.data;
  const metadataItems = Object.entries(wallet?.metadata || {}).slice(0, 8);
  const quickLinks = [
    { label: "Open linked user", to: wallet?.user?.id ? `/superadmin/users?selected=${wallet.user.id}` : "/superadmin/users" },
    { label: "Open linked account", to: wallet?.account?.id ? `/superadmin/accounts?selected=${wallet.account.id}` : "/superadmin/accounts" },
    { label: "Open transactions", to: `/superadmin/transactions?walletId=${walletId}` },
    { label: "Open deposits", to: `/superadmin/deposits?walletId=${walletId}` },
    { label: "Open withdrawals", to: `/superadmin/withdrawals?walletId=${walletId}` },
  ];

  return (
    <SuperadminDetailModal open={open} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5 lg:px-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SuperadminWalletsBadge tone={getWalletChainTone(wallet?.chain)}>
                {String(wallet?.chain || "wallet").toUpperCase()}
              </SuperadminWalletsBadge>
              <SuperadminWalletsBadge tone={getWalletStateTone(wallet?.sourceType)}>
                {humanizeWalletValue(wallet?.sourceType || "loading")}
              </SuperadminWalletsBadge>
              {wallet?.isPrimary ? <SuperadminWalletsBadge tone="emerald">Primary</SuperadminWalletsBadge> : null}
              {wallet?.isDefaultForChain ? <SuperadminWalletsBadge tone="emerald">Default</SuperadminWalletsBadge> : null}
              {wallet?.hidden ? <SuperadminWalletsBadge tone="amber">Hidden</SuperadminWalletsBadge> : null}
              {wallet?.archived ? <SuperadminWalletsBadge tone="rose">Archived</SuperadminWalletsBadge> : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Wallet inspection
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {wallet?.label || (wallet ? formatWalletDisplayId(wallet) : truncateMiddle(walletId, 12, 6))}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Read-only operational visibility for wallet identity, receive addresses, state flags, and recent activity.
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
          {state.loading && !wallet ? <LoadingState /> : null}
          {state.error && !wallet ? <ErrorState message={state.error} onRetry={onRetry} /> : null}

          {wallet ? (
            <div className="space-y-4">
              <DetailSection
                title="Wallet summary"
                description="Core wallet identity fields returned by the superadmin detail endpoint."
              >
                <KeyValueGrid
                  items={[
                    { label: "Wallet id", value: wallet.id || "Unavailable" },
                    { label: "Label", value: wallet.label || "Unnamed wallet" },
                    { label: "Chain", value: String(wallet.chain || "").toUpperCase() || "Unavailable" },
                    { label: "Network", value: wallet.network || "Unavailable" },
                    { label: "Asset", value: wallet.asset || "Unavailable" },
                    { label: "Source type", value: humanizeWalletValue(wallet.sourceType) || "Unavailable" },
                    { label: "Created", value: formatWalletAbsoluteTime(wallet.createdAt) || "Unavailable" },
                    { label: "Updated", value: formatWalletAbsoluteTime(wallet.updatedAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Linked user"
                description="User summary currently returned with this wallet detail payload."
              >
                <KeyValueGrid
                  items={[
                    { label: "User id", value: wallet.user?.id || wallet.userId || "Unavailable" },
                    { label: "Public address", value: truncateMiddle(wallet.user?.publicAddress, 14, 8) },
                    { label: "Role", value: humanizeWalletValue(wallet.user?.role) || "Unavailable" },
                    { label: "Status", value: humanizeWalletValue(wallet.user?.status) || "Unavailable" },
                    { label: "Primary chain", value: wallet.user?.primaryChain ? String(wallet.user.primaryChain).toUpperCase() : "Unavailable" },
                    { label: "Last access", value: formatWalletAbsoluteTime(wallet.user?.lastAccessAt) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Linked account"
                description="Account summary currently returned with this wallet detail payload."
              >
                <KeyValueGrid
                  items={[
                    { label: "Account id", value: wallet.account?.id || wallet.accountId || "Unavailable" },
                    { label: "Account name", value: wallet.account?.name || "Unavailable" },
                    { label: "Account type", value: humanizeWalletValue(wallet.account?.type) || "Unavailable" },
                    { label: "Account status", value: humanizeWalletValue(wallet.account?.status) || "Unavailable" },
                  ]}
                />
              </DetailSection>

              <DetailSection
                title="Address and receive info"
                description="Primary wallet address and receive-oriented address records returned by the backend."
              >
                <KeyValueGrid
                  items={[
                    { label: "Primary address", value: wallet.address || "Unavailable" },
                    { label: "Public key", value: wallet.publicKey || "Unavailable" },
                  ]}
                />

                <div className="mt-4 space-y-3">
                  {wallet.addresses.length > 0 ? (
                    wallet.addresses.slice(0, 8).map((address) => (
                      <div
                        key={address.id}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {truncateMiddle(address.address, 14, 8)}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {humanizeWalletValue(address.purpose || "receive")} • {humanizeWalletValue(address.addressType || "address")}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <SuperadminWalletsBadge tone={getWalletStateTone(address.status)}>
                              {humanizeWalletValue(address.status)}
                            </SuperadminWalletsBadge>
                            {address.isActive ? <SuperadminWalletsBadge tone="emerald">Active</SuperadminWalletsBadge> : null}
                            {address.isChange ? <SuperadminWalletsBadge tone="amber">Change</SuperadminWalletsBadge> : null}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                          <span>{address.memo || "No memo/tag"}</span>
                          <span>{address.derivationPath || "No derivation path"}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                      <p className="text-sm font-medium text-white">No address records returned</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Address inventory for this wallet is limited to the current detail contract and may not include a full receive history.
                      </p>
                    </div>
                  )}
                </div>
              </DetailSection>

              <DetailSection
                title="State and activity"
                description="Current flags and count summaries supported by the wallet detail contract."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Addresses", value: wallet.metrics.addressesCount },
                    { label: "Transactions", value: wallet.metrics.transactionsCount },
                    { label: "Deposits", value: wallet.metrics.depositsCount },
                    { label: "Withdrawals", value: wallet.metrics.withdrawalsCount },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                        {formatWalletCount(item.value)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <SuperadminWalletsBadge tone={wallet.isImported ? "amber" : "cyan"}>
                    {wallet.isImported ? "Imported" : "Created"}
                  </SuperadminWalletsBadge>
                  {wallet.hidden ? <SuperadminWalletsBadge tone="amber">Hidden</SuperadminWalletsBadge> : null}
                  {wallet.archived ? <SuperadminWalletsBadge tone="rose">Archived</SuperadminWalletsBadge> : null}
                  {wallet.isPrimary ? <SuperadminWalletsBadge tone="emerald">Primary wallet</SuperadminWalletsBadge> : null}
                  {wallet.isDefaultForChain ? <SuperadminWalletsBadge tone="emerald">Default for chain</SuperadminWalletsBadge> : null}
                </div>
              </DetailSection>

              <DetailSection
                title="Balance summary"
                description="The current backend wallet contract does not expose a live balance snapshot to the superadmin read layer."
              >
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                  <p className="text-sm font-medium text-white">Live balance not available here</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    This wallet view intentionally avoids fabricating balances. Chain, asset, address inventory, and recent activity are shown instead until a safe balance summary contract is added.
                  </p>
                </div>
              </DetailSection>

              {metadataItems.length > 0 ? (
                <DetailSection
                  title="Metadata summary"
                  description="Only safe wallet metadata values returned by the read endpoint are surfaced here."
                >
                  <KeyValueGrid
                    items={metadataItems.map(([label, value]) => ({
                      label: humanizeWalletValue(label),
                      value: formatMetadataValue(value),
                    }))}
                  />
                </DetailSection>
              ) : null}

              <DetailSection
                title="Recent transactions"
                description="The latest wallet-linked transaction slice returned by the backend detail contract."
              >
                <div className="space-y-3">
                  {wallet.recentTransactions.length > 0 ? (
                    wallet.recentTransactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {transaction.amount || "0"} {transaction.asset || transaction.currency || ""}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {humanizeWalletValue(transaction.direction)} • {transaction.chainLabel || String(transaction.chain || "").toUpperCase()} • {transaction.networkLabel || transaction.network || "Network unavailable"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <SuperadminWalletsBadge tone={getWalletStateTone(transaction.status)}>
                              {humanizeWalletValue(transaction.status)}
                            </SuperadminWalletsBadge>
                            {transaction.explorerUrl ? (
                              <a
                                href={transaction.explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-200 transition hover:text-cyan-100"
                              >
                                Explorer
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                          <span>{truncateMiddle(transaction.txHash || transaction.transactionId, 12, 8)}</span>
                          <span title={formatWalletAbsoluteTime(transaction.displayTimestamp || transaction.createdAt)}>
                            {formatWalletRelativeTime(transaction.displayTimestamp || transaction.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5">
                      <p className="text-sm font-medium text-white">No recent transactions returned</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Recent wallet-linked transaction visibility is limited to the preview slice currently returned by the detail endpoint.
                      </p>
                    </div>
                  )}
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
