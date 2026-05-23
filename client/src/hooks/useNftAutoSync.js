import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { fetchNftSyncStatus } from "@/api/nft";
import { setSyncStatus } from "@/store/nftSlice";
import { runtimeConfig } from "@/lib/runtimeConfig";

const ACTIVE_SYNC_STATUSES = new Set([
  "queued",
  "pending",
  "scheduled",
  "syncing",
  "processing",
  "running",
]);

function isActiveSyncState(sync) {
  const status = String(sync?.status || sync?.syncStatus || "").trim().toLowerCase();
  return ACTIVE_SYNC_STATUSES.has(status);
}

export function useNftAutoSync({
  enabled = false,
  walletId = "",
  sync = null,
  syncing = false,
  refreshPending = false,
  pollSyncStatus = fetchNftSyncStatus,
  onSyncStatus,
}) {
  const dispatch = useDispatch();
  const shouldPoll = enabled && walletId && (syncing || refreshPending || isActiveSyncState(sync));

  useEffect(() => {
    if (!shouldPoll) return;

    let isMounted = true;

    const pollStatus = async () => {
      try {
        const res = await pollSyncStatus({ walletId });
        const payload = res?.data || res || null;

        if (isMounted && payload) {
          dispatch(setSyncStatus(payload));
          if (typeof onSyncStatus === "function") {
            onSyncStatus(payload);
          }
        }
      } catch (err) {
        console.error("Sync status polling failed", err);
      }
    };

    pollStatus();

    const interval = setInterval(
      pollStatus,
      runtimeConfig.nftSyncStatusPollIntervalMs,
    );

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [dispatch, onSyncStatus, pollSyncStatus, shouldPoll, walletId]);

  return {
    // Return empty methods to avoid breaking consuming components if they expect them
    scheduleNftAutoSync: () => {},
    runNftAutoSyncNow: () => {},
    shouldSyncNow: false,
  };
}

export default useNftAutoSync;
