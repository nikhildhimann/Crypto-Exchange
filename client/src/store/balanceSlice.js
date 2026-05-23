// Refactor: stores fresh live balances by wallet id and keeps them out of persistence so chain data always comes from the backend.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { runtimeConfig } from "../lib/runtimeConfig";

import {
  normalizeBalanceDetail,
  normalizeBalanceListResponse,
} from "../api/adapters/balance";
import { getWalletBalance, listBalances } from "../api/balance";

const initialState = {
  byWalletId: {},
  status: "idle",
  error: "",
  hasLoadedOnce: false,
  lastFetchedAt: 0,
  lastFullFetchedAt: 0,
  requestStatusByWalletId: {},
  lastFetchedAtByWalletId: {},
};

const walletBalanceRequestInFlight = new Map();

function normalizeComparableValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isBaseUnitString(value) {
  return /^\d+$/.test(String(value ?? "").trim());
}

function normalizeBaseUnits(value, fallback = "0") {
  return isBaseUnitString(value) ? String(value).trim() : String(fallback);
}

function addBaseUnits(...values) {
  return values
    .map((value) => normalizeBaseUnits(value, "0"))
    .reduce((total, value) => total + BigInt(value), 0n)
    .toString();
}

function subtractBaseUnits(balanceValue, debitValue) {
  const balanceBaseUnits = BigInt(normalizeBaseUnits(balanceValue, "0"));
  const debitBaseUnits = BigInt(normalizeBaseUnits(debitValue, "0"));

  if (debitBaseUnits <= 0n) {
    return balanceBaseUnits.toString();
  }

  return balanceBaseUnits > debitBaseUnits
    ? (balanceBaseUnits - debitBaseUnits).toString()
    : "0";
}

function formatBaseUnitsToDisplay(baseUnits, decimals = 0) {
  const normalized = normalizeBaseUnits(baseUnits, "0");
  const normalizedDecimals = Math.max(Number(decimals) || 0, 0);

  if (!normalizedDecimals) {
    return normalized;
  }

  const padded = normalized.padStart(normalizedDecimals + 1, "0");
  const integerPart = padded.slice(0, -normalizedDecimals) || "0";
  const fractionPart = padded.slice(-normalizedDecimals).replace(/0+$/, "");

  return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
}

function resolveBalanceDecimals(entry = {}) {
  return Math.max(
    Number(entry?.metadata?.decimals ?? entry?.decimals ?? 0) || 0,
    0,
  );
}

function matchesAssetIdentity(entryAsset = {}, transactionAsset = {}) {
  const entryContractAddress = normalizeComparableValue(entryAsset.contractAddress);
  const transactionContractAddress = normalizeComparableValue(transactionAsset.contractAddress);

  if (entryContractAddress || transactionContractAddress) {
    return (
      Boolean(entryContractAddress) &&
      entryContractAddress === transactionContractAddress
    );
  }

  const entryAssetCode =
    normalizeComparableValue(entryAsset.asset) ||
    normalizeComparableValue(entryAsset.currency) ||
    normalizeComparableValue(entryAsset.code);
  const transactionAssetCode =
    normalizeComparableValue(transactionAsset.asset) ||
    normalizeComparableValue(transactionAsset.currency) ||
    normalizeComparableValue(transactionAsset.code);

  return Boolean(entryAssetCode) && entryAssetCode === transactionAssetCode;
}

function buildTransactionAssetDescriptor(transaction = {}) {
  return {
    asset: transaction.asset,
    currency: transaction.currency,
    code: transaction.asset,
    contractAddress: transaction.contractAddress,
  };
}

function buildNetworkFeeAssetDescriptor(transaction = {}) {
  return {
    asset: transaction.networkFeeAsset || transaction.networkFeeCurrency || transaction.currency,
    currency: transaction.networkFeeCurrency || transaction.networkFeeAsset || transaction.currency,
    code: transaction.networkFeeAsset || transaction.networkFeeCurrency || transaction.currency,
    contractAddress: null,
  };
}

function resolveNativeDebitBaseUnits(balanceEntry = {}, transaction = {}) {
  const transactionAssetType = normalizeComparableValue(transaction.assetType || "native");
  const transactionAsset = buildTransactionAssetDescriptor(transaction);
  const nativeAssetMatches = matchesAssetIdentity(balanceEntry, transactionAsset);
  const totalDebitBaseUnits =
    normalizeBaseUnits(
      transaction.totalDeductedBaseUnits ?? transaction.totalDebitBaseUnits,
      "",
    );
  const amountBaseUnits = normalizeBaseUnits(transaction.amountBaseUnits, "0");
  const networkFeeBaseUnits = normalizeBaseUnits(transaction.networkFeeBaseUnits, "0");
  const applicationFeeBaseUnits = normalizeBaseUnits(
    transaction.applicationFeeBaseUnits ?? transaction.platformFeeBaseUnits,
    "0",
  );

  if (transactionAssetType !== "token" && nativeAssetMatches) {
    if (isBaseUnitString(totalDebitBaseUnits)) {
      return totalDebitBaseUnits;
    }

    return addBaseUnits(amountBaseUnits, networkFeeBaseUnits, applicationFeeBaseUnits);
  }

  const networkFeeAsset = buildNetworkFeeAssetDescriptor(transaction);
  if (matchesAssetIdentity(balanceEntry, networkFeeAsset)) {
    return addBaseUnits(networkFeeBaseUnits);
  }

  return "0";
}

