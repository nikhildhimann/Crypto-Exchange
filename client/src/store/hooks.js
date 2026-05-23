import { useCallback, useSyncExternalStore } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  createAccount as createAccountApi,
  importAccount as importAccountApi,
  generateAccountMnemonic as generateAccountMnemonicApi,
  rollbackIncompleteAccount as rollbackIncompleteAccountApi,
} from "../api/account";
import { createSession, refreshSession } from "../api/auth";
import { getAccessToken, normalizeAuthSession } from "../api/adapters/auth";
import {
  executeSwap as executeSwapApi,
  getSwapById as getSwapByIdApi,
  getSwapPairs as getSwapPairsApi,
  previewSwap as previewSwapApi,
  reviewSwap as reviewSwapApi,
} from "../api/swap";
import {
  buildCanonicalTransactionRequest,
  normalizeTransactionDetail,
} from "../api/adapters/transaction";
import { getTransactionById } from "../api/transaction";
import {
  createHbarWalletOnDemand as createHbarWalletOnDemandApi,
  fetchReceivePayload as fetchReceivePayloadApi,
  fetchReceiveQr as fetchReceiveQrApi,
  getWalletDetails as getWalletDetailsApi,
} from "../api/wallet";
import { getChainMeta } from "../config/chains";
import { UI_ASSETS } from "../config/uiAssets";
import {
  generatePinCredentials,
  verifyPin as verifyStoredPin,
} from "../lib/pinSecurity";
import { runtimeConfig } from "../lib/runtimeConfig";
import {
  archiveAccountThunk,
  clearActiveAccount,
  createAccountThunk,
  fetchAccountsThunk,
  importAccountThunk,
  renameAccountThunk,
  selectAccountError,
  selectActiveAccountId as selectActiveAccountIdSelector,
  selectAccountRequestStatus,
  setActiveAccount,
  upsertAccount,
} from "./accountSlice";
import { setSession } from "./authSlice";
import {
  BALANCE_FRESHNESS_MS,
  getVisibleWalletIdsFromState,
  hydrateVisibleWalletBalancesThunk,
} from "./balanceSlice";
import { ensureSupportedChainsReady } from "./chainBootstrap";
import {
  fetchNotificationsThunk,
  fetchUnreadNotificationCountThunk,
  markAllNotificationsReadThunk,
  clearAllNotificationsThunk,
  markNotificationReadThunk,
} from "./notificationSlice";
import {
  fetchTransactionsThunk,
  refreshUserTransactionsThunk,
  refreshWalletTransactionsThunk,
  fetchUserTransactionsThunk,
  normalizeTransaction,
  previewTransactionThunk,
  sendTransactionThunk,
  validateDestinationThunk,
} from "./transactionSlice";
import {
  clearAppInactive,
  clearUnlockState,
  configureQuickUnlock,
  registerUnlockFailure,
  setAutoLockMinutes,
  setBiometricPreference,
  setLocalUnlockState,
  setPinCredential,
} from "./unlockSlice";
import {
  confirmWalletThunk,
  createWalletInitThunk,
  fetchWalletsThunk,
  importWalletThunk,
  setActiveWalletId,
  setSelectedNetwork,
} from "./walletSlice";
import {
  selectAccessToken,
  selectActiveBalance,
  selectActiveChainMeta,
  selectActiveWallet,
  selectActiveWalletId,
  selectAvailableWalletNetworks,
  selectAppError,
  selectAppAccessState,
  selectAutoLockMinutes,
  selectAssets,
  selectBalancesByWalletId,
  selectBalancesHaveLoadedOnce,
  selectBalancesLoading,
  selectBalanceLastFetchedAt,
  selectBalanceLastFetchedAtByWalletId,
  selectBalanceLastFullFetchedAt,
  selectBootStatus,
  selectAccountSwitcherRows,
  selectActiveAccountDisplayModel,
  selectCurrency,
  selectCurrentWalletDisplayModel,
  selectDefaultNetworkForChain,
  selectFirstSupportedChain,
  selectHasPin,
  selectNetworksForActiveChain,
  selectNotifications,
  selectNotificationsHaveLoadedOnce,
  selectNotificationsLoading,
  selectNotificationsLastFetchedAt,
  selectPortfolioRows,
  selectPreviewData,
  selectRefreshToken,
  selectSelectedChainCode,
  selectSelectedNetworkCode,
  selectSessionState,
  selectSupportedChains,
  selectSupportsDestinationTag,
  selectToken,
  selectTransactionsLoading,
  selectTransactionsHaveLoadedOnceByWalletId,
  selectTransactionsLastFetchedAtByWalletId,
  selectUnreadNotificationCount,
  selectUnlockState,
  selectUserId,
  selectVisibleAssets,
  selectVisibleAssetsTotalFiat,
  selectVisibleWalletDisplayRows,
  selectVisibleTransactions,
  selectVisibleWalletCards,
  selectWalletCards,
  selectWalletDisplayRows,
  selectWallets,
  selectWalletsLoading,
  selectActiveWalletNfts,
  selectActiveWalletNftMeta,
  selectActiveWalletNftSync,
  selectActiveWalletNftsLoading,
  selectActiveWalletNftsSyncing,
  selectActiveWalletNftsError,
  selectNftSupportedWallets,
  selectSelectedNftWalletId,
  selectSelectedNftWallet,
  selectSelectedNftItem,
  selectSelectedNftLoading,
  selectSelectedNftError,
  selectActiveWalletNftCollections,
  selectActiveWalletNftCollectionsMeta,
  selectActiveWalletNftCollectionsSync,
  selectActiveWalletNftCollectionsLoading,
  selectActiveWalletNftRefreshState,
  selectActiveWalletNftRefreshPending,
  selectActiveWalletNftRefreshError,
  normalizeNftChain,
  isNftSupportedChain,
} from "./selectors";
import {
  estimateNftTransferFeeThunk,
  fetchNftActivityFeedThunk,
  fetchWalletNftsThunk,
  fetchWalletNftCollectionDetailThunk,
  requestWalletNftRefreshThunk,
  fetchWalletNftCollectionsThunk,
  fetchNftByIdThunk,
  hideNftThunk,
  transferNftThunk,
  clearSelectedNft as clearSelectedNftAction,
  clearNftFeeEstimateState as clearNftFeeEstimateStateAction,
  clearNftTransferState as clearNftTransferStateAction,
  setSelectedNftWalletId,
  fetchMarketplaceListingsThunk,
  fetchMyMarketplaceListingsThunk,
  fetchMyMarketplaceOrdersThunk,
  listNftForSaleThunk,
  buyNftThunk,
  cancelNftListingThunk,
} from "./nftSlice";
import { logoutAndClearSession } from "./logoutHelper";
import { persistor, store } from "./index";

const PROFILE_STORAGE_KEY = "aura_profile";
const PREFERENCES_STORAGE_KEY = "aura_preferences";
const SWAP_SUBMITTED_DISMISSALS_STORAGE_KEY = "aura_swap_submitted_dismissals";

const settingsListeners = new Set();
const transactionStatusListeners = new Set();
const walletCreateInitInFlight = new Map();
const walletCreateInitClientFailures = new Map();
const walletCreateInitSuccessCache = new Map();
const accountSwitchInFlight = new Map();
const transactionValidateInFlight = new Map();
const transactionPreviewInFlight = new Map();
const transactionSendInFlight = new Map();
const appRefreshInFlight = new Map();
const balanceRefreshInFlight = new Map();
const nftTransferInFlight = new Map();
let profileSnapshotCache;
let preferencesSnapshotCache;
let swapSubmittedDismissalsCache;
let transactionStatusSnapshot = null;

const TRANSACTION_FRESHNESS_MS = runtimeConfig.pendingSwapRefreshIntervalMs;
const NOTIFICATION_FRESHNESS_MS = runtimeConfig.notificationRefreshIntervalMs;

function clearTransientRequestGuards() {
  walletCreateInitInFlight.clear();
  walletCreateInitClientFailures.clear();
  walletCreateInitSuccessCache.clear();
  accountSwitchInFlight.clear();
  transactionValidateInFlight.clear();
  transactionPreviewInFlight.clear();
  transactionSendInFlight.clear();
  nftTransferInFlight.clear();
}

function normalizeRequestError(error, fallbackMessage = "Request failed") {
  if (error instanceof Error) {
    return {
      message: error.message || fallbackMessage,
      status: Number(error.status || 0) || 0,
      payload:
        error.payload && typeof error.payload === "object"
          ? error.payload
          : null,
    };
  }

  if (error && typeof error === "object") {
    return {
      ...error,
      message:
        typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage,
      status: Number(error.status || 0) || 0,
      payload:
        error.payload && typeof error.payload === "object"
          ? error.payload
          : null,
    };
  }

  return {
    message:
      typeof error === "string" && error.trim()
        ? error.trim()
        : fallbackMessage,
    status: 0,
    payload: null,
  };
}

