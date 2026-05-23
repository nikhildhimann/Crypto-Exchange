import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminWalletDetailDrawer } from "../components/wallets/SuperadminWalletDetailDrawer";
import { SuperadminWalletsBadge } from "../components/wallets/SuperadminWalletsBadge";
import { SuperadminWalletsFiltersBar } from "../components/wallets/SuperadminWalletsFiltersBar";
import { SuperadminWalletsTable } from "../components/wallets/SuperadminWalletsTable";
import { formatWalletCount } from "../components/wallets/utils";
import { useSuperadminWalletDetail } from "../hooks/useSuperadminWalletDetail";
import { useSuperadminWalletsList } from "../hooks/useSuperadminWalletsList";
import { useSuperadminWalletsQueryState } from "../hooks/useSuperadminWalletsQueryState";

export function SuperadminWalletsPage() {
  const {
    query,
    searchDraft,
    setSearchDraft,
    userIdDraft,
    setUserIdDraft,
    accountIdDraft,
    setAccountIdDraft,
    activeFilterCount,
    pageSizeOptions,
    setPage,
    setLimit,
    setChain,
    setNetwork,
    setSourceType,
    setHidden,
    setArchived,
    setCreatedFrom,
    setCreatedTo,
    setSort,
    applyUserIdFilter,
    clearUserIdFilter,
    applyAccountIdFilter,
    clearAccountIdFilter,
    openWallet,
    closeWallet,
    clearFilters,
  } = useSuperadminWalletsQueryState();

  const listState = useSuperadminWalletsList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    userId: query.userId,
    accountId: query.accountId,
    chain: query.chain,
    network: query.network,
    sourceType: query.sourceType,
    hidden: query.hidden,
    archived: query.archived,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminWalletDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Wallet operations"
            title="Wallets"
            description="Review wallet inventory and ownership context."
            actions={(
              <SuperadminWalletsBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading wallets"
                  : `${formatWalletCount(listState.data?.total)} total wallets`}
              </SuperadminWalletsBadge>
            )}
          />
        )}
      >
        <SuperadminWalletsFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          userIdDraft={userIdDraft}
          setUserIdDraft={setUserIdDraft}
          accountIdDraft={accountIdDraft}
          setAccountIdDraft={setAccountIdDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onApplyUserIdFilter={applyUserIdFilter}
          onClearUserIdFilter={clearUserIdFilter}
          onApplyAccountIdFilter={applyAccountIdFilter}
          onClearAccountIdFilter={clearAccountIdFilter}
          onChainChange={setChain}
          onNetworkChange={setNetwork}
          onSourceTypeChange={setSourceType}
          onHiddenChange={setHidden}
          onArchivedChange={setArchived}
          onCreatedFromChange={setCreatedFrom}
          onCreatedToChange={setCreatedTo}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminWalletsTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openWallet}
        />
      </SuperadminPage>

      <SuperadminWalletDetailDrawer
        walletId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeWallet}
        onRetry={detailState.refresh}
      />
    </>
  );
}
