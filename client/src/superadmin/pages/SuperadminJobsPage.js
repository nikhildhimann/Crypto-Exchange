import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminJobsFiltersBar } from "../components/jobs/SuperadminJobsFiltersBar";
import { SuperadminJobDetailDrawer } from "../components/jobs/SuperadminJobDetailDrawer";
import { SuperadminJobsTable } from "../components/jobs/SuperadminJobsTable";
import { SuperadminRuntimeBadge } from "../components/runtime/SuperadminRuntimeBadge";
import { formatRuntimeCount } from "../components/runtime/utils";
import { useSuperadminJobDetail } from "../hooks/useSuperadminJobDetail";
import { useSuperadminJobsList } from "../hooks/useSuperadminJobsList";
import { useSuperadminJobsQueryState } from "../hooks/useSuperadminJobsQueryState";

export function SuperadminJobsPage() {
  const {
    query,
    searchDraft,
    setSearchDraft,
    activeFilterCount,
    pageSizeOptions,
    setPage,
    setLimit,
    setStatus,
    setEnabled,
    setSort,
    openJob,
    closeJob,
    clearFilters,
  } = useSuperadminJobsQueryState();

  const listState = useSuperadminJobsList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    status: query.status,
    enabled: query.enabled,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminJobDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Runtime job visibility"
            title="Jobs"
            description="Review scheduler status and job execution."
            actions={(
              <SuperadminRuntimeBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading jobs"
                  : `${formatRuntimeCount(listState.data?.total)} configured jobs`}
              </SuperadminRuntimeBadge>
            )}
          />
        )}
      >
        <SuperadminJobsFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onStatusChange={setStatus}
          onEnabledChange={setEnabled}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminJobsTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openJob}
        />
      </SuperadminPage>

      <SuperadminJobDetailDrawer
        jobName={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeJob}
        onRetry={detailState.refresh}
      />
    </>
  );
}