function buildStageError(stage, error, fallbackMessage) {
  const normalizedError = normalizeRequestError(error, fallbackMessage);
  const stageError = new Error(normalizedError.message || fallbackMessage);

  stageError.stage = String(stage || "unknown");
  stageError.status = normalizedError.status;
  stageError.payload = normalizedError.payload;
  stageError.cause = error instanceof Error ? error : undefined;

  return stageError;
}

function isClientRequestError(error) {
  const status = Number(error?.status || 0);
  return status >= 400 && status < 500;
}

function buildWalletCreateInitRequestKey(payload = {}) {
  return JSON.stringify({
    chain: String(payload?.chain || "")
      .trim()
      .toLowerCase(),
    network: String(payload?.network || "")
      .trim()
      .toLowerCase(),
    label: String(payload?.label || "").trim(),
  });
}

function buildTransactionRequestKey(payload = {}) {
  const request = buildCanonicalTransactionRequest(payload);
  return JSON.stringify({
    walletId: request.walletId || "",
    destinationAddress: request.destinationAddress || "",
    asset: request.asset || "",
    amount: request.amount || "",
    executionParams: request.executionParams || {},
  });
}

function buildNftTransferRequestKey(payload = {}) {
  return JSON.stringify({
    walletId: String(payload?.walletId || "").trim(),
    nftId: String(payload?.nftId || "").trim(),
    toAddress: String(payload?.toAddress || "")
      .trim()
      .toLowerCase(),
  });
}

function normalizeWalletSelectionInput(selection) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    return {
      walletId: selection ? String(selection) : "",
      wallet: null,
    };
  }

  return {
    walletId: String(selection.walletId || selection.id || ""),
    wallet: selection,
  };
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
}


function isFreshEnough(lastFetchedAt, freshnessMs) {
  const timestamp = Number(lastFetchedAt || 0);

  return (
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    Date.now() - timestamp < freshnessMs
  );
}

async function runInFlightRequest(map, requestKey, runner, fallbackMessage) {
  const existingRequest = map.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = Promise.resolve()
    .then(runner)
    .catch((error) => {
      throw normalizeRequestError(error, fallbackMessage);
    });

  map.set(requestKey, request);

  try {
    return await request;
  } finally {
    map.delete(requestKey);
  }
}

function notifySettingsListeners() {
  for (const listener of settingsListeners) {
    listener();
  }
}

function notifyTransactionStatusListeners() {
  for (const listener of transactionStatusListeners) {
    listener();
  }
}

function subscribeToSettings(listener) {
  settingsListeners.add(listener);

  return () => {
    settingsListeners.delete(listener);
  };
}

function subscribeToTransactionStatus(listener) {
  transactionStatusListeners.add(listener);

  return () => {
    transactionStatusListeners.delete(listener);
  };
}

function getTransactionStatusSnapshot() {
  return transactionStatusSnapshot;
}

function writeTransactionStatusSnapshot(nextValue) {
  transactionStatusSnapshot = nextValue;
  notifyTransactionStatusListeners();
}

function normalizeTransactionStatusPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const variant = String(
    payload.variant ||
      payload.state ||
      payload.status ||
      (payload.pending ? "pending" : payload.success === false ? "failed" : "success"),
  )
    .trim()
    .toLowerCase();

  return {
    dismissible: payload.dismissible !== false,
    primaryLabel: payload.primaryLabel || "",
    secondaryLabel: payload.secondaryLabel || "",
    hideSecondaryAction: Boolean(payload.hideSecondaryAction),
    ...payload,
    variant,
    pending: variant === "pending" || payload.pending === true,
    success:
      variant === "success"
        ? true
        : variant === "failed" || variant === "error"
          ? false
          : payload.success,
  };
}

function showTransactionStatusSnapshot(payload = {}) {
  const normalizedPayload = normalizeTransactionStatusPayload(payload);
  writeTransactionStatusSnapshot(normalizedPayload);
  return normalizedPayload;
}

function updateTransactionStatusSnapshot(patch = {}) {
  const current = getTransactionStatusSnapshot();
  if (!current) {
    return null;
  }

  return showTransactionStatusSnapshot({
    ...current,
    ...(patch || {}),
  });
}

function closeTransactionStatusSnapshot(reason = "close") {
  const current = getTransactionStatusSnapshot();
  writeTransactionStatusSnapshot(null);

  if (typeof current?.onClose === "function") {
    queueMicrotask(() => {
      current.onClose(reason, current);
    });
  }
}

function readStoredJson(key, fallbackValue) {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeStoredJson(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));

  if (key === PROFILE_STORAGE_KEY) {
    profileSnapshotCache = value;
  }

  if (key === PREFERENCES_STORAGE_KEY) {
    preferencesSnapshotCache = value;
  }

  notifySettingsListeners();
}

function getSwapSubmittedDismissalsSnapshot() {
  if (!swapSubmittedDismissalsCache) {
    swapSubmittedDismissalsCache = readStoredJson(
      SWAP_SUBMITTED_DISMISSALS_STORAGE_KEY,
      {},
    );
  }

  return swapSubmittedDismissalsCache;
}

function writeSwapSubmittedDismissalsSnapshot(value) {
  if (typeof window === "undefined") {
    return;
  }

  swapSubmittedDismissalsCache = value;
  window.localStorage.setItem(
    SWAP_SUBMITTED_DISMISSALS_STORAGE_KEY,
    JSON.stringify(value),
  );
}

function normalizeSwapSubmittedDismissalKey(value = "") {
  return String(value || "").trim();
}

function hasDismissedSwapSubmittedSnapshot(value = "") {
  const key = normalizeSwapSubmittedDismissalKey(value);
  if (!key) {
    return false;
  }

  return Boolean(getSwapSubmittedDismissalsSnapshot()?.[key]);
}

function markSwapSubmittedDismissedSnapshot(value = "") {
  const key = normalizeSwapSubmittedDismissalKey(value);
  if (!key) {
    return false;
  }

  const current = getSwapSubmittedDismissalsSnapshot();
  if (current?.[key]) {
    return true;
  }

  const nextEntries = {
    ...current,
    [key]: new Date().toISOString(),
  };
  const limitedEntries = Object.entries(nextEntries)
    .sort((left, right) => String(right[1] || "").localeCompare(String(left[1] || "")))
    .slice(0, 200);

  writeSwapSubmittedDismissalsSnapshot(Object.fromEntries(limitedEntries));
  return true;
}

function getProfileSnapshot() {
  if (!profileSnapshotCache) {
    profileSnapshotCache = readStoredJson(PROFILE_STORAGE_KEY, {
      displayName: "Crypto User",
      handle: "@cryptowallet",
      email: "",
      avatar: UI_ASSETS.profileAvatar,
    });
  }

  return profileSnapshotCache;
}

function getPreferencesSnapshot() {
  if (!preferencesSnapshotCache) {
    preferencesSnapshotCache = readStoredJson(PREFERENCES_STORAGE_KEY, {
      fiatCurrency: "$",
      language: "English",
    });
  }

  return preferencesSnapshotCache;
}

function getStoredSessionSnapshot() {
  const state = store.getState();
  const rawSession = {
    accessToken: state.auth.accessToken || state.auth.token || "",
    refreshToken: state.auth.refreshToken || "",
    userId: state.auth.userId || "",
    sessionId: state.auth.sessionId || "",
    accessTokenExpiresAt: state.auth.accessTokenExpiresAt || "",
    refreshTokenExpiresAt: state.auth.refreshTokenExpiresAt || "",
    session: {
      sessionId: state.auth.sessionId || "",
      status: state.auth.sessionStatus || "",
      expiresAt:
        state.auth.sessionExpiresAt || state.auth.refreshTokenExpiresAt || "",
      deviceId: state.auth.deviceId || "",
    },
    user: {
      _id: state.auth.userId || "",
    },
  };

  return normalizeAuthSession(rawSession);
}

function commitSession(dispatch, session) {
  dispatch(setSession(session));
  return normalizeAuthSession(session);
}

async function startBackendSession(dispatch) {
  const storedSession = getStoredSessionSnapshot();
  const accessToken = getAccessToken(storedSession);
  const refreshToken = storedSession.refreshToken;

  if (accessToken) {
    return storedSession;
  }

  if (refreshToken) {
    try {
      const session = await refreshSession({ refreshToken });
      return commitSession(dispatch, session);
    } catch (refreshError) {
      await logoutAndClearSession({
        dispatch,
        persistor,
        revokeSession: false,
        reason: "session_refresh_failed",
      });

      try {
        const freshSession = await createSession();
        return commitSession(dispatch, freshSession);
      } catch (createError) {
        throw buildStageError(
          "auth/session",
          createError,
          refreshError instanceof Error && refreshError.message
            ? refreshError.message
            : "Unable to prepare wallet session",
        );
      }
    }
  }

  try {
    const session = await createSession();
    return commitSession(dispatch, session);
  } catch (error) {
    throw buildStageError(
      "auth/session",
      error,
      "Unable to prepare wallet session",
    );
  }
}

