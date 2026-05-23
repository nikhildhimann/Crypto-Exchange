import { Filter, Search, X } from "lucide-react";

const SORT_OPTIONS = Object.freeze([
  { value: "chain:asc", label: "Chain A-Z" },
  { value: "asset:asc", label: "Asset A-Z" },
  { value: "walletType:asc", label: "Wallet type" },
  { value: "status:asc", label: "Status A-Z" },
  { value: "createdAt:desc", label: "Newest created" },
]);

export function SuperadminTreasuryFiltersBar({
  query,
  searchDraft,
  setSearchDraft,
  activeFilterCount,
  pageSizeOptions,
  onChainChange,
  onAssetChange,
  onWalletTypeChange,
  onStatusChange,
  onLimitChange,
  onSortChange,
  onClearFilters,
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(2,6,23,0.24)] backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
              <Filter className="h-4 w-4" />
              Treasury controls
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Server-driven treasury search and filters for reserve visibility across chains and assets.
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

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,0.8fr))]">
          <label className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <Search className="h-4.5 w-4.5 text-slate-500" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by chain, asset, address, or wallet type"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>

          <input
            type="text"
            value={query.chain}
            onChange={(event) => onChainChange(event.target.value)}
            placeholder="Chain"
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />

          <input
            type="text"
            value={query.asset}
            onChange={(event) => onAssetChange(event.target.value)}
            placeholder="Asset"
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
          />

          <select
            value={query.walletType}
            onChange={(event) => onWalletTypeChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All wallet types</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>

          <select
            value={query.status}
            onChange={(event) => onStatusChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="inactive">Inactive</option>
          </select>

          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Contract note
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-400">
              Network, thresholds, and sync timestamps are not exposed by the current treasury read contract yet.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
