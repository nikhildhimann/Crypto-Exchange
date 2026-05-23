import { RefreshCw } from "lucide-react";
import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminTransactionDetailDrawer } from "../components/transactions/SuperadminTransactionDetailDrawer";
import { SuperadminTransactionsBadge } from "../components/transactions/SuperadminTransactionsBadge";
import { SuperadminTransactionsFiltersBar } from "../components/transactions/SuperadminTransactionsFiltersBar";
import { SuperadminTransactionsTable } from "../components/transactions/SuperadminTransactionsTable";
import { formatTransactionCount } from "../components/transactions/utils";
import { useSuperadminTransactionDetail } from "../hooks/useSuperadminTransactionDetail";
import { useSuperadminTransactionsList } from "../hooks/useSuperadminTransactionsList";
import { useSuperadminTransactionsQueryState } from "../hooks/useSuperadminTransactionsQueryState";

export function SuperadminTransactionsPage() {
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
    setNetwork,
    setAsset,
    setStatus,
    setDirection,
    setTransactionType,
    setCreatedFrom,
    setCreatedTo,
    setChainTimestampFrom,
    setChainTimestampTo,
    setSort,
    applyUserIdFilter,
    clearUserIdFilter,
    applyAccountIdFilter,
    clearAccountIdFilter,
    applyWalletIdFilter,
    clearWalletIdFilter,
    openTransaction,
    closeTransaction,
    clearFilters,
  } = useSuperadminTransactionsQueryState();

  const listState = useSuperadminTransactionsList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    userId: query.userId,
    accountId: query.accountId,
    walletId: query.walletId,
    chain: query.chain,
    network: query.network,
    asset: query.asset,
    status: query.status,
    direction: query.direction,
    transactionType: query.transactionType,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    chainTimestampFrom: query.chainTimestampFrom,
    chainTimestampTo: query.chainTimestampTo,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminTransactionDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Transaction operations"
            title="Transactions"
            description="Review transaction activity across the platform."
            actions={(
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={listState.refresh}
                  disabled={listState.loading}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${listState.loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <SuperadminTransactionsBadge tone="cyan">
                  {listState.loading && !listState.data
                    ? "Updating"
                    : `${formatTransactionCount(listState.data?.total)} total transactions`}
                </SuperadminTransactionsBadge>
              </div>
            )}
          />
        )}
      >
        <SuperadminTransactionsFiltersBar
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
          onNetworkChange={setNetwork}
          onAssetChange={setAsset}
          onStatusChange={setStatus}
          onDirectionChange={setDirection}
          onTransactionTypeChange={setTransactionType}
          onCreatedFromChange={setCreatedFrom}
          onCreatedToChange={setCreatedTo}
          onChainTimestampFromChange={setChainTimestampFrom}
          onChainTimestampToChange={setChainTimestampTo}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminTransactionsTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openTransaction}
        />
      </SuperadminPage>

      <SuperadminTransactionDetailDrawer
        transactionId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeTransaction}
        onRetry={detailState.refresh}
      />
    </>
  );
}
