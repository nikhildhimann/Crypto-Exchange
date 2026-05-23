import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminSessionDetailDrawer } from "../components/sessions/SuperadminSessionDetailDrawer";
import { SuperadminSessionsBadge } from "../components/sessions/SuperadminSessionsBadge";
import { SuperadminSessionsFiltersBar } from "../components/sessions/SuperadminSessionsFiltersBar";
import { SuperadminSessionsTable } from "../components/sessions/SuperadminSessionsTable";
import { formatSessionCount } from "../components/sessions/utils";
import { useSuperadminSessionDetail } from "../hooks/useSuperadminSessionDetail";
import { useSuperadminSessionsList } from "../hooks/useSuperadminSessionsList";
import { useSuperadminSessionsQueryState } from "../hooks/useSuperadminSessionsQueryState";

export function SuperadminSessionsPage() {
  const {
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
    setPage,
    setLimit,
    setScope,
    setStatus,
    setCreatedFrom,
    setCreatedTo,
    setLastUsedFrom,
    setLastUsedTo,
    setSort,
    applyUserIdFilter,
    clearUserIdFilter,
    applyPlatformFilter,
    clearPlatformFilter,
    applyDeviceIdFilter,
    clearDeviceIdFilter,
    openSession,
    closeSession,
    clearFilters,
  } = useSuperadminSessionsQueryState();

  const listState = useSuperadminSessionsList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    scope: query.scope,
    userId: query.userId,
    status: query.status,
    platform: query.platform,
    deviceId: query.deviceId,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    lastUsedFrom: query.lastUsedFrom,
    lastUsedTo: query.lastUsedTo,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminSessionDetail(query.selected, query.selectedScope);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Security operations"
            title="Sessions"
            description="Review user and superadmin session activity."
            actions={(
              <SuperadminSessionsBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading sessions"
                  : `${formatSessionCount(listState.data?.total)} total sessions`}
              </SuperadminSessionsBadge>
            )}
          />
        )}
      >
        <SuperadminSessionsFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          userIdDraft={userIdDraft}
          setUserIdDraft={setUserIdDraft}
          platformDraft={platformDraft}
          setPlatformDraft={setPlatformDraft}
          deviceIdDraft={deviceIdDraft}
          setDeviceIdDraft={setDeviceIdDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onApplyUserIdFilter={applyUserIdFilter}
          onClearUserIdFilter={clearUserIdFilter}
          onApplyPlatformFilter={applyPlatformFilter}
          onClearPlatformFilter={clearPlatformFilter}
          onApplyDeviceIdFilter={applyDeviceIdFilter}
          onClearDeviceIdFilter={clearDeviceIdFilter}
          onScopeChange={setScope}
          onStatusChange={setStatus}
          onCreatedFromChange={setCreatedFrom}
          onCreatedToChange={setCreatedTo}
          onLastUsedFromChange={setLastUsedFrom}
          onLastUsedToChange={setLastUsedTo}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminSessionsTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openSession}
        />
      </SuperadminPage>

      <SuperadminSessionDetailDrawer
        sessionId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeSession}
        onRetry={detailState.refresh}
      />
    </>
  );
}
