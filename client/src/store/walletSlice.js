import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import {
  confirmWalletCreate,
  createWalletInit,
  importWallet,
  listWallets,
} from "../api/wallet";
import { getNetworkLabel } from "../config/chains";
import {
  getVisibleWalletIdsFromState,
  hasLoadedBalanceEntry,
  hydrateVisibleWalletBalancesThunk,
} from "./balanceSlice";
import { fetchTransactionsThunk } from "./transactionSlice";

const initialState = {
  items: [],
  activeWalletId: "",
  scopeAccountId: null,
  requestedScopeAccountId: null,
  requestStatus: {
    fetch: "idle",
  },
  selectedNetwork: "",
  status: "idle",
  error: "",
};

function serializeRequestError(error, fallbackMessage) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : fallbackMessage;

  return {
    message,
    status: Number(error?.status || 0) || 0,
    payload: error?.payload && typeof error.payload === "object" ? error.payload : null,
  };
}

export function truncateAddress(address = "", start = 6, end = 4) {
  if (!address) {
    return "";
  }

  if (address.length <= start + end) {
    return address;
  }

  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function getWalletDisplayLabel(network = "") {
  const normalizedNetwork = String(network || "").toLowerCase();

  if (normalizedNetwork === "mainnet" || !normalizedNetwork) {
    return "Main Wallet";
  }

  if (normalizedNetwork === "testnet") {
    return "Testnet Wallet";
  }

  if (normalizedNetwork === "preprod") {
    return "Preprod Wallet";
  }

  if (normalizedNetwork === "devnet") {
    return "Devnet Wallet";
  }

  return `${normalizedNetwork.charAt(0).toUpperCase()}${normalizedNetwork.slice(1)} Wallet`;
}

function normalizeWalletRecord(wallet = {}) {
  return {
    ...wallet,
    walletId: String(wallet.walletId || wallet.id || ""),
    chain: String(wallet.chain || "").toLowerCase(),
    network: String(wallet.network || "").toLowerCase(),
    label: String(wallet.label || "").trim(),
  };
}

function getWalletIdentity(wallet = {}) {
  return (
    wallet.walletId ||
    [wallet.chain, wallet.network, wallet.address].filter(Boolean).join(":")
  );
}

function dedupeWallets(wallets = []) {
  const uniqueWallets = new Map();

  for (const wallet of wallets) {
    const normalizedWallet = normalizeWalletRecord(wallet);
    const identity = getWalletIdentity(normalizedWallet);

    if (!identity || uniqueWallets.has(identity)) {
      continue;
    }

    uniqueWallets.set(identity, normalizedWallet);
  }

  return Array.from(uniqueWallets.values());
}

function normalizeAccountScope(accountId) {
  if (accountId === undefined || accountId === null || accountId === "") {
    return null;
  }

  return String(accountId);
}

const walletFetchInFlight = new Map();

function normalizeComparableString(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isAdaWallet(wallet = {}) {
  return normalizeComparableString(wallet.chain) === "ada";
}

function normalizeBaseUnitString(value, fallback = "0") {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : String(fallback);
}

function formatBaseUnitsToDisplay(baseUnits, decimals = 0) {
  const normalized = normalizeBaseUnitString(baseUnits, "0");
  const normalizedDecimals = Math.max(Number(decimals) || 0, 0);

  if (!normalizedDecimals) {
    return normalized;
  }

  const padded = normalized.padStart(normalizedDecimals + 1, "0");
  const integerPart = padded.slice(0, -normalizedDecimals) || "0";
  const fractionPart = padded.slice(-normalizedDecimals).replace(/0+$/, "");

  return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
}

function normalizeCachedTokenBalanceEntry(entry = {}) {
  const decimals = Math.max(Number(entry?.decimals ?? 0) || 0, 0);
  const baseUnitBalance = normalizeBaseUnitString(entry?.baseUnitBalance, "0");
  const availableBaseUnits = normalizeBaseUnitString(
    entry?.availableBaseUnits ?? entry?.baseUnitBalance,
    baseUnitBalance,
  );
  const balance =
    entry?.balance !== undefined && entry?.balance !== null && String(entry.balance).trim()
      ? String(entry.balance)
      : formatBaseUnitsToDisplay(baseUnitBalance, decimals);
  const availableBalance =
    entry?.availableBalance !== undefined &&
    entry?.availableBalance !== null &&
    String(entry.availableBalance).trim()
      ? String(entry.availableBalance)
      : formatBaseUnitsToDisplay(availableBaseUnits, decimals);

  return {
    ...entry,
    asset: String(entry?.asset || entry?.currency || entry?.code || "").trim().toUpperCase(),
    currency: String(entry?.currency || entry?.asset || entry?.code || "").trim().toUpperCase(),
    code: String(entry?.code || entry?.asset || entry?.currency || "").trim().toUpperCase(),
    decimals,
    balance,
    availableBalance,
    baseUnitBalance,
    availableBaseUnits,
  };
}

export function resolveWalletBalanceEntry(walletRaw = {}, balance = null, chainMeta = null) {
  if (hasLoadedBalanceEntry(balance)) {
    return balance;
  }

  const walletId = String(walletRaw?.walletId || walletRaw?.id || "").trim();
  const balanceMetadata =
    walletRaw?.metadata?.balance && typeof walletRaw.metadata.balance === "object"
      ? walletRaw.metadata.balance
      : null;

  if (!walletId || !balanceMetadata) {
    return balance;
  }

  const hasCachedNativeBalance =
    balanceMetadata.lastKnownBalance !== undefined ||
    balanceMetadata.lastKnownBaseUnits !== undefined ||
    balanceMetadata.lastKnownAvailableBaseUnits !== undefined;
  const hasCachedTokenBalances =
    Array.isArray(balanceMetadata.tokenBalances) &&
    balanceMetadata.tokenBalances.length > 0;

  if (!hasCachedNativeBalance && !hasCachedTokenBalances) {
    return balance;
  }

  const decimals = Math.max(
    Number(balanceMetadata.decimals ?? chainMeta?.decimals ?? 0) || 0,
    0,
  );
  const onChainBaseUnits = normalizeBaseUnitString(
    balanceMetadata.lastKnownBaseUnits,
    "0",
  );
  const availableBaseUnits = normalizeBaseUnitString(
    balanceMetadata.lastKnownAvailableBaseUnits ?? balanceMetadata.lastKnownBaseUnits,
    onChainBaseUnits,
  );
  const onChainBalance =
    balanceMetadata.lastKnownBalance !== undefined &&
    balanceMetadata.lastKnownBalance !== null &&
    String(balanceMetadata.lastKnownBalance).trim()
      ? String(balanceMetadata.lastKnownBalance)
      : formatBaseUnitsToDisplay(onChainBaseUnits, decimals);
  const availableBalance = formatBaseUnitsToDisplay(availableBaseUnits, decimals);
  const tokenBalances = hasCachedTokenBalances
    ? balanceMetadata.tokenBalances.map((entry) =>
        normalizeCachedTokenBalanceEntry(entry),
      )
    : [];

  return {
    walletId,
    chain: String(walletRaw?.chain || "").toLowerCase(),
    network: String(walletRaw?.network || "").toLowerCase(),
    address: String(walletRaw?.address || "").trim(),
    asset: String(
      balanceMetadata.asset || chainMeta?.symbol || walletRaw?.asset || walletRaw?.chain || "",
    )
      .trim()
      .toUpperCase(),
    currency: String(
      balanceMetadata.asset || chainMeta?.symbol || walletRaw?.asset || walletRaw?.chain || "",
    )
      .trim()
      .toUpperCase(),
    balance: availableBalance || onChainBalance,
    availableBalance: availableBalance || onChainBalance,
    onChainBalance,
    exists: balanceMetadata.exists !== false,
    confirmed: balanceMetadata.confirmed !== false,
    source: "cached_wallet_metadata",
    tokenBalances,
    metadata: {
      ...balanceMetadata,
      decimals,
      availableBaseUnits,
      onChainBaseUnits,
      minimumReserveBaseUnits: normalizeBaseUnitString(
        balanceMetadata.minimumReserveBaseUnits,
        "0",
      ),
      cached: true,
    },
  };
}

function filterWalletsForAccount(wallets = [], accountId = null) {
  const normalizedAccountId = normalizeAccountScope(accountId);

  if (!normalizedAccountId) {
    return wallets;
  }

  return wallets.filter(
    (wallet) => normalizeAccountScope(wallet?.accountId) === normalizedAccountId,
  );
}

function mergeProvisionedWallets(currentWallets = [], payload = {}, accountId = null) {
  const provisionedWallets = Array.isArray(payload?.provisionedWallets)
    ? filterWalletsForAccount(payload.provisionedWallets, accountId)
    : [];

  if (!provisionedWallets.length) {
    return currentWallets;
  }

  return dedupeWallets([
    ...provisionedWallets,
    ...currentWallets,
  ]);
}

function resolveActiveWalletId(nextWallets, requestedWalletId) {
  if (requestedWalletId && nextWallets.some((wallet) => wallet.walletId === requestedWalletId)) {
    return requestedWalletId;
  }

  return nextWallets[0]?.walletId || "";
}

function resolveSelectedNetwork(nextWallets, requestedNetwork = "", requestedWalletId = "") {
  if (requestedNetwork && nextWallets.some((wallet) => wallet.network === requestedNetwork)) {
    return requestedNetwork;
  }

  const requestedWallet = requestedWalletId
    ? nextWallets.find((wallet) => wallet.walletId === requestedWalletId)
    : null;

  if (requestedWallet?.network) {
    return requestedWallet.network;
  }

  return nextWallets[0]?.network || "";
}

function resolveActiveWalletIdForNetwork(nextWallets, requestedWalletId = "", selectedNetwork = "") {
  if (
    requestedWalletId &&
    nextWallets.some(
      (wallet) => wallet.walletId === requestedWalletId && (!selectedNetwork || wallet.network === selectedNetwork),
    )
  ) {
    return requestedWalletId;
  }

  const firstMatchingWallet = nextWallets.find(
    (wallet) => !selectedNetwork || wallet.network === selectedNetwork,
  );

  return firstMatchingWallet?.walletId || resolveActiveWalletId(nextWallets, requestedWalletId);
}

function getWalletChainName(chainMeta, walletRaw) {
  if (chainMeta?.code === "xrp") {
    return chainMeta.symbol || "XRP";
  }

  return (
    chainMeta?.name ||
    chainMeta?.symbol ||
    walletRaw.asset ||
    walletRaw.chain?.toUpperCase() ||
    "Wallet"
  );
}

export function normalizeWallet(walletRaw, balance, chainMeta) {
  const resolvedBalance = resolveWalletBalanceEntry(walletRaw, balance, chainMeta);
  const network = walletRaw.network || "unknown";
  const currency =
    resolvedBalance?.currency ||
    chainMeta?.symbol ||
    walletRaw.asset ||
    walletRaw.chain?.toUpperCase();
  const isPrimaryWallet = Boolean(walletRaw.metadata?.provisioning?.isPrimaryTarget);
  const walletLabel = getWalletDisplayLabel(network);
  const displayName = walletLabel;
  const hasBalanceLoaded = hasLoadedBalanceEntry(resolvedBalance);
  const fallbackBalance = "0";
  const displayBalance = hasBalanceLoaded
    ? String(resolvedBalance?.balance ?? resolvedBalance?.onChainBalance ?? "0")
    : fallbackBalance;
  const availableBalance = hasBalanceLoaded
    ? String(resolvedBalance?.availableBalance ?? displayBalance)
    : fallbackBalance;
  const onChainBalance = hasBalanceLoaded
    ? String(resolvedBalance?.onChainBalance ?? displayBalance)
    : fallbackBalance;
  const priceUsd = hasBalanceLoaded
    ? Number(resolvedBalance?.priceUsd ?? resolvedBalance?.market?.priceUsd ?? 0) || 0
    : 0;
  const change24h = hasBalanceLoaded
    ? Number(resolvedBalance?.change24h ?? resolvedBalance?.market?.change24h ?? 0) || 0
    : 0;
  const fiatValue = hasBalanceLoaded
    ? Number(resolvedBalance?.fiatValue ?? resolvedBalance?.usdValue ?? 0) || 0
    : 0;
  const usdValue = hasBalanceLoaded
    ? Number(resolvedBalance?.usdValue ?? resolvedBalance?.fiatValue ?? fiatValue) || 0
    : 0;

  return {
    ...walletRaw,
    id: walletRaw.walletId,
    name: displayName,
    displayName,
    walletLabel,
    chainName: getWalletChainName(chainMeta, walletRaw),
    shortAddress: truncateAddress(walletRaw.address),
    asset: currency,
    balance: displayBalance,
    availableBalance,
    onChainBalance,
    hasBalanceLoaded,
    fiatValue,
    currentFiatValue: fiatValue,
    usdValue,
    priceUsd,
    change24h,
    market:
      resolvedBalance?.market && typeof resolvedBalance.market === "object"
        ? {
          ...resolvedBalance.market,
          priceUsd,
          change24h,
        }
        : {
          priceUsd,
          change24h,
        },
    balanceLabel: `${displayBalance} ${currency}`,
    networkLabel: getNetworkLabel(chainMeta, network),
    chainMeta: chainMeta || null,
    isPrimary: isPrimaryWallet,
    icon: chainMeta?.icon || null,
  };
}

export const fetchWalletsThunk = createAsyncThunk(
  "wallet/fetchWallets",
  async (payload = {}, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      const accountId = normalizeAccountScope(
        payload?.accountId ?? getState().account.activeAccountId,
      );
      const requestKey = accountId || "__default__";
      const existingRequest = walletFetchInFlight.get(requestKey);

      if (existingRequest) {
        return await existingRequest;
      }

      const request = listWallets(
        token,
        accountId ? { accountId } : undefined,
      )
        .then((wallets) => ({
          accountId,
          wallets: dedupeWallets(wallets),
        }))
        .finally(() => {
          walletFetchInFlight.delete(requestKey);
        });

      walletFetchInFlight.set(requestKey, request);
      return await request;
    } catch (error) {
      return rejectWithValue({
        ...serializeRequestError(error, "Failed to load wallets"),
        requestedAccountId: normalizeAccountScope(
          payload?.accountId ?? getState().account.activeAccountId,
        ),
      });
    }
  },
  {
    getPendingMeta: ({ arg }, { getState }) => ({
      requestedAccountId: normalizeAccountScope(
        arg?.accountId ?? getState().account.activeAccountId,
      ),
    }),
  },
);

export const createWalletInitThunk = createAsyncThunk(
  "wallet/createWalletInit",
  async (payload, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await createWalletInit(token, payload);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to create wallet"));
    }
  },
);