async function ensureAuthFlowReady(dispatch, { forceChains = false } = {}) {
  const session = await startBackendSession(dispatch);
  const token = getAccessToken(session);

  if (!token) {
    throw buildStageError(
      "auth/session",
      new Error("Session token missing"),
      "Unable to prepare wallet session",
    );
  }

  try {
    await ensureSupportedChainsReady(dispatch, { force: forceChains });
  } catch (error) {
    throw buildStageError(
      "supported-chains",
      error,
      "Unable to load supported chains",
    );
  }

  return true;
}

async function fetchTransactionsForWalletIds(
  dispatch,
  walletIds = [],
  { forceSync = false } = {},
) {
  const uniqueWalletIds = Array.from(
    new Set((walletIds || []).filter(Boolean)),
  );

  if (!uniqueWalletIds.length) {
    return [];
  }

  const results = [];

  for (const walletId of uniqueWalletIds) {
    try {
      const value = await dispatch(
        forceSync
          ? refreshWalletTransactionsThunk(walletId)
          : fetchTransactionsThunk(walletId),
      ).unwrap();
      results.push({ status: "fulfilled", value });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }

  return results;
}

async function refreshVisibleWalletData(
  dispatch,
  {
    refreshWallets = false,
    requestedWalletId = "",
    includeTransactions = true,
    refreshBalances = "active",
    transactionScope = "visible",
    forceBalanceRefresh = false,
    forceTransactionRefresh = false,
  } = {},
) {
  let wallets = store.getState().wallet.items || [];

  if (refreshWallets || !wallets.length) {
    try {
      wallets = await dispatch(fetchWalletsThunk())
        .unwrap()
        .then((result) => result?.wallets || []);
    } catch {
      wallets = store.getState().wallet.items || [];
    }
  }

  if (!wallets.length) {
    return [];
  }

  const state = store.getState();
  const nextActiveWalletId =
    (requestedWalletId &&
      wallets.some((wallet) => wallet.walletId === requestedWalletId)
      ? requestedWalletId
      : "") ||
    (state.wallet.activeWalletId &&
      wallets.some((wallet) => wallet.walletId === state.wallet.activeWalletId)
      ? state.wallet.activeWalletId
      : "") ||
    wallets[0]?.walletId ||
    "";

  if (
    nextActiveWalletId &&
    nextActiveWalletId !== state.wallet.activeWalletId
  ) {
    dispatch(setActiveWalletId(nextActiveWalletId));
  }

  let settledState = store.getState();

  if (refreshBalances === "all" || refreshBalances === "visible") {
    const visibleWalletIds = getVisibleWalletIdsFromState(settledState);

    if (visibleWalletIds.length) {
      await dispatch(
        hydrateVisibleWalletBalancesThunk({
          walletIds: visibleWalletIds,
          force: forceBalanceRefresh,
          freshnessMs: BALANCE_FRESHNESS_MS,
        }),
      );
      settledState = store.getState();
    }
  } else if (refreshBalances === "active" && nextActiveWalletId) {
    await dispatch(
      hydrateVisibleWalletBalancesThunk({
        walletIds: [nextActiveWalletId],
        force: forceBalanceRefresh,
        freshnessMs: BALANCE_FRESHNESS_MS,
      }),
    );
    settledState = store.getState();
  }

  if (!includeTransactions) {
    return [];
  }

  const visibleWalletIds = getVisibleWalletIdsFromState(settledState);
  const candidateWalletIds =
    transactionScope === "active"
      ? [nextActiveWalletId].filter(Boolean)
      : visibleWalletIds;
  const walletIdsToRefresh = candidateWalletIds.filter((walletId) => {
    const hasLoadedTransactions = Boolean(
      settledState.transaction.hasLoadedOnceByWalletId?.[walletId],
    );
    const lastFetchedAt =
      settledState.transaction.lastFetchedAtByWalletId?.[walletId] || 0;

    return (
      forceTransactionRefresh ||
      !hasLoadedTransactions ||
      !isFreshEnough(lastFetchedAt, TRANSACTION_FRESHNESS_MS)
    );
  });

  await fetchTransactionsForWalletIds(dispatch, walletIdsToRefresh, {
    forceSync: forceTransactionRefresh,
  });
  return candidateWalletIds;
}

function getCurrentSessionToken() {
  return store.getState().auth.accessToken || store.getState().auth.token || "";
}

async function fetchScopedWallets(dispatch, accountId = undefined) {
  try {
    return await dispatch(
      fetchWalletsThunk(
        accountId ? { accountId } : undefined,
      ),
    )
      .unwrap()
      .then((result) => result?.wallets || []);
  } catch {
    return store.getState().wallet.items || [];
  }
}

function readWalletScopeSnapshot(expectedAccountId) {
  const state = store.getState();
  const normalizedExpectedAccountId =
    normalizeOptionalString(expectedAccountId);
  const currentScopeAccountId = normalizeOptionalString(
    state.wallet.scopeAccountId,
  );

  if (currentScopeAccountId !== normalizedExpectedAccountId) {
    return [];
  }

  return state.wallet.items || [];
}

function hasWalletInScope(wallets = [], walletId = "") {
  const normalizedWalletId = normalizeOptionalString(walletId);

  if (!normalizedWalletId) {
    return Array.isArray(wallets) && wallets.length > 0;
  }

  return wallets.some(
    (wallet) =>
      normalizeOptionalString(wallet?.walletId) === normalizedWalletId,
  );
}

function waitForWalletScopeAlignment(expectedAccountId, timeoutMs = 4000) {
  const normalizedExpectedAccountId =
    normalizeOptionalString(expectedAccountId);
  const scheduleTimeout =
    typeof window !== "undefined"
      ? window.setTimeout.bind(window)
      : globalThis.setTimeout;
  const clearScheduledTimeout =
    typeof window !== "undefined"
      ? window.clearTimeout.bind(window)
      : globalThis.clearTimeout;

  return new Promise((resolve) => {
    let finished = false;

    function finalize(value) {
      if (finished) {
        return;
      }

      finished = true;
      unsubscribe();
      clearScheduledTimeout(timeoutId);
      resolve(value);
    }

    function readCurrentWallets() {
      return store.getState().wallet.items || [];
    }

    function checkAlignment() {
      const state = store.getState();
      const currentScopeAccountId = normalizeOptionalString(
        state.wallet.scopeAccountId,
      );
      const isFetchInFlight = state.wallet.requestStatus?.fetch === "loading";

      if (
        currentScopeAccountId === normalizedExpectedAccountId &&
        !isFetchInFlight
      ) {
        finalize(readCurrentWallets());
      }
    }

    const unsubscribe = store.subscribe(checkAlignment);
    const timeoutId = scheduleTimeout(
      () => finalize(readCurrentWallets()),
      timeoutMs,
    );

    checkAlignment();
  });
}

async function runBootSequence(dispatch, sessionState, requestedWalletId = "") {
  if (sessionState === "logged_out") {
    return;
  }

  const sessionReady = await ensureAuthFlowReady(dispatch);
  if (!sessionReady) {
    return;
  }

  // 1. Fetch Accounts to establish scope
  await dispatch(fetchAccountsThunk())
    .unwrap()
    .catch(() => null);

  // 2. Fetch wallets for the active scope established by accounts fetch
  let wallets = [];
  try {
    wallets = await dispatch(fetchWalletsThunk())
      .unwrap()
      .then((result) => result?.wallets || []);
  } catch {
    return;
  }

  if (!wallets.length) {
    return;
  }

  await refreshVisibleWalletData(dispatch, {
    requestedWalletId,
    includeTransactions: true,
    refreshBalances: "active",
    transactionScope: "visible",
    forceBalanceRefresh: false,
    forceTransactionRefresh: true,
  });
}

export function useAppDispatch() {
  return useDispatch();
}

export const useAppContext = () => {
  const dispatch = useDispatch();
  const accessToken = useSelector(
    (state) => state.auth.accessToken || state.auth.token,
  );
  const sessionToken = accessToken;
  const refreshToken = useSelector(selectRefreshToken);
  const userId = useSelector(selectUserId);
  const sessionState = useSelector(selectSessionState);
  const appAccessState = useSelector(selectAppAccessState);
  const bootStatus = useSelector(selectBootStatus);
  const activeAccountId = useSelector(selectActiveAccountIdSelector);
  const accountError = useSelector(selectAccountError);
  const accountRequestStatus = useSelector(selectAccountRequestStatus);
  const accountSwitcherRows = useSelector(selectAccountSwitcherRows);
  const activeAccountDisplay = useSelector(selectActiveAccountDisplayModel);
  const wallets = useSelector(selectWallets);
  const walletCards = useSelector(selectWalletCards);
  const walletDisplayRows = useSelector(selectWalletDisplayRows);
  const visibleWalletCards = useSelector(selectVisibleWalletCards);
  const visibleWalletDisplayRows = useSelector(selectVisibleWalletDisplayRows);
  const visibleAssets = useSelector(selectVisibleAssets);
  const visibleAssetsTotalFiat = useSelector(selectVisibleAssetsTotalFiat);
  const activeWallet = useSelector(selectActiveWallet);
  const currentWalletDisplay = useSelector(selectCurrentWalletDisplayModel);
  const activeWalletId = useSelector(selectActiveWalletId);
  const balancesByWalletId = useSelector(selectBalancesByWalletId);
  const activeBalance = useSelector(selectActiveBalance);
  const notifications = useSelector(selectNotifications);
  const unreadNotificationCount = useSelector(selectUnreadNotificationCount);
  const transactions = useSelector(selectVisibleTransactions);
  const assets = useSelector(selectAssets);
  const portfolioRows = useSelector(selectPortfolioRows);
  const walletsLoading = useSelector(selectWalletsLoading);
  const balancesLoading = useSelector(selectBalancesLoading);
  const notificationsLoading = useSelector(selectNotificationsLoading);
  const transactionsLoading = useSelector(selectTransactionsLoading);
  const balancesHaveLoadedOnce = useSelector(selectBalancesHaveLoadedOnce);
  const balanceLastFetchedAt = useSelector(selectBalanceLastFetchedAt);
  const balanceLastFullFetchedAt = useSelector(selectBalanceLastFullFetchedAt);
  const balanceLastFetchedAtByWalletId = useSelector(
    selectBalanceLastFetchedAtByWalletId,
  );
  const notificationsHaveLoadedOnce = useSelector(
    selectNotificationsHaveLoadedOnce,
  );
  const notificationsLastFetchedAt = useSelector(
    selectNotificationsLastFetchedAt,
  );
  const transactionsHaveLoadedOnceByWalletId = useSelector(
    selectTransactionsHaveLoadedOnceByWalletId,
  );
  const transactionsLastFetchedAtByWalletId = useSelector(
    selectTransactionsLastFetchedAtByWalletId,
  );
  const nfts = useSelector(selectActiveWalletNfts);
  const nftMeta = useSelector(selectActiveWalletNftMeta);
  const nftSync = useSelector(selectActiveWalletNftSync);
  const nftsLoading = useSelector(selectActiveWalletNftsLoading);
  const nftsSyncing = useSelector(selectActiveWalletNftsSyncing);
  const nftsError = useSelector(selectActiveWalletNftsError);
  const nftCollections = useSelector(selectActiveWalletNftCollections);
  const nftCollectionsMeta = useSelector(selectActiveWalletNftCollectionsMeta);
  const nftCollectionsSync = useSelector(selectActiveWalletNftCollectionsSync);
  const nftCollectionsLoading = useSelector(
    selectActiveWalletNftCollectionsLoading,
  );
  const nftRefreshState = useSelector(selectActiveWalletNftRefreshState);
  const nftRefreshPending = useSelector(selectActiveWalletNftRefreshPending);
  const nftRefreshError = useSelector(selectActiveWalletNftRefreshError);
  const nftSupportedWallets = useSelector(selectNftSupportedWallets);
  const selectedNftWallet = useSelector(selectSelectedNftWallet);
  const selectedNftWalletId = useSelector(selectSelectedNftWalletId);
  const selectedNft = useSelector(selectSelectedNftItem);
  const selectedNftLoading = useSelector(selectSelectedNftLoading);
  const selectedNftError = useSelector(selectSelectedNftError);
  const nftTransferLoadingByNftId = useSelector(
    (state) => state.nft?.transferLoadingByNftId || {},
  );
  const nftTransferErrorByNftId = useSelector(
    (state) => state.nft?.transferErrorByNftId || {},
  );
  const lastNftTransferResultByNftId = useSelector(
    (state) => state.nft?.lastTransferResultByNftId || {},
  );
  const nftActivityByNftId = useSelector(
    (state) => state.nft?.activityByNftId || {},
  );
  const nftVisibilityLoadingByNftId = useSelector(
    (state) => state.nft?.visibilityLoadingByNftId || {},
  );
  const nftVisibilityErrorByNftId = useSelector(
    (state) => state.nft?.visibilityErrorByNftId || {},
  );
  const lastNftVisibilityResultByNftId = useSelector(
    (state) => state.nft?.lastVisibilityResultByNftId || {},
  );
  const nftFeeEstimateByNftId = useSelector(
    (state) => state.nft?.feeEstimateByNftId || {},
  );
  const appError = useSelector(selectAppError);
  const supportedChains = useSelector(selectSupportedChains);
  const activeChainMeta = useSelector(selectActiveChainMeta);
  const selectedChainCode = useSelector(selectSelectedChainCode);
  const selectedNetworkCode = useSelector(selectSelectedNetworkCode);
  const availableWalletNetworks = useSelector(selectAvailableWalletNetworks);
  const firstSupportedChain = useSelector(selectFirstSupportedChain);
  const currency = useSelector(selectCurrency);
  const supportsDestinationTag = useSelector(selectSupportsDestinationTag);
  const previewData = useSelector(selectPreviewData);
  const autoLockMinutes = useSelector(selectAutoLockMinutes);
  const hasPin = useSelector(selectHasPin);
  const networksForActiveChain = useSelector(selectNetworksForActiveChain);
  const unlockState = useSelector(selectUnlockState);
  const userProfile = useSyncExternalStore(
    subscribeToSettings,
    getProfileSnapshot,
    getProfileSnapshot,
  );
  const preferences = useSyncExternalStore(
    subscribeToSettings,
    getPreferencesSnapshot,
    getPreferencesSnapshot,
  );
  const transactionStatus = useSyncExternalStore(
    subscribeToTransactionStatus,
    getTransactionStatusSnapshot,
    getTransactionStatusSnapshot,
  );

  const refreshApp = useCallback(
    async () => {
      return runInFlightRequest(
        appRefreshInFlight,
        `app:${String(activeWalletId || "").trim() || "visible"}`,
        async () => {
          const ready = await ensureAuthFlowReady(dispatch);
          if (!ready) {
            return [];
          }

        // Re-fetch accounts to ensure we are scoped correctly during a full refresh
        await dispatch(fetchAccountsThunk())
      .unwrap()
      .catch(() => null);

        return refreshVisibleWalletData(dispatch, {
          refreshWallets: true,
          requestedWalletId: activeWalletId,
          includeTransactions: true,
          refreshBalances: "all",
          transactionScope: "visible",
          forceBalanceRefresh: false,
          forceTransactionRefresh: true,
        });
        },
        "Failed to refresh app data",
      );
  }, [activeWalletId, dispatch]);

  const startSession = useCallback(
    async () => startBackendSession(dispatch),
    [dispatch],
  );

  const prepareAuthSession = useCallback(
    async (options = {}) => ensureAuthFlowReady(dispatch, options),
    [dispatch],
  );

  const refreshAccounts = useCallback(
    async (params = {}) =>
      dispatch(fetchAccountsThunk(params))
        .unwrap()
        .catch(() => store.getState().account.items || []),
    [dispatch],
  );

  const activateAccountScope = useCallback(
    async (account, options = {}) => {
      const previousState = store.getState();
      const previousActiveAccountId = normalizeOptionalString(
        previousState.account.activeAccountId,
      );
      const nextAccount =
        account && typeof account === "object"
          ? account
          : {
            id: account,
          };
      const nextAccountId = normalizeOptionalString(
        nextAccount?.id || nextAccount?.accountId,
      );

      if (!nextAccountId) {
        return [];
      }

      // Race condition guard: handle rapid repeated switching
      const existingSwitch = accountSwitchInFlight.get(nextAccountId);
      if (existingSwitch) return existingSwitch;

      const switchPromise = (async () => {
        try {
          dispatch(
            upsertAccount({
              ...nextAccount,
              id: nextAccountId,
            }),
          );
          dispatch(setActiveAccount(nextAccountId));

          const token = getCurrentSessionToken();
          if (!token) {
            return [];
          }

          const requestedWalletId = normalizeOptionalString(
            options.requestedWalletId,
          );
          const currentAlignedWallets = readWalletScopeSnapshot(nextAccountId);

          if (
            options.reuseLoadedScope === true &&
            hasWalletInScope(currentAlignedWallets, requestedWalletId)
          ) {
            if (requestedWalletId) {
              dispatch(setActiveWalletId(requestedWalletId));
            }

            return currentAlignedWallets;
          }

          const targetAccountKnown = (
            store.getState().account.items || []
          ).some(
            (account) => normalizeOptionalString(account?.id) === nextAccountId,
          );

          if (!targetAccountKnown) {
            await dispatch(fetchAccountsThunk())
              .unwrap()
              .catch(() => null);
          }

          let alignedWallets = currentAlignedWallets;

          if (!hasWalletInScope(alignedWallets, requestedWalletId)) {
            const scopedWallets = await fetchScopedWallets(dispatch, nextAccountId);
            alignedWallets =
              normalizeOptionalString(
                store.getState().wallet.scopeAccountId,
              ) === nextAccountId
                ? scopedWallets
                : await waitForWalletScopeAlignment(nextAccountId);
          }

          if (
            normalizeOptionalString(store.getState().wallet.scopeAccountId) !==
            nextAccountId
          ) {
            throw new Error("Failed to switch to the new account domain");
          }

          if (!alignedWallets.length) {
            // Note: Some accounts might genuinely have no wallets yet, but we usually expect at least one
            // If they are strictly required, uncomment: throw new Error("No wallets found for this account");
          }

          await refreshVisibleWalletData(dispatch, {
            requestedWalletId:
              (requestedWalletId &&
                alignedWallets.some(
                  (wallet) => wallet.walletId === requestedWalletId,
                )
                ? requestedWalletId
                : "") ||
              alignedWallets[0]?.walletId ||
              "",
            includeTransactions: true,
            refreshBalances: "active",
            transactionScope: "visible",
            forceBalanceRefresh: false,
            forceTransactionRefresh: true,
          });

          const settledState = store.getState();
          const finalActiveAccountId = normalizeOptionalString(
            settledState.account.activeAccountId,
          );
          const finalWalletScopeAccountId = normalizeOptionalString(
            settledState.wallet.scopeAccountId,
          );

          if (
            finalActiveAccountId !== nextAccountId ||
            finalWalletScopeAccountId !== nextAccountId
          ) {
            throw new Error("Account scope reconciliation failed");
          }

          return alignedWallets;
        } catch (error) {
          // Revert to previous account on failure
          if (previousActiveAccountId) {
            dispatch(setActiveAccount(previousActiveAccountId));
            await fetchScopedWallets(dispatch, previousActiveAccountId).catch(() => null);
          } else {
            dispatch(clearActiveAccount());
          }
          throw error;
        } finally {
          accountSwitchInFlight.delete(nextAccountId);
        }
      })();

      accountSwitchInFlight.set(nextAccountId, switchPromise);
      return switchPromise;
    },
    [dispatch],
  );

  const createAccount = useCallback(
    async (payload = {}) => {
      const ready = await ensureAuthFlowReady(dispatch);
      if (!ready) {
        throw new Error("Unable to prepare account session");
      }

      return dispatch(createAccountThunk(payload)).unwrap();
    },
    [dispatch],
  );

  const importAccount = useCallback(
    async (payload = {}) => {
      const ready = await ensureAuthFlowReady(dispatch);
      if (!ready) {
        throw new Error("Unable to prepare account session");
      }

      return dispatch(importAccountThunk(payload)).unwrap();
    },
    [dispatch],
  );

  const generateMnemonic = useCallback(async () => {
    const ready = await ensureAuthFlowReady(dispatch);
    if (!ready) {
      throw new Error("Unable to prepare account session");
    }

    const token = getCurrentSessionToken();
    return generateAccountMnemonicApi(token);
  }, [dispatch]);

  const rollbackIncompleteAccount = useCallback(
    async (accountId) => {
      const ready = await ensureAuthFlowReady(dispatch);
      if (!ready) {
        throw new Error("Unable to prepare account session");
      }

      const token = getCurrentSessionToken();
      return rollbackIncompleteAccountApi(token, accountId);
    },
    [dispatch],
  );

  const refreshWallets = useCallback(
    async () =>
      dispatch(fetchWalletsThunk())
        .unwrap()
        .then((result) => result?.wallets || []),
    [dispatch],
  );

  const refreshBalances = useCallback(
    async () =>
      runInFlightRequest(
        balanceRefreshInFlight,
        `balances:${String(activeWalletId || "").trim() || "visible"}`,
        () =>
          refreshVisibleWalletData(dispatch, {
            requestedWalletId: activeWalletId,
            includeTransactions: false,
            refreshBalances: "visible",
            forceBalanceRefresh: false,
          }),
        "Failed to refresh balances",
      ),
    [activeWalletId, dispatch],
  );

  const loadTransactions = useCallback(
    async (walletId = "") => {
      if (walletId) {
        return dispatch(fetchTransactionsThunk(walletId)).unwrap();
      }

      return dispatch(fetchUserTransactionsThunk({})).unwrap();
    },
    [dispatch],
  );

  const refreshTransactions = useCallback(
    async (walletId = "") => {
      if (walletId) {
        return dispatch(refreshWalletTransactionsThunk(walletId)).unwrap();
      }

      return dispatch(refreshUserTransactionsThunk({})).unwrap();
    },
    [dispatch],
  );

  const refreshNfts = useCallback(
    async (params = {}) => {
      const targetWalletId = params.walletId || selectedNftWallet?.walletId;
      const targetChain = normalizeNftChain(params.chain || selectedNftWallet?.chain || "");

      if (!targetWalletId || !targetChain) {
        return null;
      }

      if (!isNftSupportedChain(targetChain)) {
        return null;
      }

      return dispatch(
        fetchWalletNftsThunk({
          ...params,
          walletId: targetWalletId,
          chain: targetChain,
        }),
      ).unwrap();
    },
    [dispatch, selectedNftWallet],
  );

  const syncNfts = useCallback(
    async (params = {}) => {
      const targetWalletId = params.walletId || selectedNftWallet?.walletId;
      const targetChain = normalizeNftChain(
        params.chain || selectedNftWallet?.chain || "polygon"
      );

      if (!targetWalletId) {
        return null;
      }

      if (targetChain && !isNftSupportedChain(targetChain)) {
        return null;
      }

      return dispatch(
        requestWalletNftRefreshThunk({
          walletId: targetWalletId,
          chain: targetChain || "polygon",
          source: params.source || "syncNfts",
        }),
      ).unwrap();
    },
    [dispatch, selectedNftWallet]
  );

  const requestWalletNftRefresh = useCallback(
    async (params = {}) => {
      const targetWalletId = params.walletId || selectedNftWallet?.walletId;
      const targetChain = normalizeNftChain(
        params.chain || selectedNftWallet?.chain || "polygon"
      );

      if (!targetWalletId) {
        return null;
      }

      if (targetChain && !isNftSupportedChain(targetChain)) {
        return null;
      }

      return dispatch(
        requestWalletNftRefreshThunk({
          walletId: targetWalletId,
          chain: targetChain || "polygon",
          source:
            params.source ||
            (params.reason ? `useNftAutoSync:${params.reason}` : "frontend_manual"),
        }),
      ).unwrap();
    },
    [dispatch, selectedNftWallet]
  );

  const refreshNftCollections = useCallback(
    async (params = {}) => {
      const targetWalletId = params.walletId || selectedNftWallet?.walletId;
      const targetChain = normalizeNftChain(params.chain || selectedNftWallet?.chain || "");

      if (!targetWalletId || !targetChain) {
        return null;
      }

      if (!isNftSupportedChain(targetChain)) {
        return null;
      }

      return dispatch(
        fetchWalletNftCollectionsThunk({
          ...params,
          walletId: targetWalletId,
          chain: targetChain,
        }),
      ).unwrap();
    },
    [dispatch, selectedNftWallet],
  );

  const fetchNftCollectionDetail = useCallback(
    async (params = {}) => {
      const targetWalletId = params.walletId || selectedNftWallet?.walletId;
      const targetChain = normalizeNftChain(
        params.chain || selectedNftWallet?.chain || "polygon",
      );
      const targetContractAddress = String(params.contractAddress || "").trim();

      if (!targetWalletId || !targetChain || !targetContractAddress) {
        return null;
      }

      if (!isNftSupportedChain(targetChain)) {
        return null;
      }

      return dispatch(
        fetchWalletNftCollectionDetailThunk({
          ...params,
          walletId: targetWalletId,
          contractAddress: targetContractAddress,
          chain: targetChain,
        }),
      ).unwrap();
    },
    [dispatch, selectedNftWallet],
  );

  const fetchNftDetail = useCallback(
    (id) => {
      if (!id) {
        return null;
      }

      return dispatch(fetchNftByIdThunk(String(id)));
    },
    [dispatch],
  );

  const clearSelectedNft = useCallback(
    () => dispatch(clearSelectedNftAction()),
    [dispatch],
  );

  const clearNftTransferState = useCallback(
    (nftId = "") => dispatch(clearNftTransferStateAction(nftId)),
    [dispatch],
  );

  const clearNftFeeEstimateState = useCallback(
    (nftId = "") => dispatch(clearNftFeeEstimateStateAction(nftId)),
    [dispatch],
  );

  const fetchNftActivityFeed = useCallback(
    async ({ nftId, page = 1, limit = 20 } = {}) => {
      const targetNftId = normalizeOptionalString(nftId);

      if (!targetNftId) {
        return null;
      }

      return dispatch(
        fetchNftActivityFeedThunk({
          nftId: targetNftId,
          page,
          limit,
        }),
      ).unwrap();
    },
    [dispatch],
  );

  const setNftHidden = useCallback(
    async ({ nftId, hidden = true } = {}) => {
      const targetNftId = normalizeOptionalString(nftId);

      if (!targetNftId) {
        throw new Error("NFT id is required");
      }

      return dispatch(
        hideNftThunk({
          nftId: targetNftId,
          hidden,
        }),
      ).unwrap();
    },
    [dispatch],
  );

  const estimateNftTransferFee = useCallback(
    async ({ walletId, nftId, toAddress, amount = "1" } = {}) => {
      const targetWalletId = normalizeOptionalString(walletId);
      const targetNftId = normalizeOptionalString(nftId);
      const targetAddress = String(toAddress || "").trim();

      if (!targetWalletId) {
        throw new Error("Wallet id is required");
      }

      if (!targetNftId) {
        throw new Error("NFT id is required");
      }

      if (!targetAddress) {
        throw new Error("Recipient address is required");
      }

      return dispatch(
        estimateNftTransferFeeThunk({
          walletId: targetWalletId,
          nftId: targetNftId,
          toAddress: targetAddress,
          amount: String(amount || "1"),
        }),
      ).unwrap();
    },
    [dispatch],
  );

  const transferNft = useCallback(
    async (payload = {}) => {
      const walletId = normalizeOptionalString(
        payload.walletId || selectedNft?.walletId || selectedNftWallet?.walletId,
      );
      const nftId = normalizeOptionalString(payload.nftId || selectedNft?.id);
      const toAddress = String(payload.toAddress || "").trim();
      const amount = String(payload.amount || "1").trim();
      const targetChain = normalizeNftChain(
        payload.chain || selectedNft?.chain || selectedNftWallet?.chain || "",
      );

      if (!walletId) {
        throw new Error("Wallet id is required");
      }

      if (!nftId) {
        throw new Error("NFT id is required");
      }

      if (!toAddress) {
        throw new Error("Recipient address is required");
      }

      await ensureAuthFlowReady(dispatch);

      const result = await runInFlightRequest(
        nftTransferInFlight,
        buildNftTransferRequestKey({
          walletId,
          nftId,
          toAddress,
          amount,
        }),
        () =>
          dispatch(
            transferNftThunk({
              walletId,
              nftId,
              toAddress,
              amount,
            }),
          ).unwrap(),
        "Failed to submit NFT transfer",
      );

      await Promise.allSettled([
        refreshNfts({
          walletId,
          chain: targetChain,
        }),
        refreshNftCollections({
          walletId,
          chain: targetChain,
        }),
        refreshTransactions(walletId),
        selectedNft?.contractAddress
          ? fetchNftCollectionDetail({
            walletId,
            chain: targetChain,
            contractAddress: selectedNft.contractAddress,
          })
          : Promise.resolve(null),
      ]);

      return result;
    },
    [
      dispatch,
      refreshNfts,
      refreshNftCollections,
      fetchNftCollectionDetail,
      refreshTransactions,
      selectedNft,
      selectedNftWallet,
    ],
  );

  const refreshNotifications = useCallback(
    async (query = {}, options = {}) => {
      const shouldSkipFetch =
        !options.force &&
        notificationsHaveLoadedOnce &&
        isFreshEnough(notificationsLastFetchedAt, NOTIFICATION_FRESHNESS_MS);

      if (shouldSkipFetch) {
        const state = store.getState();

        return {
          items: state.notification.items || [],
          meta: state.notification.meta || {},
        };
      }

      return dispatch(fetchNotificationsThunk(query)).unwrap();
    },
    [dispatch, notificationsHaveLoadedOnce, notificationsLastFetchedAt],
  );

  const refreshUnreadNotificationCount = useCallback(
    async () => dispatch(fetchUnreadNotificationCountThunk()).unwrap(),
    [dispatch],
  );

  const markNotificationRead = useCallback(
    async (notificationId) =>
      dispatch(markNotificationReadThunk(notificationId)).unwrap(),
    [dispatch],
  );

  const markAllNotificationsRead = useCallback(
    async () => dispatch(markAllNotificationsReadThunk()).unwrap(),
    [dispatch],
  );

  const clearAllNotifications = useCallback(
    async () => dispatch(clearAllNotificationsThunk()).unwrap(),
    [dispatch],
  );

  const fetchTransactionDetails = useCallback(
    async (transactionId) => {
      if (!sessionToken) {
        throw new Error("Session token missing");
      }

      const transaction = normalizeTransactionDetail(
        await getTransactionById(sessionToken, transactionId),
      );
      const wallet =
        wallets.find(
          (item) => item.walletId === String(transaction.walletId),
        ) ||
        wallets.find(
          (item) =>
            item.address === transaction.fromAddress ||
            item.address === transaction.toAddress,
        ) ||
        null;
      const balance = wallet
        ? balancesByWalletId[wallet.walletId] || null
        : null;
      const chainMeta = getChainMeta(wallet?.chain, supportedChains);

      return normalizeTransaction(transaction, wallet, balance, chainMeta);
    },
    [balancesByWalletId, sessionToken, supportedChains, wallets],
  );

  const getWalletDetails = useCallback(
    async (walletId) => getWalletDetailsApi(sessionToken, walletId),
    [sessionToken],
  );

  const createWalletInit = useCallback(
    async (payload, options = {}) => {
      await ensureAuthFlowReady(dispatch, {
        forceChains: Boolean(options?.forceAuthSession),
      });

      const requestKey = buildWalletCreateInitRequestKey(payload);
      const shouldForce = Boolean(options?.force);

      if (shouldForce) {
        walletCreateInitClientFailures.delete(requestKey);
        walletCreateInitSuccessCache.delete(requestKey);
      }

      const cachedResult = walletCreateInitSuccessCache.get(requestKey);
      if (cachedResult) {
        return cachedResult;
      }

      const blockedError = walletCreateInitClientFailures.get(requestKey);
      if (blockedError) {
        throw blockedError;
      }

      try {
        const result = await runInFlightRequest(
          walletCreateInitInFlight,
          requestKey,
          () => dispatch(createWalletInitThunk(payload)).unwrap(),
          "Failed to create wallet",
        );

        walletCreateInitClientFailures.delete(requestKey);
        walletCreateInitSuccessCache.set(requestKey, result);
        return result;
      } catch (error) {
        const normalizedError = normalizeRequestError(
          error,
          "Failed to create wallet",
        );

        if (isClientRequestError(normalizedError)) {
          walletCreateInitClientFailures.set(requestKey, normalizedError);
        }

        throw normalizedError;
      }
    },
    [dispatch],
  );

  const getCachedWalletInit = useCallback((payload) => {
    return (
      walletCreateInitSuccessCache.get(
        buildWalletCreateInitRequestKey(payload),
      ) || null
    );
  }, []);

  const resetCreateWalletInit = useCallback((payload) => {
    walletCreateInitClientFailures.delete(
      buildWalletCreateInitRequestKey(payload),
    );
  }, []);

  const confirmWalletCreate = useCallback(
    async (payload) => dispatch(confirmWalletThunk(payload)).unwrap(),
    [dispatch],
  );

  const importWallet = useCallback(
    async (payload) => {
      await ensureAuthFlowReady(dispatch);

      return dispatch(importWalletThunk(payload)).unwrap();
    },
    [dispatch],
  );

  const createHbarWalletOnDemand = useCallback(
    async (payload = {}) => {
      await ensureAuthFlowReady(dispatch);

      const result = await createHbarWalletOnDemandApi(getCurrentSessionToken(), payload);
      const requestedWalletId = normalizeOptionalString(result?.walletId);
      const targetAccountId = normalizeOptionalString(
        payload?.accountId || result?.accountId || store.getState().account.activeAccountId,
      );

      if (targetAccountId && targetAccountId !== normalizeOptionalString(store.getState().account.activeAccountId)) {
        await activateAccountScope(targetAccountId, {
          requestedWalletId: requestedWalletId || "",
        });
      } else {
        await refreshVisibleWalletData(dispatch, {
          refreshWallets: true,
          requestedWalletId: requestedWalletId || "",
          includeTransactions: true,
        });
      }

      return result;
    },
    [activateAccountScope, dispatch],
  );

  const fetchReceivePayload = useCallback(
    async (walletId, amount, query) =>
      fetchReceivePayloadApi(sessionToken, walletId, amount, query),
    [sessionToken],
  );

  const fetchReceiveQr = useCallback(
    async (walletId, amount, query) =>
      fetchReceiveQrApi(sessionToken, walletId, amount, query),
    [sessionToken],
  );

  const validateDestination = useCallback(
    async (payload) => {
      await ensureAuthFlowReady(dispatch);

      return runInFlightRequest(
        transactionValidateInFlight,
        buildTransactionRequestKey(payload),
        () => dispatch(validateDestinationThunk(payload)).unwrap(),
        "Failed to validate destination",
      );
    },
    [dispatch],
  );

  const previewTransaction = useCallback(
    async (payload) => {
      await ensureAuthFlowReady(dispatch);

      return runInFlightRequest(
        transactionPreviewInFlight,
        buildTransactionRequestKey(payload),
        () => dispatch(previewTransactionThunk(payload)).unwrap(),
        "Failed to preview transaction",
      );
    },
    [dispatch],
  );

  const sendTransaction = useCallback(
    async (payload) => {
      await ensureAuthFlowReady(dispatch);

      return runInFlightRequest(
        transactionSendInFlight,
        buildTransactionRequestKey(payload),
        () => dispatch(sendTransactionThunk(payload)).unwrap(),
        "Failed to send transaction",
      );
    },
    [dispatch],
  );

  const getSwapPairs = useCallback(
    async () => {
      await ensureAuthFlowReady(dispatch);
      return getSwapPairsApi(sessionToken);
    },
    [dispatch, sessionToken],
  );

  const previewSwap = useCallback(
    async (payload) => {
      await ensureAuthFlowReady(dispatch);
      return previewSwapApi(sessionToken, payload);
    },
    [dispatch, sessionToken],
  );

  const reviewSwap = useCallback(
    async (payload) => {
      await ensureAuthFlowReady(dispatch);
      return reviewSwapApi(sessionToken, payload);
    },
    [dispatch, sessionToken],
  );

  const executeSwap = useCallback(
    async (payload) => {
      await ensureAuthFlowReady(dispatch);
      return executeSwapApi(sessionToken, payload);
    },
    [dispatch, sessionToken],
  );

  const getSwapById = useCallback(
    async (swapId) => {
      await ensureAuthFlowReady(dispatch);
      return getSwapByIdApi(sessionToken, swapId);
    },
    [dispatch, sessionToken],
  );



  const renameAccount = useCallback(
    async (accountId, payload = {}) => {
      const nextAccountId = normalizeOptionalString(accountId);
      if (!nextAccountId) {
        throw new Error("Account id is required");
      }

      const result = await dispatch(
        renameAccountThunk({
          accountId: nextAccountId,
          ...payload,
        }),
      ).unwrap();

      await refreshAccounts().catch(() => null);
      return result;
    },
    [dispatch, refreshAccounts],
  );

  const archiveAccount = useCallback(
    async (accountId) => {
      const targetAccountId = normalizeOptionalString(accountId);
      if (!targetAccountId) {
        throw new Error("Account id is required");
      }

      const previousState = store.getState();
      const previousActiveAccountId = normalizeOptionalString(
        previousState.account.activeAccountId,
      );
      const previousRequestedWalletId = normalizeOptionalString(
        previousState.wallet.activeWalletId,
      );

      const result = await dispatch(
        archiveAccountThunk(targetAccountId),
      ).unwrap();
      await refreshAccounts().catch(() => null);

      const nextState = store.getState();
      const nextActiveAccountId = normalizeOptionalString(
        nextState.account.activeAccountId,
      );

      if (
        previousActiveAccountId &&
        previousActiveAccountId === targetAccountId
      ) {
        if (!nextActiveAccountId) {
          dispatch(setActiveWalletId(""));
          return result;
        }

        // Use the robust activation flow to switch to the fallback account
        await activateAccountScope(nextActiveAccountId, {
          requestedWalletId: previousRequestedWalletId,
        }).catch(() => null);
      }

      return result;
    },
    [dispatch, refreshAccounts],
  );

  const selectAccount = useCallback(
    async (accountId) => {
      const nextAccountId = normalizeOptionalString(accountId);
      const currentAccountId = normalizeOptionalString(
        store.getState().account.activeAccountId,
      );

      if (!nextAccountId || nextAccountId === currentAccountId) {
        return;
      }

      try {
        await activateAccountScope(nextAccountId);
      } catch (error) {
        console.error("Failed to selection account:", error);
      }
    },
    [activateAccountScope],
  );

  const selectWallet = useCallback(
    async (selection) => {
      const state = store.getState();
      const { walletId, wallet } = normalizeWalletSelectionInput(selection);
      const nextWalletId =
        wallet || state.wallet.items.some((item) => item.walletId === walletId)
          ? walletId
          : "";
      const targetAccountId = normalizeOptionalString(
        wallet?.accountId ||
        state.wallet.items.find((item) => item.walletId === nextWalletId)
          ?.accountId,
      );
      const currentAccountId = normalizeOptionalString(
        state.account.activeAccountId,
      );

      if (!nextWalletId) {
        dispatch(setActiveWalletId(""));
        return;
      }

      if (targetAccountId && targetAccountId !== currentAccountId) {
        await activateAccountScope(targetAccountId, {
          requestedWalletId: nextWalletId,
        });
        return;
      }

      dispatch(setActiveWalletId(nextWalletId));

      if (!sessionToken) {
        return;
      }

      await refreshVisibleWalletData(dispatch, {
        requestedWalletId: nextWalletId,
        includeTransactions: true,
        refreshBalances: "active",
        transactionScope: "active",
      });
    },
    [dispatch, sessionToken],
  );

  const selectNetwork = useCallback(
    (networkCode) => dispatch(setSelectedNetwork(networkCode || "")),
    [dispatch],
  );

  const logout = useCallback(
    async ({ revokeAll = false, reason = "manual" } = {}) => {
      clearTransientRequestGuards();

      return logoutAndClearSession({
        dispatch,
        persistor,
        accessToken,
        refreshToken,
        revokeAll,
        reason,
      });
    },
    [accessToken, dispatch, refreshToken],
  );

  const updateUserProfile = useCallback((updates) => {
    writeStoredJson(PROFILE_STORAGE_KEY, {
      ...getProfileSnapshot(),
      ...(updates || {}),
    });
  }, []);

  const setFiatCurrency = useCallback((nextCurrency) => {
    writeStoredJson(PREFERENCES_STORAGE_KEY, {
      ...getPreferencesSnapshot(),
      fiatCurrency: nextCurrency || "$",
    });
  }, []);

  const setLanguage = useCallback((nextLanguage) => {
    writeStoredJson(PREFERENCES_STORAGE_KEY, {
      ...getPreferencesSnapshot(),
      language: nextLanguage || "English",
    });
  }, []);

  const showTransactionStatus = useCallback(
    (payload = {}) => showTransactionStatusSnapshot(payload),
    [],
  );

  const updateTransactionStatus = useCallback(
    (patch = {}) => updateTransactionStatusSnapshot(patch),
    [],
  );

  const closeTransactionStatus = useCallback(
    (reason = "close") => closeTransactionStatusSnapshot(reason),
    [],
  );

  const hasDismissedSwapSubmitted = useCallback(
    (value = "") => hasDismissedSwapSubmittedSnapshot(value),
    [],
  );

  const markSwapSubmittedDismissed = useCallback(
    (value = "") => markSwapSubmittedDismissedSnapshot(value),
    [],
  );

  const configureLocalUnlock = useCallback(
    (payload) => dispatch(configureQuickUnlock(payload || {})),
    [dispatch],
  );

  const savePin = useCallback(
    async (pin) => {
      const credentials = await generatePinCredentials(pin);
      dispatch(
        setPinCredential({
          ...credentials,
          pinConfiguredAt: new Date().toISOString(),
        }),
      );

      return true;
    },
    [dispatch],
  );

  const unlockWithPin = useCallback(
    async (pin) => {
      const isValid = await verifyStoredPin(
        pin,
        unlockState.pinHash,
        unlockState.pinSalt,
        unlockState.pinAlgorithm,
      );

      if (!isValid) {
        dispatch(registerUnlockFailure());
        return false;
      }

      dispatch(clearAppInactive());
      dispatch(setLocalUnlockState(true));
      return true;
    },
    [
      dispatch,
      unlockState.pinAlgorithm,
      unlockState.pinHash,
      unlockState.pinSalt,
    ],
  );

  const changePin = useCallback(
    async (currentPin, nextPin) => {
      const isValid = await verifyStoredPin(
        currentPin,
        unlockState.pinHash,
        unlockState.pinSalt,
        unlockState.pinAlgorithm,
      );

      if (!isValid) {
        throw new Error("Current PIN is incorrect");
      }

      if (currentPin === nextPin) {
        throw new Error("New PIN must be different from current PIN");
      }

      const credentials = await generatePinCredentials(nextPin);
      dispatch(
        setPinCredential({
          ...credentials,
          pinConfiguredAt:
            unlockState.pinConfiguredAt || new Date().toISOString(),
        }),
      );

      return true;
    },
    [
      dispatch,
      unlockState.pinAlgorithm,
      unlockState.pinConfiguredAt,
      unlockState.pinHash,
      unlockState.pinSalt,
    ],
  );

  const setAutoLockPreference = useCallback(
    (minutes) => dispatch(setAutoLockMinutes(minutes)),
    [dispatch],
  );

  const setBiometricEnabled = useCallback(
    (enabled) => dispatch(setBiometricPreference(Boolean(enabled))),
    [dispatch],
  );

  const setLocalUnlockEnabled = useCallback(
    (isUnlocked) => dispatch(setLocalUnlockState(Boolean(isUnlocked))),
    [dispatch],
  );

  const setSelectedNftWallet = useCallback(
    (walletId) => dispatch(setSelectedNftWalletId(String(walletId || ""))),
    [dispatch],
  );

  const marketplaceListings = useSelector((state) => state.nft.marketplaceListings);
  const marketplaceMeta = useSelector((state) => state.nft.marketplaceMeta);
  const marketplaceLoading = useSelector((state) => state.nft.marketplaceLoading);
  const marketplaceError = useSelector((state) => state.nft.marketplaceError);
  const myListings = useSelector((state) => state.nft.myListings);
  const myListingsMeta = useSelector((state) => state.nft.myListingsMeta);
  const myListingsLoading = useSelector((state) => state.nft.myListingsLoading);
  const myListingsError = useSelector((state) => state.nft.myListingsError);
  const myOrders = useSelector((state) => state.nft.myOrders);
  const myOrdersMeta = useSelector((state) => state.nft.myOrdersMeta);
  const myOrdersLoading = useSelector((state) => state.nft.myOrdersLoading);
  const myOrdersError = useSelector((state) => state.nft.myOrdersError);

  const listNftLoading = useSelector((state) => state.nft.listNftLoading);
  const listNftError = useSelector((state) => state.nft.listNftError);
  const buyNftLoading = useSelector((state) => state.nft.buyNftLoading);
  const buyNftError = useSelector((state) => state.nft.buyNftError);
  const cancelListingLoading = useSelector((state) => state.nft.cancelListingLoading);
  const cancelListingError = useSelector((state) => state.nft.cancelListingError);

  const fetchMarketplaceListings = useCallback(
    (params) => dispatch(fetchMarketplaceListingsThunk(params)).unwrap(),
    [dispatch],
  );

  const fetchMyMarketplaceListings = useCallback(
    (params) => dispatch(fetchMyMarketplaceListingsThunk(params)).unwrap(),
    [dispatch],
  );

  const fetchMyMarketplaceOrders = useCallback(
    (params) => dispatch(fetchMyMarketplaceOrdersThunk(params)).unwrap(),
    [dispatch],
  );

  const listNftForSale = useCallback(
    (params) => dispatch(listNftForSaleThunk(params)).unwrap(),
    [dispatch],
  );

  const buyNftAction = useCallback(
    (params) => dispatch(buyNftThunk(params)).unwrap(),
    [dispatch],
  );

  const cancelNftListing = useCallback(
    (params) => dispatch(cancelNftListingThunk(params)).unwrap(),
    [dispatch],
  );

  const clearLocalUnlock = useCallback(
    () => dispatch(clearUnlockState()),
    [dispatch],
  );

  // Minimal Aptos-only detection helper for existing users
  const checkAptosWalletMissing = useCallback(() => {
    const hasAptosSupported = supportedChains.some(
      (chain) => String(chain?.code || "").toLowerCase() === "aptos",
    );
    const hasAptosWallet = wallets.some(
      (wallet) => String(wallet?.chain || "").toLowerCase() === "aptos",
    );

    return hasAptosSupported && !hasAptosWallet;
  }, [supportedChains, wallets]);

  return {
    bootStatus,
    appAccessState,
    sessionState,
    session:
      accessToken || refreshToken || userId || sessionState === "active"
        ? {
          token: accessToken,
          accessToken: accessToken,
          refreshToken,
          userId,
          sessionState,
        }
        : null,
    activeAccountId,
    accountError,
    accountRequestStatus,
    accountSwitcherRows,
    activeAccountDisplay,
    wallets,
    walletCards,
    walletDisplayRows,
    visibleWalletCards,
    visibleWalletDisplayRows,
    visibleAssets,
    visibleAssetsTotalFiat,
    activeWallet,
    currentWalletDisplay,
    activeWalletId,
    activateAccountScope,
    renameAccount,
    archiveAccount,
    selectAccount,
    selectWallet,
    selectNetwork,
    balancesByWalletId,
    notifications,
    unreadNotificationCount,
    activeBalance,
    transactions,
    transactionStatus,
    assets,
    portfolioRows,
    nfts,
    nftMeta,
    nftSync,
    nftsLoading,
    nftsSyncing,
    nftsError,
    nftCollections,
    nftCollectionsMeta,
    nftCollectionsSync,
    nftCollectionsLoading,
    nftRefreshState,
    nftRefreshPending,
    nftRefreshError,
    nftSupportedWallets,
    selectedNftWallet,
    selectedNftWalletId,
    selectedNft,
    selectedNftLoading,
    selectedNftError,
    nftTransferLoadingByNftId,
    nftTransferErrorByNftId,
    lastNftTransferResultByNftId,
    nftActivityByNftId,
    nftVisibilityLoadingByNftId,
    nftVisibilityErrorByNftId,
    lastNftVisibilityResultByNftId,
    nftFeeEstimateByNftId,
    setSelectedNftWallet,
    fiatCurrency: preferences.fiatCurrency || "$",
    walletsLoading,
    balancesLoading,
    balancesHaveLoadedOnce,
    balanceLastFetchedAt,
    balanceLastFullFetchedAt,
    balanceLastFetchedAtByWalletId,
    notificationsLoading,
    notificationsHaveLoadedOnce,
    notificationsLastFetchedAt,
    transactionsLoading,
    transactionsHaveLoadedOnceByWalletId,
    transactionsLastFetchedAtByWalletId,
    appError,
    startSession,
    prepareAuthSession,
    refreshAccounts,
    createAccount,
    importAccount,
    generateMnemonic,
    rollbackIncompleteAccount,
    refreshApp,
    refreshWallets,
    refreshBalances,
    loadTransactions,
    refreshNotifications,
    refreshNfts,
    syncNfts,
    requestWalletNftRefresh,
    refreshNftCollections,
    fetchNftCollectionDetail,
    fetchNftDetail,
    fetchNftActivityFeed,
    setNftHidden,
    estimateNftTransferFee,
    clearSelectedNft,
    clearNftFeeEstimateState,
    transferNft,
    clearNftTransferState,
    marketplaceListings,
    marketplaceMeta,
    marketplaceLoading,
    marketplaceError,
    myListings,
    myListingsMeta,
    myListingsLoading,
    myListingsError,
    myOrders,
    myOrdersMeta,
    myOrdersLoading,
    myOrdersError,
    listNftLoading,
    listNftError,
    buyNftLoading,
    buyNftError,
    cancelListingLoading,
    cancelListingError,
    fetchMarketplaceListings,
    fetchMyMarketplaceListings,
    fetchMyMarketplaceOrders,
    listNftForSale,
    buyNft: buyNftAction,
    cancelNftListing,
    refreshUnreadNotificationCount,
    refreshTransactions,
    markNotificationRead,
    markAllNotificationsRead,
    clearAllNotifications,
    fetchTransactionDetails,
    getWalletDetails,
    createWalletInit,
    getCachedWalletInit,
    resetCreateWalletInit,
    confirmWalletCreate,
    importWallet,
    createHbarWalletOnDemand,
    fetchReceivePayload,
    fetchReceiveQr,
    validateDestination,
    previewTransaction,
    sendTransaction,
    getSwapPairs,
    previewSwap,
    reviewSwap,
    executeSwap,
    getSwapById,
    userProfile,
    updateUserProfile,
    language: preferences.language || "English",
    setFiatCurrency,
    setLanguage,
    showTransactionStatus,
    updateTransactionStatus,
    closeTransactionStatus,
    hasDismissedSwapSubmitted,
    markSwapSubmittedDismissed,
    supportedChains,
    selectedChainCode,
    selectedNetworkCode,
    availableWalletNetworks,
    activeChainMeta,
    currency,
    supportsDestinationTag,
    networksForActiveChain,
    firstSupportedChain,
    defaultNetworkForFirstChain: selectDefaultNetworkForChain(
      firstSupportedChain?.id,
      supportedChains,
    ),
    previewData,
    logout,
    unlockState,
    hasPin,
    autoLockMinutes,
    changePin,
    configureLocalUnlock,
    savePin,
    setLocalUnlockEnabled,
    setAutoLockPreference,
    setBiometricEnabled,
    unlockWithPin,
    clearLocalUnlock,
    checkAptosWalletMissing,
  };
};

export function useBootApp() {
  const { refreshApp } = useAppContext();
  return refreshApp;
}
