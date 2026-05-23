import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminRuntimeBadge } from "../components/runtime/SuperadminRuntimeBadge";
import { formatRuntimeCount } from "../components/runtime/utils";
import { SuperadminTreasuryDetailDrawer } from "../components/treasury/SuperadminTreasuryDetailDrawer";
import { SuperadminTreasuryFiltersBar } from "../components/treasury/SuperadminTreasuryFiltersBar";
import { SuperadminTreasuryTable } from "../components/treasury/SuperadminTreasuryTable";
import { useSuperadminTreasuryDetail } from "../hooks/useSuperadminTreasuryDetail";
import { useSuperadminTreasuryList } from "../hooks/useSuperadminTreasuryList";
import { useSuperadminTreasuryQueryState } from "../hooks/useSuperadminTreasuryQueryState";

export function SuperadminTreasuryPage() {
  const {
    query,
    searchDraft,
    setSearchDraft,
    activeFilterCount,
    pageSizeOptions,
    setPage,
    setLimit,
    setChain,
    setAsset,
    setWalletType,
    setStatus,
    setSort,
    openTreasuryWallet,
    closeTreasuryWallet,
    clearFilters,
  } = useSuperadminTreasuryQueryState();

  const listState = useSuperadminTreasuryList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    chain: query.chain,
    asset: query.asset,
    walletType: query.walletType,
    status: query.status,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminTreasuryDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Runtime treasury visibility"
            title="Treasury"
            description="Review treasury balances and reserve wallets."
            actions={(
              <SuperadminRuntimeBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading treasury"
                  : `${formatRuntimeCount(listState.data?.total)} reserve wallets`}
              </SuperadminRuntimeBadge>
            )}
          />
        )}
      >
        <SuperadminTreasuryFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onChainChange={setChain}
          onAssetChange={setAsset}
          onWalletTypeChange={setWalletType}
          onStatusChange={setStatus}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminTreasuryTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openTreasuryWallet}
        />
      </SuperadminPage>

      <SuperadminTreasuryDetailDrawer
        treasuryId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeTreasuryWallet}
        onRetry={detailState.refresh}
      />
    </>
  );
}