function getProvisionedWalletIds(payload = {}) {
  const walletIds = new Set();

  if (payload.walletId) {
    walletIds.add(String(payload.walletId));
  }

  if (Array.isArray(payload.provisionedWallets)) {
    for (const wallet of payload.provisionedWallets) {
      const walletId = wallet?.walletId || wallet?.id;
      if (walletId) {
        walletIds.add(String(walletId));
      }
    }
  }

  return Array.from(walletIds);
}

async function refreshTransactionsForKnownWallets(dispatch, walletIds = []) {
  const uniqueWalletIds = Array.from(new Set((walletIds || []).filter(Boolean)));

  for (const walletId of uniqueWalletIds) {
    try {
      await dispatch(fetchTransactionsThunk(walletId)).unwrap();
    } catch (_error) {
      // Keep refreshing the rest of the wallet set even when one wallet fails.
    }
  }
}

function scheduleProvisionedWalletHydration(dispatch, walletIds = []) {
  const uniqueWalletIds = Array.from(new Set((walletIds || []).filter(Boolean)));

  if (!uniqueWalletIds.length) {
    return;
  }

  void dispatch(
    hydrateVisibleWalletBalancesThunk({
      walletIds: uniqueWalletIds,
      force: true,
    }),
  );

  void refreshTransactionsForKnownWallets(dispatch, uniqueWalletIds);
}

