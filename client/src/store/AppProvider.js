import { useEffect, useRef } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { toast } from "sonner";

import { fetchAccountsThunk } from "./accountSlice";
import { markBootstrapped, refreshSessionThunk } from "./authSlice";
import { configureApiClientSession } from "../api/client";
import { createNotificationStream } from "../api/notificationStream";
import { socket } from "../lib/socket";
import {
  BALANCE_FRESHNESS_MS,
  fetchWalletBalanceThunk,
  getVisibleWalletIdsFromState,
  getWalletIdsNeedingBalanceHydration,
  hasLoadedBalanceEntry,
  hydrateVisibleWalletBalancesThunk,
} from "./balanceSlice";
import { ensureSupportedChainsReady } from "./chainBootstrap";
import { resolveProvisioningTarget } from "../lib/walletProvisioning";
import { fetchNotificationsThunk } from "./notificationSlice";
import {
  fetchTransactionsThunk,
  normalizeTransaction,
  refreshWalletTransactionsThunk,
  requestHistoryRefresh as requestHistoryRefreshSignal,
  upsertLiveTransaction as upsertLiveTransactionSignal,
} from "./transactionSlice";
import { normalizeTransactionRecord } from "../api/adapters/transaction";
import { getChainMeta } from "../config/chains";
import { clearAppInactive, recordAppInactive, setLocalUnlockState } from "./unlockSlice";
import { fetchWalletsThunk, setActiveWalletId } from "./walletSlice";
import { logoutAndClearSession } from "./logoutHelper";
import { persistor, store } from "./index";
import { runtimeConfig } from "../lib/runtimeConfig";

const LIVE_BALANCE_FRESHNESS_MS = runtimeConfig.balanceRefreshIntervalMs;
const NOTIFICATION_FRESHNESS_MS = runtimeConfig.notificationRefreshIntervalMs;
const PENDING_SWAP_REFRESH_INTERVAL_MS = runtimeConfig.pendingSwapRefreshIntervalMs;

