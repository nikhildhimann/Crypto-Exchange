import { Filter, Search, X } from "lucide-react";

const SORT_OPTIONS = Object.freeze([
  { value: "createdAt:desc", label: "Newest created" },
  { value: "createdAt:asc", label: "Oldest created" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "updatedAt:asc", label: "Oldest updated" },
  { value: "action:asc", label: "Action A-Z" },
  { value: "resource:asc", label: "Resource A-Z" },
  { value: "status:asc", label: "Status A-Z" },
]);

export function SuperadminAuditFiltersBar({
  query,
  searchDraft,
  setSearchDraft,
  userIdDraft,
  setUserIdDraft,
  actionDraft,
  setActionDraft,
  resourceDraft,
  setResourceDraft,
  activeFilterCount,
  pageSizeOptions,
  onApplyUserIdFilter,
  onClearUserIdFilter,
  onApplyActionFilter,
  onClearActionFilter,
  onApplyResourceFilter,
  onClearResourceFilter,
  onStatusChange,
  onCreatedFromChange,
  onCreatedToChange,
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
              Audit controls
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Server-driven audit search and filters for scalable incident review, access monitoring, and resource-level investigation.
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

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_repeat(2,minmax(0,0.8fr))]">
          <label className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <Search className="h-4.5 w-4.5 text-slate-500" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by action, resource, IP, or id"
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
              value={actionDraft}
              onChange={(event) => setActionDraft(event.target.value.trim())}
              placeholder="Action"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={onApplyActionFilter}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
            >
              Apply
            </button>
            {query.action ? (
              <button
                type="button"
                onClick={onClearActionFilter}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-2.5">
            <input
              type="text"
              value={resourceDraft}
              onChange={(event) => setResourceDraft(event.target.value.trim())}
              placeholder="Resource"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={onApplyResourceFilter}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
            >
              Apply
            </button>
            {query.resource ? (
              <button
                type="button"
                onClick={onClearResourceFilter}
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
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="warning">Warning</option>
            <option value="denied">Denied</option>
          </select>

          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Contract note
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-400">
              Severity, request id, and actor-type filters are not exposed by the current backend audit contract yet.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