function addMatchedWallet(matches = [], wallet = null) {
  const walletId = String(wallet?.walletId || "");

  if (!walletId || matches.some((entry) => entry.walletId === walletId)) {
    return matches;
  }

  return [...matches, wallet];
}

function getProvisioningCandidates(payload = {}) {
  const candidates = Array.isArray(payload?.provisionedWallets)
    ? payload.provisionedWallets
    : payload && typeof payload === "object"
      ? [payload]
      : [];

  return dedupeWallets(candidates);
}

function findWalletByRefreshScope(refreshedWallets = [], candidate = {}) {
  const candidateAccountId = normalizeAccountScope(candidate?.accountId);
  const candidateChain = normalizeComparableString(candidate?.chain);
  const candidateNetwork = normalizeComparableString(candidate?.network);
  const candidateAddress = normalizeComparableString(candidate?.address);

  if (!candidateChain || !candidateNetwork) {
    return null;
  }

  const scopedWallets = refreshedWallets.filter((wallet) => {
    if (
      normalizeComparableString(wallet?.chain) !== candidateChain ||
      normalizeComparableString(wallet?.network) !== candidateNetwork
    ) {
      return false;
    }

    if (!candidateAccountId) {
      return true;
    }

    return normalizeAccountScope(wallet?.accountId) === candidateAccountId;
  });

  if (!scopedWallets.length) {
    return null;
  }

  if (candidateAddress) {
    const exactAddressMatch = scopedWallets.find(
      (wallet) => normalizeComparableString(wallet?.address) === candidateAddress,
    );

    if (exactAddressMatch) {
      return exactAddressMatch;
    }
  }

  if (isAdaWallet(candidate)) {
    return (
      scopedWallets.find((wallet) => wallet?.metadata?.provisioning?.isPrimaryTarget) ||
      scopedWallets[0] ||
      null
    );
  }

  return scopedWallets[0] || null;
}

