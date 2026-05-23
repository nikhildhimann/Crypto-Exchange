import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminUserDetailDrawer } from "../components/users/SuperadminUserDetailDrawer";
import { SuperadminUsersBadge } from "../components/users/SuperadminUsersBadge";
import { SuperadminUsersFiltersBar } from "../components/users/SuperadminUsersFiltersBar";
import { SuperadminUsersTable } from "../components/users/SuperadminUsersTable";
import { formatUserCount } from "../components/users/utils";
import { useSuperadminUserDetail } from "../hooks/useSuperadminUserDetail";
import { useSuperadminUsersList } from "../hooks/useSuperadminUsersList";
import { useSuperadminUsersQueryState } from "../hooks/useSuperadminUsersQueryState";

export function SuperadminUsersPage() {
  const {
    query,
    searchDraft,
    setSearchDraft,
    activeFilterCount,
    pageSizeOptions,
    setPage,
    setLimit,
    setRole,
    setStatus,
    setCreatedFrom,
    setCreatedTo,
    setLastAccessFrom,
    setLastAccessTo,
    setSort,
    openUser,
    closeUser,
    clearFilters,
  } = useSuperadminUsersQueryState();

  const listState = useSuperadminUsersList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    role: query.role,
    status: query.status,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    lastAccessFrom: query.lastAccessFrom,
    lastAccessTo: query.lastAccessTo,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminUserDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Identity operations"
            title="Users"
            description="Review users, roles, and access activity."
            actions={(
              <SuperadminUsersBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading users"
                  : `${formatUserCount(listState.data?.total)} total users`}
              </SuperadminUsersBadge>
            )}
          />
        )}
      >
        <SuperadminUsersFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onRoleChange={setRole}
          onStatusChange={setStatus}
          onCreatedFromChange={setCreatedFrom}
          onCreatedToChange={setCreatedTo}
          onLastAccessFromChange={setLastAccessFrom}
          onLastAccessToChange={setLastAccessTo}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminUsersTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openUser}
        />
      </SuperadminPage>

      <SuperadminUserDetailDrawer
        userId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeUser}
        onRetry={detailState.refresh}
      />
    </>
  );
}
