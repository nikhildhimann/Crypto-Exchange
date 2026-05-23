import { ChevronLeft, ChevronRight, Eye, RefreshCw } from "lucide-react";
import { SuperadminCopyValue } from "../SuperadminCopyValue";
import { SuperadminTableScrollArea } from "../SuperadminTableScrollArea";
import { SuperadminTransactionsBadge } from "./SuperadminTransactionsBadge";
import {
  formatTransactionAbsoluteTime,
  formatTransactionAmount,
  formatTransactionDisplayId,
  formatTransactionRelativeTime,
  getTransactionChainTone,
  getTransactionDirectionTone,
  getTransactionStatusTone,
  getTransactionTypeTone,
  humanizeTransactionValue,
  truncateMiddle,
} from "./utils";

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1.15fr_0.9fr_0.95fr_0.85fr_0.9fr_1.2fr_1fr_1fr_0.9fr_0.9fr_0.7fr] gap-3 rounded-[20px] border border-white/8 bg-slate-950/45 px-4 py-4"
        >
          {Array.from({ length: 11 }).map((__, cellIndex) => (
            <div key={cellIndex} className="h-4 rounded-full bg-white/[0.06]" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[24px] border border-dashed border-white/12 bg-slate-950/40 px-5 py-8 text-center">
      <p className="text-base font-semibold text-white">No transactions matched these filters</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Adjust the server-side filters or search criteria to broaden the result set.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-[24px] border border-rose-300/15 bg-rose-400/10 px-5 py-6">
      <p className="text-base font-semibold text-rose-50">Transactions list unavailable</p>
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

function MobileCard({ item, onView }) {
  return (
    <button
      type="button"
      onClick={() => onView(item.id)}
      className="w-full rounded-[24px] border border-white/10 bg-slate-950/45 p-4 text-left transition hover:border-cyan-300/20 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <SuperadminCopyValue
            className="text-sm font-semibold text-white"
            compact
            label="transaction id"
            value={item.id}
            displayValue={formatTransactionDisplayId(item)}
            mono={false}
          />
          <p className="text-xs leading-5 text-slate-400">
            {formatTransactionAmount(item.amount, item.asset)} • {humanizeTransactionValue(item.type || "transfer")}
          </p>
        </div>
        <SuperadminTransactionsBadge tone={getTransactionStatusTone(item.status)}>
          {humanizeTransactionValue(item.status)}
        </SuperadminTransactionsBadge>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <SuperadminTransactionsBadge tone={getTransactionChainTone(item.chain)}>
          {String(item.chain || "").toUpperCase() || "Chain"}
        </SuperadminTransactionsBadge>
        <SuperadminTransactionsBadge tone={getTransactionTypeTone(item.transactionType)}>
          {humanizeTransactionValue(item.transactionType || "external")}
        </SuperadminTransactionsBadge>
        <SuperadminTransactionsBadge tone={getTransactionDirectionTone(item.normalizedDirection)}>
          {humanizeTransactionValue(item.normalizedDirection || item.direction)}
        </SuperadminTransactionsBadge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">User</p>
          <SuperadminCopyValue
            className="mt-1 w-full text-slate-200"
            compact
            label="public address"
            value={item.user?.publicAddress || item.user?.id}
            displayValue={truncateMiddle(item.user?.publicAddress || item.user?.id, 10, 6)}
          />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Wallet</p>
          <SuperadminCopyValue
            className="mt-1 w-full text-slate-200"
            compact
            label="wallet address"
            value={item.wallet?.address || item.wallet?.id}
            displayValue={item.wallet?.label || truncateMiddle(item.wallet?.address || item.wallet?.id, 10, 6)}
            mono={!item.wallet?.label}
          />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Hash</p>
          <SuperadminCopyValue
            className="mt-1 w-full text-slate-200"
            compact
            label="tx hash"
            value={item.txHash || item.id}
            displayValue={truncateMiddle(item.txHash || item.id, 10, 6)}
          />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Created</p>
          <p className="mt-1 text-slate-200">{formatTransactionRelativeTime(item.createdAt)}</p>
        </div>
      </div>
    </button>
  );
}

export function SuperadminTransactionsTable({
  state,
  onRetry,
  onPageChange,
  onView,
}) {
  const data = state.data;
  const items = data?.items || [];

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(2,6,23,0.24)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">Transactions</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Global transaction activity with linked entity context, lifecycle signals, and independent detail inspection.
          </p>
        </div>
        {state.loading && data ? (
          <SuperadminTransactionsBadge tone="cyan">Updating</SuperadminTransactionsBadge>
        ) : null}
      </div>

      <div className="px-5 py-5 sm:px-6">
        {state.error && !data ? <ErrorState message={state.error} onRetry={onRetry} /> : null}
        {state.loading && !data ? <TableSkeleton /> : null}
        {!state.loading && !state.error && items.length === 0 ? <EmptyState /> : null}
        {state.error && data ? (
          <div className="mb-4 rounded-[20px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{state.error}. Showing the last successful result set.</p>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.14]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="space-y-3 md:hidden">
              {items.map((item) => (
                <MobileCard key={item.id} item={item} onView={onView} />
              ))}
            </div>

            <div className="hidden overflow-hidden md:block">
              <SuperadminTableScrollArea>
                <table className="min-w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      <th className="px-4 py-2">Transaction</th>
                      <th className="px-4 py-2">User</th>
                      <th className="px-4 py-2">Wallet</th>
                      <th className="px-4 py-2">Chain</th>
                      <th className="px-4 py-2">Movement</th>
                      <th className="px-4 py-2">From / To</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">Tx hash</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Time</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="bg-slate-950/45 text-sm text-slate-300">
                        <td className="rounded-l-[20px] border border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1">
                            <SuperadminCopyValue
                              className="font-semibold text-sm text-white"
                              compact
                              label="transaction id"
                              value={item.id}
                              displayValue={formatTransactionDisplayId(item)}
                              mono={false}
                            />
                            <p className="text-xs text-slate-500">
                              {humanizeTransactionValue(item.type || "transfer")} • <SuperadminCopyValue
                                className="text-xs text-slate-500 inline"
                                compact
                                label="transaction id"
                                value={item.id}
                                displayValue={truncateMiddle(item.id, 10, 6)}
                                mono={false}
                              />
                            </p>
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <SuperadminCopyValue
                            className="text-white"
                            compact
                            label="public address"
                            value={item.user?.publicAddress || item.user?.id}
                            displayValue={truncateMiddle(item.user?.publicAddress || item.user?.id, 10, 6)}
                          />
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1">
                            <SuperadminCopyValue
                              className="text-white"
                              compact
                              label="wallet address"
                              value={item.wallet?.address || item.wallet?.id}
                              displayValue={item.wallet?.label || truncateMiddle(item.wallet?.address || item.wallet?.id, 10, 6)}
                              mono={!item.wallet?.label}
                            />
                            <p className="text-xs text-slate-500">
                              {item.wallet?.network || "Network unavailable"}
                            </p>
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <SuperadminTransactionsBadge tone={getTransactionChainTone(item.chain)}>
                              {String(item.chain || "").toUpperCase() || "Unknown"}
                            </SuperadminTransactionsBadge>
                            {item.asset && String(item.asset).toUpperCase() !== String(item.chain || "").toUpperCase() ? (
                              <SuperadminTransactionsBadge tone="slate">
                                {item.asset}
                              </SuperadminTransactionsBadge>
                            ) : null}
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <SuperadminTransactionsBadge tone={getTransactionTypeTone(item.transactionType)}>
                              {humanizeTransactionValue(item.transactionType || "external")}
                            </SuperadminTransactionsBadge>
                            <SuperadminTransactionsBadge tone={getTransactionDirectionTone(item.normalizedDirection)}>
                              {humanizeTransactionValue(item.normalizedDirection || item.direction)}
                            </SuperadminTransactionsBadge>
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">From:</span>
                              <SuperadminCopyValue
                                compact
                                className="text-slate-300"
                                label="from address"
                                value={item.fromAddress || (["incoming", "received", "credit"].includes(String(item.direction || item.normalizedDirection).toLowerCase()) ? "external" : (item.wallet?.address || item.wallet?.id))}
                                displayValue={item.fromAddress ? truncateMiddle(item.fromAddress, 6, 4) : (["incoming", "received", "credit"].includes(String(item.direction || item.normalizedDirection).toLowerCase()) ? "-" : truncateMiddle(item.wallet?.address || item.wallet?.id, 6, 4) || "-")}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">To:</span>
                              <SuperadminCopyValue
                                compact
                                className="text-slate-300"
                                label="to address"
                                value={item.toAddress || (["outgoing", "debit", "sent"].includes(String(item.direction || item.normalizedDirection).toLowerCase()) ? "external" : (item.wallet?.address || item.wallet?.id))}
                                displayValue={item.toAddress ? truncateMiddle(item.toAddress, 6, 4) : (["outgoing", "debit", "sent"].includes(String(item.direction || item.normalizedDirection).toLowerCase()) ? "-" : truncateMiddle(item.wallet?.address || item.wallet?.id, 6, 4) || "-")}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1">
                            <p className="text-white">{formatTransactionAmount(item.amount, item.asset)}</p>
                            <p className="text-xs text-slate-500">{item.networkLabel || item.network || "Network unavailable"}</p>
                          </div>
                        </td>
                        <td
                          className="border border-l-0 border-r-0 border-white/8 px-4 py-4 text-white"
                          title={item.txHash || ""}
                        >
                          <SuperadminCopyValue
                            compact
                            label="tx hash"
                            value={item.txHash}
                            displayValue={item.txHash ? truncateMiddle(item.txHash, 12, 8) : "Unavailable"}
                            disabled={!item.txHash}
                          />
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <SuperadminTransactionsBadge tone={getTransactionStatusTone(item.status)}>
                              {humanizeTransactionValue(item.status)}
                            </SuperadminTransactionsBadge>
                            {item.chainStatus ? (
                              <SuperadminTransactionsBadge tone="slate">
                                {humanizeTransactionValue(item.chainStatus)}
                              </SuperadminTransactionsBadge>
                            ) : null}
                          </div>
                        </td>
                        <td className="border border-l-0 border-r-0 border-white/8 px-4 py-4">
                          <div className="space-y-1">
                            <p className="text-white" title={formatTransactionAbsoluteTime(item.chainTimestamp || item.createdAt)}>
                              {formatTransactionAbsoluteTime(item.chainTimestamp || item.createdAt)}
                            </p>
                          </div>
                        </td>
                        <td className="rounded-r-[20px] border border-l-0 border-white/8 px-4 py-4">
                          <button
                            type="button"
                            onClick={() => onView(item.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SuperadminTableScrollArea>
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-white/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">
                Showing page {data.page} of {data.totalPages || 1} with {data.total} total transactions.
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onPageChange(data.page - 1)}
                  disabled={!data.hasPrevPage}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => onPageChange(data.page + 1)}
                  disabled={!data.hasNextPage}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
