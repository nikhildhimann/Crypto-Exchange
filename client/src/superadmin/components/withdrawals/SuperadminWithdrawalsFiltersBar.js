import { Filter, Search, X } from "lucide-react";
import { SUPERADMIN_CHAIN_OPTIONS } from "../chainOptions";

const SORT_OPTIONS = Object.freeze([
  { value: "createdAt:desc", label: "Newest created" },
  { value: "createdAt:asc", label: "Oldest created" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "updatedAt:asc", label: "Oldest updated" },
  { value: "status:asc", label: "Status A-Z" },
]);

export function SuperadminWithdrawalsFiltersBar({
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
  onAssetChange,
  onStatusChange,
  onCreatedFromChange,
  onCreatedToChange,
  onLimitChange,
  onSortChange,
  onClearFilters,
}) {
  const controlClassName =
    "rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus-visible:border-cyan-300/40 focus-visible:ring-2 focus-visible:ring-cyan-300/20";
  const actionButtonClassName =
    "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/30";

  return (
    <div className="superadmin-filter-card rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(2,6,23,0.24)] backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
              <Filter className="h-4 w-4" />
              Withdrawals controls
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Server-driven withdrawal search and filters for scalable review across users, accounts, wallets, and execution queues.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300">
              {activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}
            </div>
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/30"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))_repeat(3,minmax(0,0.8fr))]">
          <label className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 transition focus-within:border-cyan-300/40 focus-within:ring-2 focus-within:ring-cyan-300/20">
            <Search className="h-4.5 w-4.5 text-slate-500" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by tx hash, address, reference, amount, or id"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>

          <div className="flex gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-2.5 transition focus-within:border-cyan-300/40 focus-within:ring-2 focus-within:ring-cyan-300/20">
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
              className={actionButtonClassName}
            >
              Apply
            </button>
            {query.userId ? (
              <button
                type="button"
                onClick={onClearUserIdFilter}
                className={actionButtonClassName}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-2.5 transition focus-within:border-cyan-300/40 focus-within:ring-2 focus-within:ring-cyan-300/20">
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
              className={actionButtonClassName}
            >
              Apply
            </button>
            {query.accountId ? (
              <button
                type="button"
                onClick={onClearAccountIdFilter}
                className={actionButtonClassName}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-2.5 transition focus-within:border-cyan-300/40 focus-within:ring-2 focus-within:ring-cyan-300/20">
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
              className={actionButtonClassName}
            >
              Apply
            </button>
            {query.walletId ? (
              <button
                type="button"
                onClick={onClearWalletIdFilter}
                className={actionButtonClassName}
              >
                Clear
              </button>
            ) : null}
          </div>

          <select
            value={query.chain}
            onChange={(event) => onChainChange(event.target.value)}
            className={controlClassName}
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
            value={query.asset}
            onChange={(event) => onAssetChange(event.target.value.trim().toUpperCase())}
            placeholder="Asset"
            className={controlClassName}
          />

          <select
            value={query.status}
            onChange={(event) => onStatusChange(event.target.value)}
            className={controlClassName}
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
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 transition focus-within:border-cyan-300/40 focus-within:ring-2 focus-within:ring-cyan-300/20">
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

          <label className="space-y-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 transition focus-within:border-cyan-300/40 focus-within:ring-2 focus-within:ring-cyan-300/20">
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

          <select
            value={`${query.sortBy}:${query.sortOrder}`}
            onChange={(event) => {
              const [sortBy, sortOrder] = event.target.value.split(":");
              onSortChange({ sortBy, sortOrder });
            }}
            className={controlClassName}
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
            className={controlClassName}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>

          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Contract note
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-400">
              Network-specific filters are not exposed on this page, but chain, status, user, and wallet filters map directly to the backend contract.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