function applyNativeBalanceUpdate(balanceEntry = {}, transaction = {}) {
  const decimals = resolveBalanceDecimals(balanceEntry);
  const metadata = balanceEntry.metadata && typeof balanceEntry.metadata === "object"
    ? { ...balanceEntry.metadata }
    : {};
  const transactionAssetType = normalizeComparableValue(transaction.assetType || "native");
  const nativeAssetMatches = matchesAssetIdentity(
    balanceEntry,
    buildTransactionAssetDescriptor(transaction),
  );
  const directRemainingBaseUnits = normalizeBaseUnits(
    transaction.remainingBalanceBaseUnits ??
      transaction.availableBalanceBaseUnits,
    "",
  );
  const directRemainingBalance =
    transaction.remainingBalance !== undefined && transaction.remainingBalance !== null
      ? String(transaction.remainingBalance)
      : transaction.availableBalance !== undefined && transaction.availableBalance !== null
      ? String(transaction.availableBalance)
        : "";
  const canUseDirectNativeRemaining =
    transactionAssetType !== "token" &&
    nativeAssetMatches &&
    isBaseUnitString(directRemainingBaseUnits);
  const nextAvailableBaseUnits = canUseDirectNativeRemaining
    ? directRemainingBaseUnits
    : subtractBaseUnits(
        metadata.availableBaseUnits,
        resolveNativeDebitBaseUnits(balanceEntry, transaction),
      );
  const nextOnChainBaseUnits = canUseDirectNativeRemaining
    ? directRemainingBaseUnits
    : subtractBaseUnits(
        metadata.onChainBaseUnits,
        resolveNativeDebitBaseUnits(balanceEntry, transaction),
      );
  const nextDisplayBalance = canUseDirectNativeRemaining && directRemainingBalance
    ? directRemainingBalance
    : formatBaseUnitsToDisplay(nextAvailableBaseUnits, decimals);

  return {
    ...balanceEntry,
    balance: nextDisplayBalance,
    availableBalance: nextDisplayBalance,
    onChainBalance: formatBaseUnitsToDisplay(nextOnChainBaseUnits, decimals),
    metadata: {
      ...metadata,
      availableBaseUnits: nextAvailableBaseUnits,
      onChainBaseUnits: nextOnChainBaseUnits,
    },
  };
}

function applyTokenBalanceUpdates(balanceEntry = {}, transaction = {}) {
  if (!Array.isArray(balanceEntry.tokenBalances) || !balanceEntry.tokenBalances.length) {
    return balanceEntry.tokenBalances || [];
  }

  const transactionAssetType = normalizeComparableValue(transaction.assetType || "native");
  if (transactionAssetType !== "token") {
    return balanceEntry.tokenBalances;
  }

  const directRemainingBaseUnits = normalizeBaseUnits(
    transaction.remainingBalanceBaseUnits ??
      transaction.availableBalanceBaseUnits,
    "",
  );
  const directRemainingBalance =
    transaction.remainingBalance !== undefined && transaction.remainingBalance !== null
      ? String(transaction.remainingBalance)
      : transaction.availableBalance !== undefined && transaction.availableBalance !== null
        ? String(transaction.availableBalance)
        : "";
  const tokenDebitBaseUnits = normalizeBaseUnits(
    transaction.totalDeductedBaseUnits ??
      transaction.totalDebitBaseUnits ??
      transaction.amountBaseUnits,
    "0",
  );
  const transactionAsset = buildTransactionAssetDescriptor(transaction);

  return balanceEntry.tokenBalances.map((tokenBalance) => {
    if (!matchesAssetIdentity(tokenBalance, transactionAsset)) {
      return tokenBalance;
    }

    const decimals = Math.max(Number(tokenBalance?.decimals ?? 0) || 0, 0);
    const nextAvailableBaseUnits = isBaseUnitString(directRemainingBaseUnits)
      ? directRemainingBaseUnits
      : subtractBaseUnits(tokenBalance.availableBaseUnits, tokenDebitBaseUnits);
    const nextBaseUnitBalance = isBaseUnitString(directRemainingBaseUnits)
      ? directRemainingBaseUnits
      : subtractBaseUnits(tokenBalance.baseUnitBalance, tokenDebitBaseUnits);
    const nextDisplayBalance = directRemainingBalance
      ? directRemainingBalance
      : formatBaseUnitsToDisplay(nextAvailableBaseUnits, decimals);

    return {
      ...tokenBalance,
      balance: nextDisplayBalance,
      availableBalance: nextDisplayBalance,
      baseUnitBalance: nextBaseUnitBalance,
      availableBaseUnits: nextAvailableBaseUnits,
    };
  });
}

