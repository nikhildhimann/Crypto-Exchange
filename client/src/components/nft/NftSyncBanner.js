export function getNftSyncMessage(sync = {}) {
  const status = String(sync?.status || "idle").trim().toLowerCase();

  if (status === "pending") {
    return "NFT indexing is starting.";
  }

  if (status === "syncing") {
    return "Refreshing NFT data...";
  }

  if (status === "stale") {
    return "Refresh recommended";
  }

  return "";
}

export function NftSyncBanner({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="flex justify-center">
      <div className="rounded-full border border-amber-400/15 bg-amber-400/10 px-3 py-1.5">
        <p className="text-[11px] font-semibold text-amber-200">{message}</p>
      </div>
    </div>
  );
}