function resolveProvisionedWalletRefreshResult(refreshedWallets = [], payload = {}) {
  const matches = [];
  const candidates = getProvisioningCandidates(payload);
  const explicitWalletIds = getProvisionedWalletIds(payload);

  for (const walletId of explicitWalletIds) {
    const matchedWallet = refreshedWallets.find((wallet) => wallet.walletId === walletId) || null;
    if (matchedWallet) {
      matches.push(matchedWallet);
    }
  }

  let nextMatches = matches;

  for (const candidate of candidates) {
    nextMatches = addMatchedWallet(
      nextMatches,
      findWalletByRefreshScope(refreshedWallets, candidate),
    );
  }

  const primaryWalletId =
    nextMatches.find((wallet) => wallet.walletId === payload.walletId)?.walletId ||
    nextMatches[0]?.walletId ||
    "";

  return {
    primaryWalletId,
    walletIds: nextMatches.map((wallet) => wallet.walletId).filter(Boolean),
  };
}

export const confirmWalletThunk = createAsyncThunk(
  "wallet/confirmWallet",
  async (payload, { dispatch, getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      const wallet = await confirmWalletCreate(token, payload);

      const refreshedWallets = await dispatch(fetchWalletsThunk())
        .unwrap()
        .then((result) => result?.wallets || [])
        .catch(() => []);
      const refreshResult = resolveProvisionedWalletRefreshResult(refreshedWallets, wallet);
      const walletIdsToRefresh =
        refreshResult.walletIds.length
          ? refreshResult.walletIds
          : refreshResult.primaryWalletId
            ? [refreshResult.primaryWalletId]
            : [];

      if (refreshResult.primaryWalletId) {
        dispatch(setActiveWalletId(refreshResult.primaryWalletId));
      }

      const balanceWalletIdsToHydrate = refreshResult.primaryWalletId
        ? [refreshResult.primaryWalletId]
        : walletIdsToRefresh.slice(0, 1);

      if (balanceWalletIdsToHydrate.length) {
        await dispatch(
          hydrateVisibleWalletBalancesThunk({
            walletIds: balanceWalletIdsToHydrate,
          }),
        );
      }

      const visibleWalletIds = getVisibleWalletIdsFromState(getState());
      await refreshTransactionsForKnownWallets(
        dispatch,
        visibleWalletIds.length ? visibleWalletIds : walletIdsToRefresh,
      );

      return refreshResult.primaryWalletId
        ? {
          ...wallet,
          walletId: refreshResult.primaryWalletId,
        }
        : wallet;
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to confirm wallet"));
    }
  },
);

