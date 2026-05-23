import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminAccountDetailDrawer } from "../components/accounts/SuperadminAccountDetailDrawer";
import { SuperadminAccountsBadge } from "../components/accounts/SuperadminAccountsBadge";
import { SuperadminAccountsFiltersBar } from "../components/accounts/SuperadminAccountsFiltersBar";
import { SuperadminAccountsTable } from "../components/accounts/SuperadminAccountsTable";
import { formatAccountCount } from "../components/accounts/utils";
import { useSuperadminAccountDetail } from "../hooks/useSuperadminAccountDetail";
import { useSuperadminAccountsList } from "../hooks/useSuperadminAccountsList";
import { useSuperadminAccountsQueryState } from "../hooks/useSuperadminAccountsQueryState";

export function SuperadminAccountsPage() {
  const {
    query,
    searchDraft,
    setSearchDraft,
    userIdDraft,
    setUserIdDraft,
    activeFilterCount,
    pageSizeOptions,
    setPage,
    setLimit,
    setStatus,
    setType,
    setCreatedFrom,
    setCreatedTo,
    setSort,
    applyUserIdFilter,
    clearUserIdFilter,
    openAccount,
    closeAccount,
    clearFilters,
  } = useSuperadminAccountsQueryState();

  const listState = useSuperadminAccountsList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    userId: query.userId,
    status: query.status,
    type: query.type,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminAccountDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Account operations"
            title="Accounts"
            description="Review account inventory and linked activity."
            actions={(
              <SuperadminAccountsBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading accounts"
                  : `${formatAccountCount(listState.data?.total)} total accounts`}
              </SuperadminAccountsBadge>
            )}
          />
        )}
      >
        <SuperadminAccountsFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          userIdDraft={userIdDraft}
          setUserIdDraft={setUserIdDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onApplyUserIdFilter={applyUserIdFilter}
          onClearUserIdFilter={clearUserIdFilter}
          onStatusChange={setStatus}
          onTypeChange={setType}
          onCreatedFromChange={setCreatedFrom}
          onCreatedToChange={setCreatedTo}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminAccountsTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openAccount}
        />
      </SuperadminPage>

      <SuperadminAccountDetailDrawer
        accountId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeAccount}
        onRetry={detailState.refresh}
      />
    </>
  );
}
