import { Filter, Search, X } from "lucide-react";

const SORT_OPTIONS = Object.freeze([
  { value: "createdAt:desc", label: "Newest created" },
  { value: "createdAt:asc", label: "Oldest created" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "updatedAt:asc", label: "Oldest updated" },
  { value: "status:asc", label: "Status A-Z" },
  { value: "status:desc", label: "Status Z-A" },
  { value: "type:asc", label: "Type A-Z" },
  { value: "type:desc", label: "Type Z-A" },
]);

export function SuperadminAccountsFiltersBar({
  query,
  searchDraft,
  setSearchDraft,
  userIdDraft,
  setUserIdDraft,
  activeFilterCount,
  pageSizeOptions,
  onApplyUserIdFilter,
  onClearUserIdFilter,
  onStatusChange,
  onTypeChange,
  onCreatedFromChange,
  onCreatedToChange,
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
              Accounts controls
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Server-driven account search and filters for scalable investigation across linked users and wallet groups.
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

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_repeat(4,minmax(0,0.85fr))]">
          <label className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <Search className="h-4.5 w-4.5 text-slate-500" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by account id or name"
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

          <select
            value={query.status}
            onChange={(event) => onStatusChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>

          <select
            value={query.type}
            onChange={(event) => onTypeChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All types</option>
            <option value="personal">Personal</option>
            <option value="business">Business</option>
            <option value="trading">Trading</option>
            <option value="custom">Custom</option>
          </select>

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

        <div className="grid gap-3 md:grid-cols-2">
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
        </div>
      </div>
    </div>
  );
}

