import { Filter, Search, X } from "lucide-react";
import { SUPERADMIN_CHAIN_OPTIONS } from "../chainOptions";

const SORT_OPTIONS = Object.freeze([
  { value: "createdAt:desc", label: "Newest created" },
  { value: "createdAt:asc", label: "Oldest created" },
  { value: "chainTimestamp:desc", label: "Newest on-chain" },
  { value: "chainTimestamp:asc", label: "Oldest on-chain" },
  { value: "confirmedAt:desc", label: "Newest confirmed" },
  { value: "confirmedAt:asc", label: "Oldest confirmed" },
  { value: "status:asc", label: "Status A-Z" },
  { value: "updatedAt:desc", label: "Recently updated" },
]);

export function SuperadminTransactionsFiltersBar({
  query,
  searchDraft,
  setSearchDraft,
  userIdDraft,
  setUserIdDraft,
  accountIdDraft,
  setAccountIdDraft,
  walletIdDraft,
  setWalletIdDraft,
  activeFilterCount,
  pageSizeOptions,
  onApplyUserIdFilter,
  onClearUserIdFilter,
  onApplyAccountIdFilter,
  onClearAccountIdFilter,
  onApplyWalletIdFilter,
  onClearWalletIdFilter,
  onChainChange,
  onNetworkChange,
  onAssetChange,
  onStatusChange,
  onDirectionChange,
  onTransactionTypeChange,
  onCreatedFromChange,
  onCreatedToChange,
  onChainTimestampFromChange,
  onChainTimestampToChange,
  onLimitChange,
  onSortChange,
  onClearFilters,
}) {
  return (
    <div className="superadmin-filter-card rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(2,6,23,0.24)] backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
              <Filter className="h-4 w-4" />
              Transactions controls
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Server-driven search and filters for transaction investigation across users, accounts, wallets, and on-chain lifecycle signals.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300">
              {activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}
            </div>
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_repeat(5,minmax(0,0.8fr))]">
          <label className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <Search className="h-4.5 w-4.5 text-slate-500" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by tx hash, address, asset, or id"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>

          <div className="flex gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-2.5">
            <input
              type="text"
              value={userIdDraft}
              onChange={(event) => setUserIdDraft(event.target.value.trim())}
              placeholder="Linked user id"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={onApplyUserIdFilter}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
            >
              Apply
            </button>
            {query.userId ? (
              <button
                type="button"
                onClick={onClearUserIdFilter}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-2.5">
            <input
              type="text"
              value={accountIdDraft}
              onChange={(event) => setAccountIdDraft(event.target.value.trim())}
              placeholder="Linked account id"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={onApplyAccountIdFilter}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
            >
              Apply
            </button>
            {query.accountId ? (
              <button
                type="button"
                onClick={onClearAccountIdFilter}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-2.5">
            <input
              type="text"
              value={walletIdDraft}
              onChange={(event) => setWalletIdDraft(event.target.value.trim())}
              placeholder="Linked wallet id"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={onApplyWalletIdFilter}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
            >
              Apply
            </button>
            {query.walletId ? (
              <button
                type="button"
                onClick={onClearWalletIdFilter}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
              >
                Clear
              </button>
            ) : null}
          </div>

          <select
            value={query.chain}
            onChange={(event) => onChainChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All chains</option>
            {SUPERADMIN_CHAIN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={query.network}
            onChange={(event) => onNetworkChange(event.target.value.trim().toLowerCase())}
            placeholder="Network"
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />

          <input
            type="text"
            value={query.asset}
            onChange={(event) => onAssetChange(event.target.value.trim().toUpperCase())}
            placeholder="Asset"
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />

          <select
            value={query.transactionType}
            onChange={(event) => onTransactionTypeChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All scopes</option>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>

          <select
            value={query.direction}
            onChange={(event) => onDirectionChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All directions</option>
            <option value="incoming">Incoming</option>
            <option value="outgoing">Outgoing</option>
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select
            value={query.status}
            onChange={(event) => onStatusChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All statuses</option>
            <option value="created">Created</option>
            <option value="pending">Pending</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="success">Success</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <label className="space-y-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Created from
            </span>
            <input
              type="date"
              value={query.createdFrom}
              onChange={(event) => onCreatedFromChange(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
          </label>

          <label className="space-y-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Created to
            </span>
            <input
              type="date"
              value={query.createdTo}
              onChange={(event) => onCreatedToChange(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
          </label>

          <label className="space-y-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              On-chain from
            </span>
            <input
              type="date"
              value={query.chainTimestampFrom}
              onChange={(event) => onChainTimestampFromChange(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
          </label>

          <label className="space-y-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              On-chain to
            </span>
            <input
              type="date"
              value={query.chainTimestampTo}
              onChange={(event) => onChainTimestampToChange(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
          </label>

          <select
            value={`${query.sortBy}:${query.sortOrder}`}
            onChange={(event) => {
              const [sortBy, sortOrder] = event.target.value.split(":");
              onSortChange({ sortBy, sortOrder });
            }}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={query.limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
