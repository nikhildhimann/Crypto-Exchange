import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminAuditBadge } from "../components/audit/SuperadminAuditBadge";
import { SuperadminAuditDetailDrawer } from "../components/audit/SuperadminAuditDetailDrawer";
import { SuperadminAuditFiltersBar } from "../components/audit/SuperadminAuditFiltersBar";
import { SuperadminAuditTable } from "../components/audit/SuperadminAuditTable";
import { formatAuditCount } from "../components/audit/utils";
import { useSuperadminAuditDetail } from "../hooks/useSuperadminAuditDetail";
import { useSuperadminAuditList } from "../hooks/useSuperadminAuditList";
import { useSuperadminAuditQueryState } from "../hooks/useSuperadminAuditQueryState";

export function SuperadminAuditPage() {
  const {
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
    setPage,
    setLimit,
    setStatus,
    setCreatedFrom,
    setCreatedTo,
    setSort,
    applyUserIdFilter,
    clearUserIdFilter,
    applyActionFilter,
    clearActionFilter,
    applyResourceFilter,
    clearResourceFilter,
    openAuditEvent,
    closeAuditEvent,
    clearFilters,
  } = useSuperadminAuditQueryState();

  const listState = useSuperadminAuditList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    userId: query.userId,
    action: query.action,
    resource: query.resource,
    status: query.status,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminAuditDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Security investigations"
            title="Audit Logs"
            description="Review audit events and operator activity."
            actions={(
              <SuperadminAuditBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading audit events"
                  : `${formatAuditCount(listState.data?.total)} total audit events`}
              </SuperadminAuditBadge>
            )}
          />
        )}
      >
        <SuperadminAuditFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          userIdDraft={userIdDraft}
          setUserIdDraft={setUserIdDraft}
          actionDraft={actionDraft}
          setActionDraft={setActionDraft}
          resourceDraft={resourceDraft}
          setResourceDraft={setResourceDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onApplyUserIdFilter={applyUserIdFilter}
          onClearUserIdFilter={clearUserIdFilter}
          onApplyActionFilter={applyActionFilter}
          onClearActionFilter={clearActionFilter}
          onApplyResourceFilter={applyResourceFilter}
          onClearResourceFilter={clearResourceFilter}
          onStatusChange={setStatus}
          onCreatedFromChange={setCreatedFrom}
          onCreatedToChange={setCreatedTo}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminAuditTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openAuditEvent}
        />
      </SuperadminPage>

      <SuperadminAuditDetailDrawer
        auditId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeAuditEvent}
        onRetry={detailState.refresh}
      />
    </>
  );
}