export const importWalletThunk = createAsyncThunk(
  "wallet/importWallet",
  async (payload, { dispatch, getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      const wallet = await importWallet(token, payload);

      const refreshedWallets = await dispatch(fetchWalletsThunk())
        .unwrap()
        .then((result) => result?.wallets || [])
        .catch(() => []);
      const refreshResult = resolveProvisionedWalletRefreshResult(refreshedWallets, wallet);
      const walletIdsToRefresh =
        refreshResult.walletIds.length
          ? refreshResult.walletIds
          : refreshResult.primaryWalletId
            ? [refreshResult.primaryWalletId]
            : [];

      if (refreshResult.primaryWalletId) {
        dispatch(setActiveWalletId(refreshResult.primaryWalletId));
      }

      const balanceWalletIdsToHydrate = walletIdsToRefresh.length
        ? walletIdsToRefresh
        : refreshResult.primaryWalletId
          ? [refreshResult.primaryWalletId]
          : [];

      const visibleWalletIds = getVisibleWalletIdsFromState(getState());
      scheduleProvisionedWalletHydration(
        dispatch,
        visibleWalletIds.length ? visibleWalletIds : balanceWalletIdsToHydrate,
      );

      return refreshResult.primaryWalletId
        ? {
          ...wallet,
          walletId: refreshResult.primaryWalletId,
        }
        : wallet;
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to import wallet"));
    }
  },
);

