import { ChevronLeft } from "lucide-react";

import { getNftStandardLabel } from "./display";

export function NftCollectionHeaderCard({
  collection,
  totalItems = 0,
  onBack,
  children = null,
}) {
  if (!collection) {
    return null;
  }

  const standardSummary =
    Array.isArray(collection.standards) && collection.standards.length > 0
      ? collection.standards.map((standard) => getNftStandardLabel(standard)).join(" • ")
      : collection.standard
        ? getNftStandardLabel(collection.standard)
        : "";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
      {collection.bannerUrl ? (
        <div className="h-28 w-full bg-slate-800 overflow-hidden">
          <img
            src={collection.bannerUrl}
            alt={collection.name || collection.collectionName || "Collection banner"}
            className="w-full h-full object-cover"
          />
        </div>
      ) : null}
      <div className="p-5 flex items-start gap-4">
        {collection.logoUrl || collection.previewImageUrl ? (
          <img
            src={collection.logoUrl || collection.previewImageUrl}
            alt={collection.name || collection.collectionName || "Collection"}
            className="w-16 h-16 rounded-2xl object-cover bg-slate-800 shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-slate-800 shrink-0 flex items-center justify-center text-slate-500 font-black">
            {(collection.symbol || collection.name || "C").charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={14} />
              <span>Back to all NFTs</span>
            </button>
            <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
              {totalItems} items
            </span>
          </div>

          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white truncate">
              {collection.name || collection.collectionName || "Collection"}
            </h3>
            <p className="text-xs text-slate-400 truncate">
              {collection.contractAddress || "-"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {standardSummary ? (
              <span className="px-2 py-1 rounded-full bg-slate-950 border border-slate-800 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                {standardSummary}
              </span>
            ) : null}
          </div>

          {collection.description ? (
            <p className="text-sm text-slate-300 line-clamp-2">{collection.description}</p>
          ) : null}
        </div>
      </div>

      {children ? <div className="border-t border-slate-800 p-4">{children}</div> : null}
    </div>
  );
}