function applyOptimisticTransactionToBalanceEntry(balanceEntry = {}, transaction = {}) {
  if (!hasLoadedBalanceEntry(balanceEntry)) {
    return balanceEntry;
  }

  if (normalizeComparableValue(transaction.direction) !== "outgoing") {
    return balanceEntry;
  }

  const nextEntry = applyNativeBalanceUpdate(balanceEntry, transaction);
  return {
    ...nextEntry,
    tokenBalances: applyTokenBalanceUpdates(nextEntry, transaction),
  };
}

export const BALANCE_FRESHNESS_MS = runtimeConfig.balanceRefreshIntervalMs;

function normalizeWalletId(walletId = "") {
  return String(walletId || "").trim();
}

function normalizeBalanceRequest(request) {
  if (request && typeof request === "object" && !Array.isArray(request)) {
    return {
      walletId: normalizeWalletId(request.walletId),
      force: request.force === true,
    };
  }

  return {
    walletId: normalizeWalletId(request),
    force: false,
  };
}

function isFreshEnough(lastFetchedAt, freshnessMs = BALANCE_FRESHNESS_MS) {
  const timestamp = Number(lastFetchedAt || 0);

  return (
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    Date.now() - timestamp < freshnessMs
  );
}

export function hasLoadedBalanceEntry(entry) {
  return Boolean(
    entry && typeof entry === "object" && normalizeWalletId(entry.walletId),
  );
}

export function getVisibleWalletIdsFromState(state) {
  const selectedNetwork = state?.wallet?.selectedNetwork || "";

  return (Array.isArray(state?.wallet?.items) ? state.wallet.items : [])
    .filter((wallet) => !selectedNetwork || wallet.network === selectedNetwork)
    .map((wallet) => normalizeWalletId(wallet?.walletId))
    .filter(Boolean);
}

export function getWalletIdsNeedingBalanceHydration(
  state,
  walletIds = [],
  { force = false, freshnessMs = BALANCE_FRESHNESS_MS } = {},
) {
  const explicitWalletIds = Array.isArray(walletIds) ? walletIds : [];
  const targetWalletIds = Array.from(
    new Set(
      (explicitWalletIds.length
        ? explicitWalletIds
        : getVisibleWalletIdsFromState(state)
      )
        .map((walletId) => normalizeWalletId(walletId))
        .filter(Boolean),
    ),
  );

  return targetWalletIds.filter((walletId) => {
    const requestStatus =
      state?.balance?.requestStatusByWalletId?.[walletId] || "idle";

    if (requestStatus === "loading") {
      return false;
    }

    if (force) {
      return true;
    }

    const balanceEntry = state?.balance?.byWalletId?.[walletId] || null;
    const lastFetchedAt =
      state?.balance?.lastFetchedAtByWalletId?.[walletId] || 0;

    if (!hasLoadedBalanceEntry(balanceEntry)) {
      return !isFreshEnough(lastFetchedAt, freshnessMs);
    }

    return !isFreshEnough(lastFetchedAt, freshnessMs);
  });
}

export const fetchAllBalancesThunk = createAsyncThunk(
  "balance/fetchAllBalances",
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      const response = await listBalances(token);
      return normalizeBalanceListResponse(response);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load balances",
      );
    }
  },
);

export const fetchWalletBalanceThunk = createAsyncThunk(
  "balance/fetchWalletBalance",
  async (request, { getState, rejectWithValue }) => {
    try {
      const normalizedRequest = normalizeBalanceRequest(request);
      const state = getState();
      const token = state.auth.accessToken || state.auth.token;
      const existingBalance = state.balance?.byWalletId?.[normalizedRequest.walletId] || null;
      const lastFetchedAt =
        state.balance?.lastFetchedAtByWalletId?.[normalizedRequest.walletId] || 0;
      const requestKey = normalizedRequest.walletId;

      if (
        !normalizedRequest.force &&
        hasLoadedBalanceEntry(existingBalance) &&
        isFreshEnough(lastFetchedAt)
      ) {
        return {
          ...existingBalance,
          walletId: normalizedRequest.walletId,
          fetchedAt: Number(lastFetchedAt || Date.now()) || Date.now(),
        };
      }

      const inFlightRequest = walletBalanceRequestInFlight.get(requestKey);
      if (inFlightRequest) {
        return await inFlightRequest;
      }

      const requestPromise = getWalletBalance(
        token,
        normalizedRequest.walletId,
        {
          force: normalizedRequest.force,
        },
      )
        .then((response) => {
          const normalizedResponse = normalizeBalanceDetail(response);

          return {
            ...normalizedResponse,
            fetchedAt: Date.now(),
          };
        })
        .finally(() => {
          walletBalanceRequestInFlight.delete(requestKey);
        });

      walletBalanceRequestInFlight.set(requestKey, requestPromise);
      return await requestPromise;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to load wallet balance",
      );
    }
  },
);

