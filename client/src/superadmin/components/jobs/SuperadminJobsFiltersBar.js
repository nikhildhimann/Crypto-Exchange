import { Filter, Search, X } from "lucide-react";

const SORT_OPTIONS = Object.freeze([
  { value: "jobName:asc", label: "Job A-Z" },
  { value: "status:asc", label: "Status A-Z" },
  { value: "intervalMs:asc", label: "Shortest interval" },
  { value: "intervalMs:desc", label: "Longest interval" },
]);

export function SuperadminJobsFiltersBar({
  query,
  searchDraft,
  setSearchDraft,
  activeFilterCount,
  pageSizeOptions,
  onStatusChange,
  onEnabledChange,
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
              Job controls
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Compact runtime job visibility with server-driven search, enablement, and status filters.
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

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.85fr))]">
          <label className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <Search className="h-4.5 w-4.5 text-slate-500" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by job name or status"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>

          <select
            value={query.status}
            onChange={(event) => onStatusChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="scheduled">Scheduled</option>
            <option value="idle">Idle</option>
            <option value="disabled">Disabled</option>
          </select>

          <select
            value={query.enabled}
            onChange={(event) => onEnabledChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All enablement</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>

          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Contract note
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-400">
              Last run, last success, and last error details are not exposed by the current jobs backend contract yet.
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
