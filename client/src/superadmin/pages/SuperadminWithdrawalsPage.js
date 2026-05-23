import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminWithdrawalDetailDrawer } from "../components/withdrawals/SuperadminWithdrawalDetailDrawer";
import { SuperadminWithdrawalsBadge } from "../components/withdrawals/SuperadminWithdrawalsBadge";
import { SuperadminWithdrawalsFiltersBar } from "../components/withdrawals/SuperadminWithdrawalsFiltersBar";
import { SuperadminWithdrawalsTable } from "../components/withdrawals/SuperadminWithdrawalsTable";
import { formatWithdrawalCount } from "../components/withdrawals/utils";
import { useSuperadminWithdrawalDetail } from "../hooks/useSuperadminWithdrawalDetail";
import { useSuperadminWithdrawalsList } from "../hooks/useSuperadminWithdrawalsList";
import { useSuperadminWithdrawalsQueryState } from "../hooks/useSuperadminWithdrawalsQueryState";

export function SuperadminWithdrawalsPage() {
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
    openWithdrawal,
    closeWithdrawal,
    clearFilters,
  } = useSuperadminWithdrawalsQueryState();

  const listState = useSuperadminWithdrawalsList({
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
  const detailState = useSuperadminWithdrawalDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Outbound operations"
            title="Withdrawals"
            description="Review withdrawal requests and processing status."
            actions={(
              <SuperadminWithdrawalsBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading withdrawals"
                  : `${formatWithdrawalCount(listState.data?.total)} total`}
              </SuperadminWithdrawalsBadge>
            )}
          />
        )}
      >
        <SuperadminWithdrawalsFiltersBar
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

        <SuperadminWithdrawalsTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openWithdrawal}
        />
      </SuperadminPage>

      <SuperadminWithdrawalDetailDrawer
        withdrawalId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeWithdrawal}
        onRetry={detailState.refresh}
      />
    </>
  );
}
