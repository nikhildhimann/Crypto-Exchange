import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  ImageOff,
  MoreVertical,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { NftTransferModal } from "./NftTransferModal";
import { NftListForSaleModal } from "./NftListForSaleModal";
import { getChainMeta } from "../../config/chains";
import { useAppContext } from "../../contexts/AppContext";
import { getErrorMessage } from "../../lib/errorMessage";
import {
  getNftQuantityLabel,
  getNftStandardLabel,
  getNftTransferSupportMessage,
  isNftTransferSupportedInUi,
} from "./display";

function resolveNftTitle(nft) {
  if (!nft) return "NFT";
  if (nft.name) return nft.name;
  if (nft.tokenId) return `Token #${nft.tokenId}`;
  return "NFT";
}

function truncateMiddle(value = "", prefixLength = 6, suffixLength = 4) {
  const normalized = String(value || "").trim();
  if (normalized.length <= prefixLength + suffixLength + 3) return normalized;
  return `${normalized.slice(0, prefixLength)}...${normalized.slice(-suffixLength)}`;
}

function DetailRow({ label, value, copyValue }) {
  const displayValue = value || "-";

  function handleCopy() {
    if (!copyValue) return;
    navigator.clipboard.writeText(copyValue).then(
      () => toast.success(`${label} copied`),
      () => null,
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <p className="text-sm font-semibold text-slate-400">{label}</p>
      <div className="flex min-w-0 items-center gap-2 text-right">
        <p className="truncate text-sm font-semibold text-white">
          {displayValue}
        </p>
        {copyValue ? (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-indigo-300 transition-colors hover:bg-slate-900 hover:text-indigo-200"
            aria-label={`Copy ${label}`}
          >
            <Copy size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function NftDetailModal({
  open,
  nft,
  loading = false,
  error = null,
  onClose,
  onRetry,
}) {
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const {
    setNftHidden,
    refreshNfts,
    refreshNftCollections,
    fetchNftCollectionDetail,
    nftVisibilityLoadingByNftId,
    nftVisibilityErrorByNftId,
  } = useAppContext();

  useEffect(() => {
    if (!open) {
      setTransferModalOpen(false);
      setListModalOpen(false);
      setShowMoreActions(false);
    }
  }, [open]);

  useEffect(() => {
    setTransferModalOpen(false);
    setListModalOpen(false);
    setShowMoreActions(false);
  }, [nft?.id]);

  if (!open) {
    return null;
  }

  const imageUrl =
    nft?.imageOriginalUrl || nft?.imageUrl || nft?.thumbnailUrl || "";
  const title = resolveNftTitle(nft);
  const collectionName = nft?.collectionName || nft?.collection || "";
  const description = String(nft?.description || "").trim();
  const standardLabel = getNftStandardLabel(nft?.standard);
  const quantityLabel = getNftQuantityLabel(nft);
  const chainMeta = getChainMeta(nft?.chain || "polygon");
  const chainIcon = chainMeta?.icon || "";
  const chainLabel = chainMeta?.label || chainMeta?.name || "Network";
  const backendNftId = String(
    nft?.backendId || nft?._id || nft?.raw?._id || nft?.nftId || "",
  ).trim();
  const visibilityLoading = Boolean(
    nftVisibilityLoadingByNftId?.[backendNftId],
  );
  const visibilityError = nftVisibilityErrorByNftId?.[backendNftId] || "";
  const nextHiddenValue = !Boolean(nft?.isHidden);
  const hideActionLabel = nft?.isHidden ? "Unhide NFT" : "Hide NFT";
  const canTransfer =
    Boolean(nft?.walletId && (nft?.id || nft?._id)) &&
    isNftTransferSupportedInUi(nft);
  const transferSupportMessage = getNftTransferSupportMessage(nft);

  async function handleToggleHidden() {
    if (!backendNftId || !nft?.walletId) return;

    try {
      await setNftHidden({
        nftId: backendNftId,
        hidden: nextHiddenValue,
      });

      toast.success(nextHiddenValue ? "NFT hidden" : "NFT unhidden");

      await Promise.allSettled([
        refreshNfts({
          walletId: nft.walletId,
          chain: nft.chain,
        }),
        refreshNftCollections({
          walletId: nft.walletId,
          chain: nft.chain,
        }),
        nft.contractAddress
          ? fetchNftCollectionDetail({
              walletId: nft.walletId,
              chain: nft.chain,
              contractAddress: nft.contractAddress,
            })
          : Promise.resolve(null),
      ]);
    } catch (requestError) {
      toast.error(
        getErrorMessage(requestError, "Failed to update NFT visibility"),
      );
    }
  }

  return (
    <div className="aura-container fixed inset-0 z-[70] mx-auto h-[100dvh] w-full max-w-md">
      <section className="sticky top-0 z-50">
        <div className="aura-header px-5 pt-4 pb-3">
          <button
            onClick={onClose}
            className="aura-header-button group"
            type="button"
          >
            <ArrowLeft
              size={20}
              className="transition-transform group-hover:-translate-x-0.5"
            />
          </button>
          <h1 className="aura-header-title">NFT</h1>
          <button
            type="button"
            onClick={() => setShowMoreActions((current) => !current)}
            className="aura-header-button"
            aria-label="NFT actions"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </section>

      <div className="px-6 pb-32 pt-5">
        {loading ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw size={24} className="animate-spin text-indigo-400" />
            <p className="text-sm font-medium">Loading NFT...</p>
          </div>
        ) : error ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
              <p className="text-base font-semibold text-white">
                Unable to load NFT
              </p>
              <p className="mt-2 text-sm text-rose-200">{error}</p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-full border border-indigo-500 bg-indigo-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        ) : nft ? (
          <div className="mx-auto flex max-w-[360px] flex-col min-h-[calc(100dvh-160px)]">
            <div className="flex justify-center">
              <div className="relative aspect-square w-[54%] min-w-[142px] max-w-[190px] overflow-hidden rounded-2xl bg-slate-900">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={title}
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "/images/nft-placeholder.png";
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-500">
                    <ImageOff size={28} />
                    <p className="text-xs font-medium">Image unavailable</p>
                  </div>
                )}

                <span
                  className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-950 bg-slate-950 shadow-lg"
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
                      {String(chainMeta?.symbol || "?").slice(0, 3)}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-semibold leading-tight text-white">
                {title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-400">
                {collectionName ? <span>{collectionName}</span> : null}
                {description ? (
                  <>
                    {collectionName ? (
                      <span className="text-slate-600">·</span>
                    ) : null}
                    <span className="line-clamp-1">{description}</span>
                  </>
                ) : null}
              </div>
              {quantityLabel ? (
                <div className="mt-3 inline-flex rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-300">
                  {quantityLabel}
                </div>
              ) : null}
            </div>

            <div className="mt-8 divide-y divide-slate-800/80">
              <DetailRow
                label="Contract address"
                value={truncateMiddle(nft.contractAddress, 6, 4)}
                copyValue={nft.contractAddress}
              />
              <DetailRow
                label="Token ID"
                value={nft.tokenId || "-"}
                copyValue={nft.tokenId}
              />
              <DetailRow label="Token standard" value={standardLabel} />
            </div>

            {showMoreActions ? (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
                {visibilityError ? (
                  <p className="mb-3 text-xs font-semibold text-rose-300">
                    {visibilityError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={handleToggleHidden}
                  disabled={visibilityLoading || !backendNftId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
                >
                  {nextHiddenValue ? <EyeOff size={16} /> : <Eye size={16} />}
                  {visibilityLoading ? "Updating..." : hideActionLabel}
                </button>
              </div>
            ) : null}

            <div className="mt-auto pt-8 space-y-3">
              {transferSupportMessage && !canTransfer ? (
                <p className="mb-3 text-center text-xs font-medium text-slate-500">
                  {transferSupportMessage}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setTransferModalOpen(true)}
                disabled={!canTransfer}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                <Send size={17} />
                Send
              </button>

              {canTransfer && nft?.chain === "polygon" && (
                <button
                  type="button"
                  onClick={() => setListModalOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  <RefreshCw size={17} className="text-indigo-400" />
                  List for Sale
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <NftTransferModal
        open={transferModalOpen}
        nft={nft}
        onClose={() => setTransferModalOpen(false)}
        onCompleted={() => {
          setTransferModalOpen(false);
          onClose?.();
        }}
      />
      <NftListForSaleModal
        open={listModalOpen}
        nft={nft}
        walletId={nft?.walletId}
        onClose={() => setListModalOpen(false)}
        onCompleted={() => {
          setListModalOpen(false);
          onClose?.();
        }}
      />
    </div>
  );
}

export default NftDetailModal;