export function hydrateVisibleWalletBalancesThunk(options = {}) {
  return async (dispatch, getState) => {
    const targetWalletIds = getWalletIdsNeedingBalanceHydration(
      getState(),
      options.walletIds,
      {
        force: options.force === true,
        freshnessMs: options.freshnessMs,
      },
    );

    const hydratedWalletIds = [];
    const failedWalletIds = [];

    for (const walletId of targetWalletIds) {
      try {
        await dispatch(
          fetchWalletBalanceThunk(
            options.force === true ? { walletId, force: true } : walletId,
          ),
        ).unwrap();
        hydratedWalletIds.push(walletId);
      } catch (_error) {
        failedWalletIds.push(walletId);
      }
    }

    return {
      walletIds: targetWalletIds,
      hydratedWalletIds,
      failedWalletIds,
    };
  };
}

const balanceSlice = createSlice({
  name: "balance",
  initialState,
  reducers: {
    clearBalanceState(state) {
      state.byWalletId = {};
      state.status = "idle";
      state.error = "";
      state.hasLoadedOnce = false;
      state.lastFetchedAt = 0;
      state.lastFullFetchedAt = 0;
      state.requestStatusByWalletId = {};
      state.lastFetchedAtByWalletId = {};
    },
    applyOptimisticTransactionBalance(state, action) {
      const walletId = normalizeWalletId(action.payload?.walletId);
      const transaction =
        action.payload?.transaction && typeof action.payload.transaction === "object"
          ? action.payload.transaction
          : null;

      if (!walletId || !transaction || !state.byWalletId[walletId]) {
        return;
      }

      state.byWalletId[walletId] = applyOptimisticTransactionToBalanceEntry(
        state.byWalletId[walletId],
        transaction,
      );
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAllBalancesThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(fetchAllBalancesThunk.fulfilled, (state, action) => {
        const nextBalances = {};
        const fetchedAt = Date.now();

        for (const entry of action.payload || []) {
          nextBalances[entry.walletId] = entry;
        }

        state.status = "idle";
        state.byWalletId = nextBalances;
        state.hasLoadedOnce = true;
        state.lastFetchedAt = fetchedAt;
        state.lastFullFetchedAt = fetchedAt;

        for (const walletId of Object.keys(nextBalances)) {
          state.requestStatusByWalletId[walletId] = "idle";
          state.lastFetchedAtByWalletId[walletId] = fetchedAt;
        }
      })
      .addCase(fetchAllBalancesThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload || "Failed to load balances";
      })
      .addCase(fetchWalletBalanceThunk.pending, (state, action) => {
        const walletId = normalizeBalanceRequest(action.meta.arg).walletId;
        if (walletId) {
          state.requestStatusByWalletId[walletId] = "loading";
        }
      })
      .addCase(fetchWalletBalanceThunk.fulfilled, (state, action) => {
        const { walletId, fetchedAt } = action.payload;
        const currentFetchedAt = state.lastFetchedAtByWalletId?.[walletId] || 0;

        // Only update the store if the response is fresher
        if (fetchedAt > currentFetchedAt) {
          state.byWalletId[walletId] = action.payload;
          state.lastFetchedAtByWalletId[walletId] = fetchedAt;
        }

        state.status = "idle";
        state.error = "";
        state.hasLoadedOnce = true;
        state.lastFetchedAt = Math.max(Number(state.lastFetchedAt || 0), fetchedAt || 0);
        state.requestStatusByWalletId[walletId] = "idle";

        state.requestStatusByWalletId[walletId] = "idle";
      })
      .addCase(fetchWalletBalanceThunk.rejected, (state, action) => {
        const walletId = normalizeBalanceRequest(action.meta.arg).walletId;
        state.status = "error";
        state.error =
          action.payload || "Failed to load wallet balance";
        if (walletId) {
          state.requestStatusByWalletId[walletId] = "error";
        }
      });
  },
});

export const { clearBalanceState, applyOptimisticTransactionBalance } = balanceSlice.actions;

export default balanceSlice.reducer;
