import { motion } from "motion/react";
import { getChainMeta } from "../../config/chains";
import { 
  getNftCollectionLabel, 
  getNftDisplayTitle, 
  getNftQuantityLabel, 
} from "./display";

export function NftCard({ nft, onOpen }) {
  const nftIdentity = String(nft?.id || nft?._id || nft?.backendId || nft?.nftId || "");
  const quantityLabel = getNftQuantityLabel(nft);
  const title = getNftDisplayTitle(nft);
  const collectionLabel = getNftCollectionLabel(nft);
  const showCollection = collectionLabel && collectionLabel !== "-";
  const chainMeta = getChainMeta(nft?.chain);
  const chainIcon = chainMeta?.icon || "";
  const chainLabel = chainMeta?.label || chainMeta?.name || nft?.chain || "Network";
  const chainSymbol = chainMeta?.symbol || chainMeta?.code || "";
  const price = nft?.price;

  return (
    <motion.button
      type="button"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      onClick={() => onOpen?.(nft)}
      disabled={!nftIdentity}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-transparent text-left transition-all duration-200 disabled:cursor-default"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.95)] transition-all duration-200 group-hover:border-white/20 group-hover:shadow-[0_18_40px_-24px_rgba(99,102,241,0.65)]">
        {nft?.imageUrl ? (
          <img
            src={nft.imageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = "/images/nft-placeholder.png";
            }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 text-slate-600">
            <div className="mb-2 h-10 w-10 rounded-full border border-dashed border-slate-700" />
            <span className="text-[10px] font-semibold">No preview</span>
          </div>
        )}

        {quantityLabel ? (
          <span className="absolute left-2.5 top-2.5 rounded-full border border-white/15 bg-slate-950/70 px-2 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur">
            {quantityLabel}
          </span>
        ) : null}

        {price ? (
          <span className="absolute left-2.5 bottom-2.5 rounded-full border border-indigo-500/30 bg-indigo-600 px-2.5 py-1 text-[10px] font-black text-white shadow-lg flex items-center gap-1">
            {price}
          </span>
        ) : null}

        <span
          className="absolute bottom-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-950 bg-slate-950 shadow-lg"
          title={chainLabel}
          aria-label={chainLabel}
        >
          {chainIcon ? (
            <img
              src={chainIcon}
              alt=""
              aria-hidden="true"
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span className="text-[8px] font-bold uppercase text-white">
              {String(chainSymbol || "?").slice(0, 3)}
            </span>
          )}
        </span>
      </div>

      <div className="min-w-0 px-1.5 pb-1 pt-2.5">
        <h4 className="line-clamp-1 text-[13px] font-semibold leading-5 text-white transition-colors group-hover:text-white">
          {title}
        </h4>
        {showCollection ? (
          <p className="line-clamp-1 text-[11px] font-medium leading-4 text-slate-500">
            {collectionLabel}
          </p>
        ) : null}
      </div>
    </motion.button>
  );
}
