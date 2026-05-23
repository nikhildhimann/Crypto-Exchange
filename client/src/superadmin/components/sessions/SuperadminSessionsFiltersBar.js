import { Filter, Search, X } from "lucide-react";

const SORT_OPTIONS = Object.freeze([
  { value: "lastUsedAt:desc", label: "Recently used" },
  { value: "lastUsedAt:asc", label: "Oldest use" },
  { value: "createdAt:desc", label: "Newest created" },
  { value: "createdAt:asc", label: "Oldest created" },
  { value: "expiresAt:desc", label: "Latest expiry" },
  { value: "expiresAt:asc", label: "Earliest expiry" },
  { value: "status:asc", label: "Status A-Z" },
]);

export function SuperadminSessionsFiltersBar({
  query,
  searchDraft,
  setSearchDraft,
  userIdDraft,
  setUserIdDraft,
  platformDraft,
  setPlatformDraft,
  deviceIdDraft,
  setDeviceIdDraft,
  activeFilterCount,
  pageSizeOptions,
  onApplyUserIdFilter,
  onClearUserIdFilter,
  onApplyPlatformFilter,
  onClearPlatformFilter,
  onApplyDeviceIdFilter,
  onClearDeviceIdFilter,
  onScopeChange,
  onStatusChange,
  onCreatedFromChange,
  onCreatedToChange,
  onLastUsedFromChange,
  onLastUsedToChange,
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
              Sessions controls
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Server-driven session search and filters for scalable access investigation across user and superadmin session scopes.
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

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_repeat(3,minmax(0,0.85fr))]">
          <label className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <Search className="h-4.5 w-4.5 text-slate-500" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search by session id, device, platform, IP, or agent"
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
              value={platformDraft}
              onChange={(event) => setPlatformDraft(event.target.value.trim())}
              placeholder="Platform"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={onApplyPlatformFilter}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
            >
              Apply
            </button>
            {query.platform ? (
              <button
                type="button"
                onClick={onClearPlatformFilter}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-2.5">
            <input
              type="text"
              value={deviceIdDraft}
              onChange={(event) => setDeviceIdDraft(event.target.value.trim())}
              placeholder="Device id"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={onApplyDeviceIdFilter}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
            >
              Apply
            </button>
            {query.deviceId ? (
              <button
                type="button"
                onClick={onClearDeviceIdFilter}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
              >
                Clear
              </button>
            ) : null}
          </div>

          <select
            value={query.scope}
            onChange={(event) => onScopeChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All scopes</option>
            <option value="user">User</option>
            <option value="superadmin">Superadmin</option>
            <option value="all">All</option>
          </select>

          <select
            value={query.status}
            onChange={(event) => onStatusChange(event.target.value)}
            className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>

          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Contract note
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-400">
              Biometric and expires-range filters are not exposed by the current backend contract yet.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
              Last used from
            </span>
            <input
              type="date"
              value={query.lastUsedFrom}
              onChange={(event) => onLastUsedFromChange(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
          </label>

          <label className="space-y-2 rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Last used to
            </span>
            <input
              type="date"
              value={query.lastUsedTo}
              onChange={(event) => onLastUsedToChange(event.target.value)}
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