const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers: {
    clearWalletState(state) {
      Object.assign(state, initialState);
    },
    setActiveWalletId(state, action) {
      const requestedWalletId = action.payload || "";
      const selectedWallet = state.items.find((wallet) => wallet.walletId === requestedWalletId) || null;

      state.activeWalletId = requestedWalletId;

      if (selectedWallet?.network) {
        state.selectedNetwork = selectedWallet.network;
      }
    },
    setSelectedNetwork(state, action) {
      const requestedNetwork = String(action.payload || "").toLowerCase();
      const nextSelectedNetwork = resolveSelectedNetwork(state.items, requestedNetwork, "");

      state.selectedNetwork = nextSelectedNetwork;
      state.activeWalletId = resolveActiveWalletIdForNetwork(
        state.items,
        state.activeWalletId,
        nextSelectedNetwork,
      );
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWalletsThunk.pending, (state, action) => {
        state.status = "loading";
        state.requestStatus.fetch = "loading";
        state.error = "";
        state.requestedScopeAccountId = normalizeAccountScope(
          action.meta?.requestedAccountId,
        );
      })
      .addCase(fetchWalletsThunk.fulfilled, (state, action) => {
        const nextWallets = action.payload?.wallets || [];
        const nextScopeAccountId = normalizeAccountScope(action.payload?.accountId);
        const requestedScopeAccountId = normalizeAccountScope(
          state.requestedScopeAccountId,
        );

        if (requestedScopeAccountId !== nextScopeAccountId) {
          return;
        }

        const nextSelectedNetwork = resolveSelectedNetwork(
          nextWallets,
          state.selectedNetwork,
          state.activeWalletId,
        );

        state.status = "idle";
        state.requestStatus.fetch = "idle";
        state.items = nextWallets;
        state.scopeAccountId = nextScopeAccountId;
        state.requestedScopeAccountId = nextScopeAccountId;
        state.selectedNetwork = nextSelectedNetwork;
        state.activeWalletId = resolveActiveWalletIdForNetwork(
          nextWallets,
          state.activeWalletId,
          nextSelectedNetwork,
        );
      })
      .addCase(fetchWalletsThunk.rejected, (state, action) => {
        const requestedAccountId = normalizeAccountScope(
          action.payload?.requestedAccountId ?? action.meta?.requestedAccountId,
        );

        if (requestedAccountId !== normalizeAccountScope(state.requestedScopeAccountId)) {
          return;
        }

        state.status = "error";
        state.requestStatus.fetch = "error";
        state.error = action.payload?.message || action.payload || "Failed to load wallets";

        if (requestedAccountId !== state.scopeAccountId) {
          state.items = [];
          state.activeWalletId = "";
          state.scopeAccountId = requestedAccountId;
          state.selectedNetwork = "";
        }
      })
      .addCase(createWalletInitThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(createWalletInitThunk.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(createWalletInitThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || action.payload || "Failed to create wallet";
      })
      .addCase(confirmWalletThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(confirmWalletThunk.fulfilled, (state, action) => {
        const nextWallets = state.items;
        const nextSelectedNetwork = resolveSelectedNetwork(
          nextWallets,
          action.payload.network || state.selectedNetwork,
          action.payload.walletId || state.activeWalletId,
        );

        state.status = "idle";
        state.error = "";
        state.items = nextWallets;
        state.selectedNetwork = nextSelectedNetwork;
        state.activeWalletId = resolveActiveWalletIdForNetwork(
          nextWallets,
          action.payload.walletId || state.activeWalletId,
          nextSelectedNetwork,
        );
      })
      .addCase(confirmWalletThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || action.payload || "Failed to confirm wallet";
      })
      .addCase(importWalletThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(importWalletThunk.fulfilled, (state, action) => {
        const nextWallets = state.items;
        const nextSelectedNetwork = resolveSelectedNetwork(
          nextWallets,
          action.payload.network || state.selectedNetwork,
          action.payload.walletId || state.activeWalletId,
        );

        state.status = "idle";
        state.error = "";
        state.items = nextWallets;
        state.selectedNetwork = nextSelectedNetwork;
        state.activeWalletId = resolveActiveWalletIdForNetwork(
          nextWallets,
          action.payload.walletId || state.activeWalletId,
          nextSelectedNetwork,
        );
      })
      .addCase(importWalletThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || action.payload || "Failed to import wallet";
      });
  },
});

export const { clearWalletState, setActiveWalletId, setSelectedNetwork } = walletSlice.actions;

export default walletSlice.reducer;