function normalizeComparableString(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isAdaChain(value = "") {
  return normalizeComparableString(value) === "ada";
}

function isAdaWalletPendingRecovery(wallet = {}) {
  return normalizeComparableString(wallet?.metadata?.provisioning?.status) === "pending_recovery";
}

function hasAutoLockExpired(lastInactiveAt, autoLockMinutes) {
  if (!lastInactiveAt) {
    return false;
  }

  const timeoutMs = Number(autoLockMinutes || 5) * 60 * 1000;
  return Date.now() - Number(lastInactiveAt) >= timeoutMs;
}

function isFreshEnough(lastFetchedAt, freshnessMs) {
  const timestamp = Number(lastFetchedAt || 0);

  return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp < freshnessMs;
}

async function fetchTransactionsForWalletIds(dispatch, walletIds = []) {
  const uniqueWalletIds = Array.from(new Set((walletIds || []).filter(Boolean)));

  if (!uniqueWalletIds.length) {
    return [];
  }

  const results = [];

  for (const walletId of uniqueWalletIds) {
    try {
      const value = await dispatch(fetchTransactionsThunk(walletId)).unwrap();
      results.push({ status: "fulfilled", value });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }

  return results;
}

function resolveActiveWalletId(state, wallets = []) {
  if (
    state.wallet.activeWalletId &&
    wallets.some((wallet) => wallet.walletId === state.wallet.activeWalletId)
  ) {
    return state.wallet.activeWalletId;
  }

  return wallets[0]?.walletId || "";
}

function resolveActiveBalanceWalletId(state) {
  const walletId = String(state.wallet.activeWalletId || "").trim();
  const walletItems = Array.isArray(state.wallet.items) ? state.wallet.items : [];

  if (walletId && walletItems.some((wallet) => wallet.walletId === walletId)) {
    return walletId;
  }

  return getVisibleWalletIdsFromState(state)[0] || "";
}

function hasLoadedTransactionEntry(entry, transactionStatus) {
  if (!Array.isArray(entry)) {
    return false;
  }

  if (entry.length > 0) {
    return true;
  }

  return transactionStatus !== "error";
}

function getWalletIdsNeedingTransactionHydration(state, walletIds = []) {
  const targetWalletIds = Array.from(new Set((walletIds || []).filter(Boolean)));

  return targetWalletIds.filter((walletId) => {
    const requestStatus =
      state?.transaction?.requestStatusByWalletId?.[walletId] || "idle";

    if (requestStatus === "loading") {
      return false;
    }

    const entry = state?.transaction?.byWalletId?.[walletId];
    const transactionStatus = state?.transaction?.status;
    const hasLoadedTransactions = hasLoadedTransactionEntry(entry, transactionStatus);
    const lastFetchedAt = state?.transaction?.lastFetchedAtByWalletId?.[walletId] || 0;

    return (
      !hasLoadedTransactions ||
      !isFreshEnough(lastFetchedAt, PENDING_SWAP_REFRESH_INTERVAL_MS)
    );
  });
}

function normalizeSwapStatus(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isPendingSwapStatus(value = "") {
  const normalizedStatus = normalizeSwapStatus(value);

  return Boolean(normalizedStatus) && ![
    "completed",
    "success",
    "failed",
    "payout_failed",
    "manual_review",
    "expired",
  ].includes(normalizedStatus);
}

function collectPendingSwapRefreshWalletIds(state) {
  const visibleWalletIds = getVisibleWalletIdsFromState(state);
  const byWalletId = state.transaction.byWalletId || {};
  const walletIds = new Set();

  for (const walletId of visibleWalletIds) {
    const transactions = Array.isArray(byWalletId[walletId]) ? byWalletId[walletId] : [];

    for (const transaction of transactions) {
      const swap =
        transaction?.metadata?.swap &&
        typeof transaction.metadata.swap === "object" &&
        !Array.isArray(transaction.metadata.swap)
          ? transaction.metadata.swap
          : null;

      if (
        !swap ||
        swap.role !== "source_transfer" ||
        !swap.swapId ||
        !isPendingSwapStatus(swap.status)
      ) {
        continue;
      }

      walletIds.add(String(transaction.walletId || walletId || "").trim());

      if (swap.toWalletId) {
        walletIds.add(String(swap.toWalletId).trim());
      }
    }
  }

  return Array.from(walletIds).filter(Boolean);
}

function getTransactionIdentity(transaction = {}) {
  return String(
    transaction?.id ||
      transaction?.transactionId ||
      transaction?._id ||
      transaction?.transactionHash ||
      transaction?.txHash ||
      "",
  ).trim();
}

function resolveNormalizedTransactionStatus(transaction = {}) {
  const tone = String(
    transaction?.statusTone || transaction?.displayStatus || transaction?.status || "pending",
  )
    .trim()
    .toLowerCase();

  if (tone === "success" || tone === "completed" || tone === "confirmed") {
    return "success";
  }

  if (tone === "failed" || tone === "error") {
    return "failed";
  }

  return "pending";
}

function resolveSocketTransactionWallet(state, transaction = {}) {
  const wallets = Array.isArray(state.wallet.items) ? state.wallet.items : [];
  const walletId = String(transaction?.walletId || "").trim();
  const chain = normalizeComparableString(transaction?.chain);
  const network = normalizeComparableString(transaction?.network);
  const fromAddress = normalizeComparableString(transaction?.fromAddress);
  const toAddress = normalizeComparableString(transaction?.toAddress);

  if (walletId) {
    const directWallet = wallets.find((wallet) => wallet.walletId === walletId) || null;
    if (directWallet) {
      return directWallet;
    }
  }

  return (
    wallets.find((wallet) => {
      const walletChain = normalizeComparableString(wallet?.chain);
      const walletNetwork = normalizeComparableString(wallet?.network);
      const walletAddress = normalizeComparableString(wallet?.address);

      return (
        (!chain || walletChain === chain) &&
        (!network || walletNetwork === network) &&
        walletAddress &&
        (walletAddress === fromAddress || walletAddress === toAddress)
      );
    }) || null
  );
}

function normalizeSocketTransactionPayload(state, payload = {}) {
  const transactionRecord = normalizeTransactionRecord(payload);
  const wallet = resolveSocketTransactionWallet(state, transactionRecord);
  const supportedChains = state.chain.supported || [];
  const balance = wallet ? state.balance.byWalletId?.[wallet.walletId] || null : null;
  const chainMeta = getChainMeta(wallet?.chain || transactionRecord.chain, supportedChains);

  return normalizeTransaction(transactionRecord, wallet, balance, chainMeta);
}

function BootstrapController({ children }) {
  const dispatch = useDispatch();
  const accessToken = useSelector((state) => state.auth.accessToken || state.auth.token);
  const sessionState = useSelector((state) => state.auth.sessionState || "unknown");
  const activeAccountId = useSelector((state) => state.account.activeAccountId);
  const activeWalletId = useSelector((state) => state.wallet.activeWalletId);
  const walletItems = useSelector((state) => state.wallet.items);
  const walletScopeAccountId = useSelector((state) => state.wallet.scopeAccountId ?? null);
  const selectedNetwork = useSelector((state) => state.wallet.selectedNetwork || "");
  const walletCount = walletItems.length;
  const balancesByWalletId = useSelector((state) => state.balance.byWalletId);
  const transactionsByWalletId = useSelector((state) => state.transaction.byWalletId);
  const pinHash = useSelector((state) => state.unlock.pinHash);
  const pinSalt = useSelector((state) => state.unlock.pinSalt);
  const autoLockMinutes = useSelector((state) => state.unlock.autoLockMinutes || 5);
  const lastInactiveAt = useSelector((state) => state.unlock.lastInactiveAt || 0);
  const hasBootedRef = useRef(false);
  const bootDataInFlightRef = useRef(false);
  const pendingBalanceWalletsRef = useRef(new Set());
  const failedBalanceWalletsRef = useRef(new Set());
  const pendingTransactionWalletsRef = useRef(new Set());
  const failedTransactionWalletsRef = useRef(new Set());
  const notificationStreamRef = useRef(null);
  const notificationRefreshInFlightRef = useRef(null);
  const notificationRefreshQueuedRef = useRef(false);
  const liveBalanceRefreshInFlightRef = useRef(null);
  const liveBalanceRefreshQueuedRef = useRef(false);
  const pendingSwapRefreshInFlightRef = useRef(null);
  const pendingSwapRefreshQueuedRef = useRef(false);
  const nftTransactionStatusRef = useRef(new Map());
  const adaWalletSyncAttemptRef = useRef(new Map());
  const adaBalanceDebugRef = useRef(new Map());

  function clearAllRequestGuards() {
    pendingBalanceWalletsRef.current.clear();
    failedBalanceWalletsRef.current.clear();
    pendingTransactionWalletsRef.current.clear();
    failedTransactionWalletsRef.current.clear();
    adaWalletSyncAttemptRef.current.clear();
    adaBalanceDebugRef.current.clear();
  }

  function syncRequestGuardScopes() {
    if (!accessToken) {
      clearAllRequestGuards();
      return;
    }

    const state = store.getState();
    const visibleWalletIds = new Set(getVisibleWalletIdsFromState(state));
    const nextActiveWalletId = state.wallet.activeWalletId || "";

    for (const walletId of Array.from(pendingBalanceWalletsRef.current)) {
      if (!nextActiveWalletId || walletId !== nextActiveWalletId) {
        pendingBalanceWalletsRef.current.delete(walletId);
      }
    }

    for (const walletId of Array.from(failedBalanceWalletsRef.current)) {
      if (!nextActiveWalletId || walletId !== nextActiveWalletId) {
        failedBalanceWalletsRef.current.delete(walletId);
      }
    }

    for (const walletId of Array.from(pendingTransactionWalletsRef.current)) {
      if (!visibleWalletIds.has(walletId)) {
        pendingTransactionWalletsRef.current.delete(walletId);
      }
    }

    for (const walletId of Array.from(failedTransactionWalletsRef.current)) {
      if (!visibleWalletIds.has(walletId)) {
        failedTransactionWalletsRef.current.delete(walletId);
      }
    }
  }

  function refreshLiveBalances({ force = false } = {}) {
    if (sessionState !== "active" || !accessToken || !walletCount || bootDataInFlightRef.current) {
      return Promise.resolve(null);
    }

    const state = store.getState();
    const targetWalletId = resolveActiveBalanceWalletId(state);
    const lastFetchedAt =
      state.balance.lastFetchedAtByWalletId?.[targetWalletId] ||
      state.balance.lastFetchedAt ||
      0;

    if (!targetWalletId || (!force && isFreshEnough(lastFetchedAt, LIVE_BALANCE_FRESHNESS_MS))) {
      return Promise.resolve(null);
    }

    if (liveBalanceRefreshInFlightRef.current) {
      liveBalanceRefreshQueuedRef.current = true;
      return liveBalanceRefreshInFlightRef.current;
    }

    const request = dispatch(fetchWalletBalanceThunk(targetWalletId))
      .unwrap()
      .catch(() => null)
      .finally(() => {
        liveBalanceRefreshInFlightRef.current = null;

        if (liveBalanceRefreshQueuedRef.current) {
          liveBalanceRefreshQueuedRef.current = false;

          if (typeof document === "undefined" || !document.hidden) {
            void refreshLiveBalances();
          }
        }
      });

    liveBalanceRefreshInFlightRef.current = request;
    return request;
  }

  function refreshPendingSwapState() {
    if (
      sessionState !== "active" ||
      !accessToken ||
      !walletCount ||
      bootDataInFlightRef.current
    ) {
      return Promise.resolve(null);
    }

    const state = store.getState();
    const walletIds = collectPendingSwapRefreshWalletIds(state);

    if (!walletIds.length) {
      return Promise.resolve(null);
    }

    if (pendingSwapRefreshInFlightRef.current) {
      pendingSwapRefreshQueuedRef.current = true;
      return pendingSwapRefreshInFlightRef.current;
    }

    const walletIdsNeedingBalances = getWalletIdsNeedingBalanceHydration(state, walletIds, {
      freshnessMs: PENDING_SWAP_REFRESH_INTERVAL_MS,
    });
    const walletIdsNeedingTransactions = getWalletIdsNeedingTransactionHydration(state, walletIds);

    if (!walletIdsNeedingBalances.length && !walletIdsNeedingTransactions.length) {
      return Promise.resolve(null);
    }

    const request = Promise.allSettled([
      walletIdsNeedingBalances.length
        ? dispatch(
            hydrateVisibleWalletBalancesThunk({
              walletIds: walletIdsNeedingBalances,
              freshnessMs: PENDING_SWAP_REFRESH_INTERVAL_MS,
            }),
          )
        : Promise.resolve(null),
      ...walletIdsNeedingTransactions.map((walletId) =>
        dispatch(fetchTransactionsThunk(walletId)).unwrap(),
      ),
    ]).finally(() => {
      pendingSwapRefreshInFlightRef.current = null;

      if (pendingSwapRefreshQueuedRef.current) {
        pendingSwapRefreshQueuedRef.current = false;

        if (typeof document === "undefined" || !document.hidden) {
          void refreshPendingSwapState();
        }
      }
    });

    pendingSwapRefreshInFlightRef.current = request;
    return request;
  }

  useEffect(() => {
    configureApiClientSession({
      getAccessToken: () => store.getState().auth.accessToken || store.getState().auth.token,
      getRefreshToken: () => store.getState().auth.refreshToken,
      refreshSession: async () => dispatch(refreshSessionThunk()).unwrap(),
      logout: async ({ reason = "unauthorized" } = {}) =>
        logoutAndClearSession({
          dispatch,
          persistor,
          accessToken: store.getState().auth.accessToken || store.getState().auth.token,
          refreshToken: store.getState().auth.refreshToken,
          reason,
        }),
    });
  }, [dispatch]);

  useEffect(() => {
    const notificationPollIntervalMs = runtimeConfig.notificationRefreshIntervalMs;

    function refreshNotificationState({ force = false } = {}) {
      const state = store.getState();

      if (
        !force &&
        state.notification.hasLoadedOnce &&
        isFreshEnough(state.notification.lastFetchedAt, NOTIFICATION_FRESHNESS_MS)
      ) {
        return Promise.resolve(null);
      }

      if (notificationRefreshInFlightRef.current) {
        notificationRefreshQueuedRef.current = true;
        return notificationRefreshInFlightRef.current;
      }

      const request = dispatch(fetchNotificationsThunk({ limit: 50 }))
        .unwrap()
        .catch(() => null)
        .finally(() => {
        notificationRefreshInFlightRef.current = null;

        if (notificationRefreshQueuedRef.current) {
          notificationRefreshQueuedRef.current = false;
          void refreshNotificationState();
        }
      });

      notificationRefreshInFlightRef.current = request;
      return request;
    }

    if (notificationStreamRef.current) {
      notificationStreamRef.current.close();
      notificationStreamRef.current = null;
    }

    if (sessionState !== "active" || !accessToken) {
      notificationRefreshInFlightRef.current = null;
      notificationRefreshQueuedRef.current = false;
      return undefined;
    }

    void refreshNotificationState({ force: true });

    const stream = createNotificationStream(accessToken, {
      onNotification: () => {
        void refreshNotificationState({ force: true });
        dispatch(requestHistoryRefreshSignal());
      },
      onError: () => null,
    });

    notificationStreamRef.current = stream;
    const pollIntervalId =
      typeof window === "undefined"
        ? null
        : window.setInterval(() => {
          if (typeof document === "undefined" || !document.hidden) {
            void refreshNotificationState();
          }
        }, notificationPollIntervalMs);

    return () => {
      if (notificationStreamRef.current) {
        notificationStreamRef.current.close();
        notificationStreamRef.current = null;
      }

      if (pollIntervalId !== null) {
        window.clearInterval(pollIntervalId);
      }
    };
  }, [accessToken, dispatch, sessionState]);

  useEffect(() => {
    if (sessionState !== "active" || !accessToken) {
      return undefined;
    }

    async function refreshVisibleTransactionsFromSocket() {
      const visibleWalletIds = getVisibleWalletIdsFromState(store.getState());
      await fetchTransactionsForWalletIds(dispatch, visibleWalletIds);
    }

    function handleSocketTransaction(payload) {
      try {
        const state = store.getState();
        const normalizedTransaction = normalizeSocketTransactionPayload(state, payload);

        // We now allow transactions without a direct wallet match to pass through 
        // as they will be handled by the 'unresolved' fallback in the transaction slice.
        dispatch(upsertLiveTransactionSignal({
          transaction: normalizedTransaction,
          wallets: state.wallet.items || []
        }));

        // Proactively force a balance refresh on any socket transaction activity
        void refreshLiveBalances({ force: true });
      } catch (error) {
        console.warn("Failed to normalize socket transaction update", error);
      }
    }

    function handleSocketReconnect() {
      if (typeof document === "undefined" || !document.hidden) {
        void refreshVisibleTransactionsFromSocket();
      }
    }

    socket.on("transaction:new", handleSocketTransaction);
    socket.on("transaction:update", handleSocketTransaction);
    socket.on("connect", handleSocketReconnect);

    return () => {
      socket.off("transaction:new", handleSocketTransaction);
      socket.off("transaction:update", handleSocketTransaction);
      socket.off("connect", handleSocketReconnect);
    };
  }, [accessToken, dispatch, sessionState]);

  useEffect(() => {
    if (sessionState !== "active") {
      nftTransactionStatusRef.current.clear();
      return;
    }

    const nextKnownStatuses = new Map();
    const transactionsByWallet = store.getState().transaction.byWalletId || {};

    Object.values(transactionsByWallet).forEach((walletTransactions) => {
      (Array.isArray(walletTransactions) ? walletTransactions : []).forEach((transaction) => {
        if (!transaction?.isNft) {
          return;
        }

        const identity = getTransactionIdentity(transaction);
        if (!identity) {
          return;
        }

        const nextStatus = resolveNormalizedTransactionStatus(transaction);
        const previousStatus = nftTransactionStatusRef.current.get(identity);

        if (previousStatus && previousStatus !== nextStatus) {
          if (previousStatus === "pending" && nextStatus === "success") {
            toast.success("NFT transfer confirmed", {
              description: transaction.displayTitle || "Polygon transfer confirmed",
            });
          } else if (previousStatus === "pending" && nextStatus === "failed") {
            toast.error("NFT transfer failed", {
              description:
                transaction.displayTitle || "Polygon transfer failed",
            });
          }
        }

        nextKnownStatuses.set(identity, nextStatus);
      });
    });

    nftTransactionStatusRef.current = nextKnownStatuses;
  }, [sessionState, transactionsByWalletId]);

  useEffect(() => {
    if (sessionState === "active" && accessToken && walletCount) {
      return undefined;
    }

    liveBalanceRefreshInFlightRef.current = null;
    liveBalanceRefreshQueuedRef.current = false;
    return undefined;
  }, [accessToken, sessionState, walletCount]);

  useEffect(() => {
    if (hasBootedRef.current) {
      return;
    }

    hasBootedRef.current = true;

    const boot = async () => {
      try {
        if (store.getState().auth.sessionState === "logged_out") {
          clearAllRequestGuards();
          return;
        }

        const accessToken = store.getState().auth.accessToken || store.getState().auth.token;
        const refreshToken = store.getState().auth.refreshToken;

        if (!accessToken && refreshToken) {
          try {
            await dispatch(refreshSessionThunk({ refreshToken })).unwrap();
          } catch (error) {
            console.error("Failed to restore session during boot:", error);
            await logoutAndClearSession({
              dispatch,
              persistor,
              revokeSession: false,
              reason: "session_restore_failed",
            });
            return;
          }
        }

        const validToken = store.getState().auth.accessToken || store.getState().auth.token;
        if (validToken) {
          bootDataInFlightRef.current = true;

          try {
            await ensureSupportedChainsReady(dispatch);
            await dispatch(fetchAccountsThunk()).unwrap().catch(() => null);
            const wallets = await dispatch(fetchWalletsThunk())
              .unwrap()
              .then((result) => result?.wallets || []);

            if (wallets.length) {
              const state = store.getState();
              const nextActiveWalletId = resolveActiveWalletId(state, wallets);

              if (nextActiveWalletId) {
                dispatch(setActiveWalletId(nextActiveWalletId));
                await dispatch(
                  hydrateVisibleWalletBalancesThunk({
                    walletIds: [nextActiveWalletId],
                    freshnessMs: BALANCE_FRESHNESS_MS,
                  }),
                );
              }

              const visibleWalletIds = getVisibleWalletIdsFromState(store.getState());
              await fetchTransactionsForWalletIds(dispatch, visibleWalletIds);
            }
          } catch (error) {
            console.error("Failed to load initial app data during boot:", error);
          } finally {
            bootDataInFlightRef.current = false;
            clearAllRequestGuards();
          }
        }
      } catch (err) {
        console.error("Boot sequence fatal error:", err);
      } finally {
        dispatch(markBootstrapped());
      }
    };

    boot();
  }, [dispatch]);

  useEffect(() => {
    syncRequestGuardScopes();
  }, [accessToken, activeWalletId, selectedNetwork, walletCount]);

  useEffect(() => {
    if (sessionState !== "active" || !accessToken || bootDataInFlightRef.current) {
      return undefined;
    }

    const normalizedActiveAccountId = activeAccountId || null;
    const normalizedWalletScopeAccountId = walletScopeAccountId || null;

    if (normalizedActiveAccountId === normalizedWalletScopeAccountId) {
      return undefined;
    }

    let cancelled = false;

    void (async () => {
      const wallets = await dispatch(fetchWalletsThunk())
        .unwrap()
        .then((result) => result?.wallets || [])
        .catch(() => null);

      if (cancelled || !wallets) {
        return;
      }

      if (wallets.length) {
        const state = store.getState();
        const nextActiveWalletId = resolveActiveWalletId(state, wallets);

        if (nextActiveWalletId) {
          dispatch(setActiveWalletId(nextActiveWalletId));
          await dispatch(
            hydrateVisibleWalletBalancesThunk({
              walletIds: [nextActiveWalletId],
              freshnessMs: BALANCE_FRESHNESS_MS,
            }),
          );
        }

        // Minimal Aptos-only detection and safe provisioning for existing users
        try {
          const state = store.getState();
          const supportedChains = state.chain.supported || [];
          const selectedNetwork = state.wallet.selectedNetwork || "";
          const hasAptosSupported = supportedChains.some(chain => 
            String(chain?.code || "").toLowerCase() === "aptos"
          );
          const hasAptosWallet = wallets.some(wallet => 
            String(wallet?.chain || "").toLowerCase() === "aptos"
          );
          
          // If Aptos is supported but no Aptos wallet exists, store this for potential future use
          if (hasAptosSupported && !hasAptosWallet) {
            // Store a flag that can be used by UI components to show Aptos provisioning option
            localStorage.setItem('aptosWalletMissing', 'true');
          } else {
            localStorage.removeItem('aptosWalletMissing');
          }
        } catch (err) {
          // Silent fail - don't break the app if detection fails
          console.warn("Aptos wallet detection failed:", err);
        }

        const visibleWalletIds = getVisibleWalletIdsFromState(store.getState());
        await fetchTransactionsForWalletIds(dispatch, visibleWalletIds);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeAccountId, dispatch, sessionState, walletScopeAccountId]);

  useEffect(() => {
    if (!accessToken) {
      clearAllRequestGuards();
      return;
    }

    if (bootDataInFlightRef.current) {
      return;
    }

    const state = store.getState();
    const visibleWalletIds = getVisibleWalletIdsFromState(state);
    const walletIdsNeedingBalanceHydration = getWalletIdsNeedingBalanceHydration(
      state,
      visibleWalletIds,
      {
        freshnessMs: BALANCE_FRESHNESS_MS,
      },
    );

    if (walletIdsNeedingBalanceHydration.length) {
      void dispatch(
        hydrateVisibleWalletBalancesThunk({
          walletIds: walletIdsNeedingBalanceHydration,
          freshnessMs: BALANCE_FRESHNESS_MS,
        }),
      );
    }

    const missingWalletIds = getWalletIdsNeedingTransactionHydration(state, visibleWalletIds).filter(
      (walletId) =>
        !pendingTransactionWalletsRef.current.has(walletId) &&
        !failedTransactionWalletsRef.current.has(walletId),
    );

    if (missingWalletIds.length) {
      missingWalletIds.forEach((walletId) => pendingTransactionWalletsRef.current.add(walletId));

      void (async () => {
        for (const walletId of missingWalletIds) {
          try {
            await dispatch(fetchTransactionsThunk(walletId)).unwrap();
            failedTransactionWalletsRef.current.delete(walletId);
          } catch (_error) {
            failedTransactionWalletsRef.current.add(walletId);
          } finally {
            pendingTransactionWalletsRef.current.delete(walletId);
          }
        }
      })();
    }
  }, [
    accessToken,
    activeWalletId,
    dispatch,
    selectedNetwork,
    walletItems,
    walletCount,
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      sessionState !== "active" ||
      !accessToken ||
      bootDataInFlightRef.current
    ) {
      pendingSwapRefreshInFlightRef.current = null;
      pendingSwapRefreshQueuedRef.current = false;
      return undefined;
    }

    const pendingSwapWalletIds = collectPendingSwapRefreshWalletIds(store.getState());
    if (!pendingSwapWalletIds.length) {
      pendingSwapRefreshInFlightRef.current = null;
      pendingSwapRefreshQueuedRef.current = false;
      return undefined;
    }

    void refreshPendingSwapState();

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void refreshPendingSwapState();
      }
    }, PENDING_SWAP_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    accessToken,
    sessionState,
    transactionsByWalletId,
    walletCount,
  ]);

  useEffect(() => {
    if (!accessToken || sessionState !== "active" || bootDataInFlightRef.current || !activeWalletId) {
      return;
    }

    const activeWallet = walletItems.find((wallet) => wallet.walletId === activeWalletId) || null;
    const activeBalanceEntry = balancesByWalletId[activeWalletId] || null;

    if (!activeWallet || !hasLoadedBalanceEntry(activeBalanceEntry)) {
      return;
    }

    const activeChain = activeWallet?.chain || activeBalanceEntry?.chain || "";
    if (!isAdaChain(activeChain)) {
      return;
    }

    const walletAddress = normalizeComparableString(activeWallet?.address);
    const balanceAddress = normalizeComparableString(activeBalanceEntry?.address);
    const pendingRecovery = isAdaWalletPendingRecovery(activeWallet);
    const addressMismatch = Boolean(walletAddress && balanceAddress && walletAddress !== balanceAddress);
    const balanceFetchedAt =
      Number(store.getState().balance.lastFetchedAtByWalletId?.[activeWalletId] || 0) || 0;
    const syncReason = addressMismatch ? "address_mismatch" : pendingRecovery ? "pending_recovery" : "";

    if (import.meta.env.DEV) {
      const debugKey = [
        activeWalletId,
        balanceFetchedAt,
        walletAddress,
        balanceAddress,
        String(activeBalanceEntry?.exists ?? ""),
        String(activeBalanceEntry?.confirmed ?? ""),
        String(activeBalanceEntry?.source || ""),
        String(activeBalanceEntry?.errors?.reason || ""),
        syncReason,
      ].join("|");

      if (adaBalanceDebugRef.current.get(activeWalletId) !== debugKey) {
        adaBalanceDebugRef.current.set(activeWalletId, debugKey);
        console.debug("[ADA wallet sync]", {
          walletId: activeWalletId,
          walletAddress: activeWallet?.address || "",
          balanceAddress: activeBalanceEntry?.address || "",
          exists: Boolean(activeBalanceEntry?.exists),
          confirmed: Boolean(activeBalanceEntry?.confirmed),
          source: activeBalanceEntry?.source || null,
          errorReason: activeBalanceEntry?.errors?.reason || null,
          pendingRecovery,
          addressMismatch,
        });
      }
    }

    if (!syncReason || store.getState().wallet.requestStatus?.fetch === "loading") {
      return;
    }

    const syncKey = [activeWalletId, balanceFetchedAt, syncReason].join("|");
    if (adaWalletSyncAttemptRef.current.get(activeWalletId) === syncKey) {
      return;
    }

    adaWalletSyncAttemptRef.current.set(activeWalletId, syncKey);

    void (async () => {
      const hadLoadedTransactions = Boolean(
        store.getState().transaction.hasLoadedOnceByWalletId?.[activeWalletId],
      );

      const refreshedWallets = await dispatch(fetchWalletsThunk())
        .unwrap()
        .then((result) => result?.wallets || [])
        .catch(() => null);

      if (!refreshedWallets) {
        return;
      }

      const nextState = store.getState();
      const nextActiveWalletId = nextState.wallet.activeWalletId || activeWalletId;
      const nextActiveWallet =
        nextState.wallet.items.find((wallet) => wallet.walletId === nextActiveWalletId) || null;
      const activeWalletChanged = nextActiveWalletId !== activeWalletId;
      const addressUpdated = Boolean(
        nextActiveWallet &&
          normalizeComparableString(nextActiveWallet.address) !== walletAddress,
      );

      if (activeWalletChanged && nextActiveWalletId) {
        await dispatch(fetchWalletBalanceThunk(nextActiveWalletId)).unwrap().catch(() => null);
      }

      if ((hadLoadedTransactions || activeWalletChanged || addressUpdated) && nextActiveWalletId) {
        await dispatch(refreshWalletTransactionsThunk(nextActiveWalletId))
          .unwrap()
          .catch(() => null);
      }
    })();
  }, [
    accessToken,
    activeWalletId,
    balancesByWalletId,
    dispatch,
    sessionState,
    walletItems,
  ]);

  useEffect(() => {
    if (sessionState !== "active" && (pinHash || pinSalt)) {
      dispatch(setLocalUnlockState(false));
    }
  }, [dispatch, pinHash, pinSalt, sessionState]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }

    function markInactive() {
      if (store.getState().auth.sessionState !== "active") {
        return;
      }

      const state = store.getState();
      const hasStoredPin = Boolean(state.unlock.pinHash && state.unlock.pinSalt);

      if (!state.wallet.items.length || !hasStoredPin) {
        return;
      }

      dispatch(recordAppInactive(Date.now()));
    }

    function handleResume() {
      const state = store.getState();

      if (state.auth.sessionState !== "active") {
        return;
      }

      const hasStoredPin = Boolean(state.unlock.pinHash && state.unlock.pinSalt);

      if (!state.wallet.items.length) {
        return;
      }

      if (!hasStoredPin) {
        dispatch(setLocalUnlockState(false));
        void refreshLiveBalances();
        return;
      }

      if (hasAutoLockExpired(state.unlock.lastInactiveAt, state.unlock.autoLockMinutes)) {
        dispatch(setLocalUnlockState(false));
        void refreshLiveBalances();
        return;
      }

      dispatch(clearAppInactive());
      void refreshLiveBalances();
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        markInactive();
      } else {
        handleResume();
      }
    }

    window.addEventListener("focus", handleResume);
    window.addEventListener("blur", markInactive);
    window.addEventListener("pagehide", markInactive);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("blur", markInactive);
      window.removeEventListener("pagehide", markInactive);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoLockMinutes, dispatch, lastInactiveAt, pinHash, pinSalt, sessionState, walletCount]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      sessionState !== "active" ||
      !accessToken ||
      !walletCount
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void refreshLiveBalances();
      }
    }, runtimeConfig.balanceRefreshIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [accessToken, sessionState, walletCount]);

  return children;
}

export function AppProvider({ children }) {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor}>
        <BootstrapController>{children}</BootstrapController>
      </PersistGate>
    </Provider>
  );
}
