export function NftPaginationControls({
  page = 1,
  totalPages = 1,
  hasMore = false,
  onPrevious,
  onNext,
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-1">
      <button
        type="button"
        onClick={onPrevious}
        disabled={page <= 1}
        className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
      >
        Previous
      </button>
      <p className="text-xs font-medium text-slate-500">
        {page} / {totalPages}
      </p>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasMore && page >= totalPages}
        className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
      >
        Next
      </button>
    </div>
  );
}
