import { SuperadminPage } from "../components/SuperadminPage";
import { SuperadminPageHeader } from "../components/SuperadminPageHeader";
import { SuperadminChainDetailDrawer } from "../components/chains/SuperadminChainDetailDrawer";
import { SuperadminChainsFiltersBar } from "../components/chains/SuperadminChainsFiltersBar";
import { SuperadminChainsTable } from "../components/chains/SuperadminChainsTable";
import { SuperadminRuntimeBadge } from "../components/runtime/SuperadminRuntimeBadge";
import { formatRuntimeCount } from "../components/runtime/utils";
import { useSuperadminChainDetail } from "../hooks/useSuperadminChainDetail";
import { useSuperadminChainsList } from "../hooks/useSuperadminChainsList";
import { useSuperadminChainsQueryState } from "../hooks/useSuperadminChainsQueryState";

export function SuperadminChainsPage() {
  const {
    query,
    searchDraft,
    setSearchDraft,
    activeFilterCount,
    pageSizeOptions,
    setPage,
    setLimit,
    setFamily,
    setStatus,
    setEnabled,
    setSort,
    openChain,
    closeChain,
    clearFilters,
  } = useSuperadminChainsQueryState();

  const listState = useSuperadminChainsList({
    page: query.page,
    limit: query.limit,
    search: query.search,
    family: query.family,
    status: query.status,
    enabled: query.enabled,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  const detailState = useSuperadminChainDetail(query.selected);

  return (
    <>
      <SuperadminPage
        header={(
          <SuperadminPageHeader
            eyebrow="Runtime chain visibility"
            title="Chains"
            description="Review configured chains and runtime status."
            actions={(
              <SuperadminRuntimeBadge tone="cyan">
                {listState.loading && !listState.data
                  ? "Loading chains"
                  : `${formatRuntimeCount(listState.data?.total)} configured chains`}
              </SuperadminRuntimeBadge>
            )}
          />
        )}
      >
        <SuperadminChainsFiltersBar
          query={query}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          activeFilterCount={activeFilterCount}
          pageSizeOptions={pageSizeOptions}
          onFamilyChange={setFamily}
          onStatusChange={setStatus}
          onEnabledChange={setEnabled}
          onLimitChange={setLimit}
          onSortChange={setSort}
          onClearFilters={clearFilters}
        />

        <SuperadminChainsTable
          state={listState}
          onRetry={listState.refresh}
          onPageChange={setPage}
          onView={openChain}
        />
      </SuperadminPage>

      <SuperadminChainDetailDrawer
        chainId={query.selected}
        state={detailState}
        open={Boolean(query.selected)}
        onClose={closeChain}
        onRetry={detailState.refresh}
      />
    </>
  );
}
