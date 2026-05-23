import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminDepositDetailDrawer } from "../components/deposits/SuperadminDepositDetailDrawer";
import { SuperadminDepositsBadge } from "../components/deposits/SuperadminDepositsBadge";
import { SuperadminDepositsFiltersBar } from "../components/deposits/SuperadminDepositsFiltersBar";
import { SuperadminDepositsTable } from "../components/deposits/SuperadminDepositsTable";
import { formatDepositCount } from "../components/deposits/utils";
import { useSuperadminDepositDetail } from "../hooks/useSuperadminDepositDetail";
import { useSuperadminDepositsList } from "../hooks/useSuperadminDepositsList";
import { useSuperadminDepositsQueryState } from "../hooks/useSuperadminDepositsQueryState";

export function SuperadminDepositsPage() {
  const {
    query,
    searchDraft,
    setSearchDraft,
    userIdDraft,
    setUserIdDraft,
    accountIdDraft,
    setAccountIdDraft,
    walletIdDraft,
    setWalletIdDraft,
    activeFilterCount,
    pageSizeOptions,
    setPage,
    setLimit,
    setChain,
    setAsset,
    setStatus,
    setCreatedFrom,
    setCreatedTo,
    setSort,
    applyUserIdFilter,
    clearUserIdFilter,
    applyAccountIdFilter,
    clearAccountIdFilter,
    applyWalletIdFilter,
    clearWalletIdFilter,
    openDeposit,
    closeDeposit,
    clearFilters,
  } = useSuperadminDepositsQueryState();

  const listState = useSuperadminDepositsList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    userId: query.userId,
    accountId: query.accountId,
    walletId: query.walletId,
    chain: query.chain,
    asset: query.asset,
    status: query.status,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminDepositDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Deposit operations"
            title="Deposits"
            description="Review deposit activity and confirmation status."
            actions={(
              <SuperadminDepositsBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading deposits"
                  : `${formatDepositCount(listState.data?.total)} total deposits`}
              </SuperadminDepositsBadge>
            )}
          />
        )}
      >
        <SuperadminDepositsFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          userIdDraft={userIdDraft}
          setUserIdDraft={setUserIdDraft}
          accountIdDraft={accountIdDraft}
          setAccountIdDraft={setAccountIdDraft}
          walletIdDraft={walletIdDraft}
          setWalletIdDraft={setWalletIdDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onApplyUserIdFilter={applyUserIdFilter}
          onClearUserIdFilter={clearUserIdFilter}
          onApplyAccountIdFilter={applyAccountIdFilter}
          onClearAccountIdFilter={clearAccountIdFilter}
          onApplyWalletIdFilter={applyWalletIdFilter}
          onClearWalletIdFilter={clearWalletIdFilter}
          onChainChange={setChain}
          onAssetChange={setAsset}
          onStatusChange={setStatus}
          onCreatedFromChange={setCreatedFrom}
          onCreatedToChange={setCreatedTo}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminDepositsTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openDeposit}
        />
      </SuperadminPage>

      <SuperadminDepositDetailDrawer
        depositId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeDeposit}
        onRetry={detailState.refresh}
      />
    </>
  );
}
