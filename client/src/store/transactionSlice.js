// Refactor: normalizes transaction history, preview, and send flows so the UI never depends on XRP-only transaction fields.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import {
  normalizeDestinationValidation,
  normalizeTransactionList,
  normalizeTransactionPreview,
  normalizeTransactionRecord,
  normalizeTransactionSyncResult,
  resolveTransactionDisplayTimestamp,
  normalizeNftMetadata,
  isNftTransactionRecord,
} from "../api/adapters/transaction";
import {
  listUserTransactions,
  listWalletTransactions,
  previewTransaction,
  sendTransaction,
  syncWalletTransactions,
  validateDestination,
} from "../api/transaction";
import { buildExplorerTransactionUrl, getChainMeta } from "../config/chains";
import {
  applyOptimisticTransactionBalance,
  fetchWalletBalanceThunk,
  getVisibleWalletIdsFromState,
} from "./balanceSlice";

const initialState = {
  byWalletId: {},
  status: "idle",
  error: "",
  previewData: null,
  sendResult: null,
  historyRefreshToken: 0,
  hasLoadedOnceByWalletId: {},
  lastFetchedAtByWalletId: {},
  requestStatusByWalletId: {},
};

function getTransactionIdentity(transaction = {}) {
  return String(
    transaction?.id ||
      transaction?._id ||
      transaction?.transactionId ||
      transaction?.transactionHash ||
      transaction?.txHash ||
      "",
  ).trim();
}

const walletTransactionFetchInFlight = new Map();
const walletTransactionRefreshInFlight = new Map();

function getTxTimestamp(transaction) {
  const candidate =
    transaction?.displayTimestamp ||
    transaction?.confirmedAt ||
    transaction?.createdAt ||
    0;
  if (!candidate) return 0;
  const parsed = new Date(candidate).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function upsertTransactionList(existingItems = [], nextTransaction = {}) {
  const nextIdentity = getTransactionIdentity(nextTransaction);

  if (!nextIdentity) {
    return existingItems;
  }

  const filteredItems = (existingItems || []).filter(
    (item) => getTransactionIdentity(item) !== nextIdentity,
  );

  return [...filteredItems, nextTransaction].sort(
    (left, right) => getTxTimestamp(right) - getTxTimestamp(left),
  );
}

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

function truncateAddress(address = "", start = 6, end = 4) {
  if (!address) {
    return "";
  }

  if (address.length <= start + end) {
    return address;
  }

  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

function resolveWalletIdForTransaction(transaction = {}, wallets = []) {
  const explicitId = String(transaction?.walletId || "").trim();
  if (explicitId) return explicitId;

  const chain = String(transaction?.chain || "").trim().toLowerCase();
  const network = String(transaction?.network || "").trim().toLowerCase();
  const from = String(transaction?.fromAddress || "").trim().toLowerCase();
  const to = String(transaction?.toAddress || "").trim().toLowerCase();

  if (!chain || (!from && !to)) {
    return "unresolved";
  }

  const matched = wallets.find((w) => {
    const wChain = String(w.chain || "").trim().toLowerCase();
    const wNetwork = String(w.network || "").trim().toLowerCase();
    const wAddress = String(w.address || "").trim().toLowerCase();

    return (
      wChain === chain &&
      (!network || wNetwork === network) &&
      wAddress &&
      (wAddress === from || wAddress === to)
    );
  });

  return matched?.walletId || "unresolved";
}

function formatCryptoAmount(value) {
  const num = Number(value || 0);
  if (num === 0) return "0";
  if (num < 0.000001) return num.toFixed(8);
  if (num < 0.01) return num.toFixed(6);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function formatDateLabel(value) {
  if (!value) {
    return "Time unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeLabel(value) {
  if (!value) {
    return "Time unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeDirection(direction) {
  if (direction === "incoming" || direction === "credit" || direction === "received") {
    return "incoming";
  }

  return "outgoing";
}

function normalizeAddress(value = "") {
  return String(value || "").trim();
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function formatTitleCaseStatus(value = "") {
  const normalized = normalizeString(value).replace(/[_-]+/g, " ");

  if (!normalized) {
    return "";
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncateMiddle(value = "", start = 6, end = 4) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return "";
  }

  if (normalized.length <= start + end) {
    return normalized;
  }

  return `${normalized.slice(0, start)}...${normalized.slice(-end)}`;
}

function resolveTransactionUiStatus(transaction = {}) {
  const rawStatus = normalizeString(transaction.status).toLowerCase();
  const systemStatus = normalizeString(transaction.systemStatus).toLowerCase();
  const chainStatus = normalizeString(transaction.chainStatus).toLowerCase();

  if (
    transaction?.succeeded === true ||
    rawStatus === "success" ||
    rawStatus === "completed" ||
    chainStatus === "confirmed"
  ) {
    return {
      tone: "success",
      value: "success",
      label: "Confirmed",
    };
  }

  if (
    (transaction?.validated === true && transaction?.succeeded === false) ||
    rawStatus === "failed" ||
    chainStatus === "failed" ||
    systemStatus === "confirmed_failed"
  ) {
    return {
      tone: "failed",
      value: "failed",
      label: "Failed",
    };
  }

  return {
    tone: "pending",
    value: "pending",
    label: "Pending confirmation",
  };
}

// Helpers like isNftTransactionRecord and normalizeNftMetadata are now imported from the adapter for centralization.

function resolveNftTitle(nft = {}) {
  const name = normalizeString(nft.name);
  if (name) return name;

  const collection = normalizeString(nft.collectionName);
  if (collection) return collection;

  const tokenId = normalizeString(nft.tokenId);
  if (tokenId) {
    return tokenId.length > 20
      ? `Token #${truncateMiddle(tokenId, 8, 8)}`
      : `Token #${tokenId}`;
  }

  return "NFT";
}

function resolveNftSubtitle(transaction = {}, nft = {}) {
  const directionLabel =
    normalizeString(transaction.direction).toLowerCase() === "incoming"
      ? "Received NFT"
      : "Sent NFT";
  const tokenLabel = normalizeString(nft.tokenId)
    ? `Token #${normalizeString(nft.tokenId)}`
    : normalizeString(nft.standard || transaction.standard || "NFT");
  const destinationLabel = normalizeString(transaction.counterpartyAddress)
    ? truncateMiddle(transaction.counterpartyAddress)
    : "";

  return [directionLabel, tokenLabel, destinationLabel].filter(Boolean).join(" • ");
}

function resolveInternalRecipientWalletId(wallets = [], senderWalletId = "", transaction = {}) {
  if (transaction?.transactionType !== "internal") {
    return "";
  }

  const senderId = String(senderWalletId || "");
  const targetAddress = normalizeAddress(transaction?.toAddress);
  const targetChain = String(transaction?.chain || "").toLowerCase();
  const targetNetwork = String(transaction?.network || "").toLowerCase();

  if (!targetAddress || !targetChain || !targetNetwork) {
    return "";
  }

  const recipientWallet = wallets.find((wallet) => {
    const walletId = String(wallet?.walletId || "");

    return (
      walletId &&
      walletId !== senderId &&
      String(wallet?.chain || "").toLowerCase() === targetChain &&
      String(wallet?.network || "").toLowerCase() === targetNetwork &&
      normalizeAddress(wallet?.address) === targetAddress
    );
  });

  return recipientWallet?.walletId || "";
}

export function resolveRecipientWalletIdForRefresh(
  wallets = [],
  senderWalletId = "",
  transaction = {},
) {
  const normalizedWalletIds = new Set(
    (wallets || [])
      .map((wallet) => String(wallet?.walletId || "").trim())
      .filter(Boolean),
  );
  const explicitRecipientWalletId = String(
    transaction?.samePlatformRecipientWalletId ||
      transaction?.platformRecipientWalletId ||
      transaction?.internalWalletId ||
      "",
  ).trim();

  if (
    explicitRecipientWalletId &&
    explicitRecipientWalletId !== String(senderWalletId || "") &&
    normalizedWalletIds.has(explicitRecipientWalletId)
  ) {
    return explicitRecipientWalletId;
  }

  const isInternalTransfer = transaction?.transactionType === "internal";
  const isSamePlatformTransfer = transaction?.samePlatformRecipient === true;

  if (!isInternalTransfer && !isSamePlatformTransfer) {
    return "";
  }

  const derivedRecipientWalletId = resolveInternalRecipientWalletId(
    wallets,
    senderWalletId,
    transaction,
  );
  if (derivedRecipientWalletId) {
    return derivedRecipientWalletId;
  }

  const senderId = String(senderWalletId || "");
  const targetAddress = normalizeAddress(transaction?.toAddress);
  const targetChain = String(transaction?.chain || "").toLowerCase();
  const targetNetwork = String(transaction?.network || "").toLowerCase();

  if (!targetAddress || !targetChain || !targetNetwork) {
    return "";
  }

  const recipientWallet = wallets.find((wallet) => {
    const walletId = String(wallet?.walletId || "");

    return (
      walletId &&
      walletId !== senderId &&
      String(wallet?.chain || "").toLowerCase() === targetChain &&
      String(wallet?.network || "").toLowerCase() === targetNetwork &&
      normalizeAddress(wallet?.address) === targetAddress
    );
  });

  return recipientWallet?.walletId || "";
}

async function syncWalletTransactionsSequentially(token, walletIds = []) {
  const uniqueWalletIds = Array.from(new Set((walletIds || []).filter(Boolean)));

  for (const walletId of uniqueWalletIds) {
    try {
      await syncWalletTransactions(token, walletId)
        .then((result) => normalizeTransactionSyncResult(result))
        .catch(() => null);
    } catch (_error) {
      // Keep explicit multi-wallet refreshes moving even if one wallet sync fails.
    }
  }
}

export function normalizeTransaction(transaction, wallet, balance, chainMeta) {
  const rawType = normalizeString(transaction?.type).toLowerCase();
  const rawTransactionType = normalizeString(transaction?.transactionType).toLowerCase();
  const rawDirection = normalizeString(transaction?.direction).toLowerCase();
  const isSwap =
    transaction?.isSwap === true ||
    rawType === "swap" ||
    rawTransactionType === "swap" ||
    rawDirection === "swap";
  const direction = isSwap ? "swap" : normalizeDirection(transaction.direction);
  const counterpartyAddress = isSwap
    ? ""
    : direction === "incoming"
      ? transaction.fromAddress
      : transaction.toAddress;
  const assetType = normalizeString(transaction.assetType).toLowerCase();
  const nft = normalizeNftMetadata(transaction);
  const isNft = isSwap
    ? false
    : isNftTransactionRecord(transaction, transaction.metadata, nft);
  const sourceAmount = normalizeString(
    transaction.sourceAmount || transaction.fromAmount || transaction.swap?.sourceAmount || transaction.amount,
    "0",
  );
  const sourceAsset = normalizeString(
    transaction.sourceAsset || transaction.fromAsset || transaction.swap?.sourceAsset || transaction.asset,
  );
  const destinationAmount = normalizeString(
    transaction.destinationAmount ||
      transaction.toAmount ||
      transaction.finalReceiveAmount ||
      transaction.estimatedReceiveAmount ||
      transaction.swap?.finalReceiveAmount ||
      transaction.swap?.estimatedReceiveAmount ||
      transaction.amount,
    "0",
  );
  const destinationAsset = normalizeString(
    transaction.destinationAsset || transaction.toAsset || transaction.swap?.destinationAsset || transaction.asset,
  );
  const symbol =
    isSwap
      ? destinationAsset || sourceAsset || transaction.currency || transaction.asset || ""
      : isNft
      ? "NFT"
      : transaction.currency ||
        transaction.asset ||
        balance?.currency ||
        balance?.asset ||
        chainMeta?.symbol ||
        "";
  const displayTimestamp =
    transaction.displayTimestamp ||
    resolveTransactionDisplayTimestamp(transaction);
  const uiStatus = resolveTransactionUiStatus(transaction);
  const networkLabel =
    wallet?.networkLabel ||
    formatTitleCaseStatus(wallet?.network || transaction.network || "");
  const chainLabel =
    chainMeta?.name ||
    formatTitleCaseStatus(wallet?.chain || transaction.chain || "");
  const explorerUrl =
    normalizeString(transaction.explorerUrl) ||
    buildExplorerTransactionUrl(
      chainMeta || null,
      wallet?.network || transaction.network || "",
      transaction.txHash || transaction.transactionHash || "",
    ) ||
    "";
  const displayTitle = isSwap
    ? sourceAsset && destinationAsset
      ? `Swap ${sourceAsset} -> ${destinationAsset}`
      : "Swap"
    : isNft
    ? resolveNftTitle(nft)
    : transaction.transactionType === "internal"
      ? direction === "incoming"
        ? "Internal Transfer In"
        : "Internal Transfer Out"
      : truncateAddress(counterpartyAddress);
  const displaySubtitle = isSwap
    ? [transaction.sourceChain || transaction.chain, transaction.destinationChain]
        .filter(Boolean)
        .map((value) => String(value).toUpperCase())
        .join(" to ") || "Swap"
    : isNft
    ? resolveNftSubtitle(
        { ...transaction, counterpartyAddress },
        nft,
      )
    : chainLabel || networkLabel || "Wallet";
  const nftStatusLabel =
    uiStatus.value === "pending"
      ? `Pending confirmation on ${chainLabel || "chain"}`
      : uiStatus.value === "failed"
        ? `Failed on ${chainLabel || "chain"}`
        : `Confirmed on ${chainLabel || "chain"}`;

  return {
    ...transaction,
    id: transaction._id || transaction.id || transaction.txHash,
    walletId: transaction.walletId || wallet?.walletId || "",
    walletLabel: wallet?.label || "",
    walletAddress: wallet?.address || "",
    walletNetwork: wallet?.network || "",
    chain: wallet?.chain || chainMeta?.code || "",
    chainMeta: chainMeta || null,
    chainLabel,
    networkLabel,
    chainTimestamp: transaction.chainTimestamp || null,
    confirmedAt: transaction.confirmedAt || null,
    createdAt: transaction.createdAt || null,
    updatedAt: transaction.updatedAt || null,
    type: isSwap ? "swap" : direction === "incoming" ? "received" : "sent",
    direction,
    symbol,
    assetType,
    isSwap,
    isNft,
    nft,
    standard: normalizeString(transaction.standard || nft.standard).toUpperCase(),
    contractAddress: normalizeString(transaction.contractAddress || nft.contractAddress),
    tokenId: normalizeString(transaction.tokenId || nft.tokenId),
    displayTimestamp,
    date: formatDateLabel(displayTimestamp),
    dateTimeLabel: formatDateTimeLabel(displayTimestamp),
    displayTitle,
    displaySubtitle,
    displayDirection: isSwap
      ? "Swap"
      : isNft
      ? direction === "incoming"
        ? "Received NFT"
        : "Sent NFT"
      : direction === "incoming"
        ? "Received"
        : "Sent",
    displayAmount: isSwap
      ? `${destinationAmount} ${destinationAsset}`.trim()
      : isNft
      ? normalizeString(nft.tokenId)
        ? normalizeString(nft.tokenId).length > 20
          ? `Token #${truncateMiddle(normalizeString(nft.tokenId), 8, 8)}`
          : `Token #${normalizeString(nft.tokenId)}`
        : normalizeString(nft.standard || "NFT")
      : `${direction === "incoming" ? "+" : "-"}${formatCryptoAmount(transaction.amount)} ${symbol}`.trim(),
    displayAmountSecondary: isNft
      ? normalizeString(nft.collectionName || nft.collectionSymbol || "")
      : null,
    displayStatus: uiStatus.value,
    statusTone: uiStatus.tone,
    statusLabel: uiStatus.label,
    statusDetailLabel: isNft ? nftStatusLabel : uiStatus.label,
    counterpartyAddress,
    counterpartyName:
      isSwap
        ? sourceAsset && destinationAsset
          ? `Swap ${sourceAsset} -> ${destinationAsset}`
          : "Swap"
        : transaction.transactionType === "internal"
        ? direction === "incoming"
          ? "Internal Transfer In"
          : "Internal Transfer Out"
        : truncateAddress(counterpartyAddress),
    counterpartyId: counterpartyAddress,
    transactionHash: transaction.txHash || "",
    address: counterpartyAddress,
    explorerUrl,
    networkFeeFiat:
      Number(
        transaction.networkFee ||
        transaction.fee ||
        transaction.executionParams?.fee ||
        0
      ) * Number(balance?.priceUsd ?? balance?.market?.priceUsd ?? 0),
    fiatAmount:
      Number((isSwap ? destinationAmount : transaction.amount) || 0) *
      (!transaction.asset ||
        !balance?.asset ||
        String((isSwap ? destinationAsset : transaction.asset) || "").toLowerCase() ===
        String(balance.asset).toLowerCase()
        ? Number(balance?.priceUsd ?? balance?.market?.priceUsd ?? 0)
        : Number(
          (balance?.tokenBalances || []).find(
            (t) =>
              String(t.asset || t.symbol || t.code || "").toLowerCase() ===
              String((isSwap ? destinationAsset : transaction.asset) || "").toLowerCase()
          )?.priceUsd || 0
        )),
    sourceAmount,
    sourceAsset,
    destinationAmount,
    destinationAsset,
    isIncoming: !isSwap && direction === "incoming",
    isOutgoing: !isSwap && direction === "outgoing",
    destinationTag:
      transaction.destinationTag ?? transaction.executionParams?.destinationTag ?? null,
  };
}

export const fetchTransactionsThunk = createAsyncThunk(
  "transaction/fetchTransactions",
  async (walletId, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.accessToken || state.auth.token;
      const wallet = state.wallet.items.find((item) => item.walletId === walletId) || null;
      const existingItems = Array.isArray(state.transaction?.byWalletId?.[walletId])
        ? state.transaction.byWalletId[walletId]
        : [];
      const hasLoadedTransactions = Boolean(
        state.transaction?.hasLoadedOnceByWalletId?.[walletId],
      );
      const lastFetchedAt = state.transaction?.lastFetchedAtByWalletId?.[walletId] || 0;
      const requestKey = String(walletId || "").trim();

      if (!wallet) {
        return {
          walletId,
          items: [],
        };
      }

      if (
        hasLoadedTransactions &&
        isFreshEnough(lastFetchedAt, TRANSACTION_FRESHNESS_MS)
      ) {
        return {
          walletId,
          items: existingItems,
        };
      }

      const inFlightRequest = walletTransactionFetchInFlight.get(requestKey);
      if (inFlightRequest) {
        return await inFlightRequest;
      }

      const chainMeta = getChainMeta(wallet?.chain);
      const balance = state.balance.byWalletId[walletId] || null;
      const requestPromise = listWalletTransactions(token, walletId)
        .then((response) => {
          const items = normalizeTransactionList(response).map((transaction) =>
            normalizeTransaction(transaction, wallet, balance, chainMeta),
          );

          return {
            walletId,
            items,
          };
        })
        .finally(() => {
          walletTransactionFetchInFlight.delete(requestKey);
        });

      walletTransactionFetchInFlight.set(requestKey, requestPromise);
      return await requestPromise;
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to load transactions"));
    }
  },
);

export const refreshWalletTransactionsThunk = createAsyncThunk(
  "transaction/refreshWalletTransactions",
  async (walletId, { dispatch, getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.accessToken || state.auth.token;
      const requestKey = String(walletId || "").trim();
      const inFlightRequest = walletTransactionRefreshInFlight.get(requestKey);

      if (inFlightRequest) {
        return await inFlightRequest;
      }

      const requestPromise = Promise.resolve()
        .then(async () => {
          await syncWalletTransactions(token, walletId)
            .then((result) => normalizeTransactionSyncResult(result))
            .catch(() => null);

          return await dispatch(fetchTransactionsThunk(walletId)).unwrap();
        })
        .finally(() => {
          walletTransactionRefreshInFlight.delete(requestKey);
        });

      walletTransactionRefreshInFlight.set(requestKey, requestPromise);
      return await requestPromise;
    } catch (error) {
      return rejectWithValue(
        serializeRequestError(error, "Failed to refresh transactions"),
      );
    }
  },
);

export const fetchUserTransactionsThunk = createAsyncThunk(
  "transaction/fetchUserTransactions",
  async (query, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.accessToken || state.auth.token;
      const wallets = state.wallet.items || [];
      const supportedChains = state.chain.supported || [];
      const balances = state.balance.byWalletId || {};

      const response = await listUserTransactions(token, query);
      const rawItems = normalizeTransactionList(response);

      const groupedByWallet = {};
      rawItems.forEach((tx) => {
        const walletId = resolveWalletIdForTransaction(tx, wallets);

        if (!groupedByWallet[walletId]) {
          groupedByWallet[walletId] = [];
        }

        const wallet = wallets.find((w) => w.walletId === walletId) || null;
        const chainMeta = getChainMeta(wallet?.chain || tx.chain, supportedChains);
        const balance = balances[walletId] || null;

        groupedByWallet[walletId].push(
          normalizeTransaction(tx, wallet, balance, chainMeta),
        );
      });

      return {
        groupedByWallet,
        totalItems: rawItems.length,
      };
    } catch (error) {
      return rejectWithValue(
        serializeRequestError(error, "Failed to load account transactions"),
      );
    }
  },
);

export const refreshUserTransactionsThunk = createAsyncThunk(
  "transaction/refreshUserTransactions",
  async (query, { dispatch, getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.accessToken || state.auth.token;
      const visibleWalletIds = getVisibleWalletIdsFromState(state);

      await syncWalletTransactionsSequentially(token, visibleWalletIds);

      return await dispatch(fetchUserTransactionsThunk(query || {})).unwrap();
    } catch (error) {
      return rejectWithValue(
        serializeRequestError(error, "Failed to refresh account transactions"),
      );
    }
  },
);

export const previewTransactionThunk = createAsyncThunk(
  "transaction/previewTransaction",
  async (payload, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.accessToken || state.auth.token;
      const wallet = state.wallet.items.find((item) => item.walletId === payload.walletId) || null;

      return normalizeTransactionPreview(
        await previewTransaction(token, {
          ...payload,
          chain: wallet?.chain || payload.chain || "",
        }),
      );
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to preview transaction"));
    }
  },
);

export const sendTransactionThunk = createAsyncThunk(
  "transaction/sendTransaction",
  async (payload, { dispatch, getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.accessToken || state.auth.token;
      const wallets = state.wallet.items || [];
      const wallet = wallets.find((item) => item.walletId === payload.walletId) || null;
      const balance = state.balance.byWalletId[payload.walletId] || null;
      const chainMeta = getChainMeta(wallet?.chain);
      const previewSnapshot =
        state.transaction.previewData && typeof state.transaction.previewData === "object"
          ? state.transaction.previewData
          : null;
      const result = normalizeTransactionRecord(
        await sendTransaction(token, {
          ...payload,
          chain: wallet?.chain || payload.chain || "",
        }),
      );
      const normalizedTransaction = normalizeTransaction(result, wallet, balance, chainMeta);
      const optimisticTransaction = {
        ...(previewSnapshot || {}),
        ...normalizedTransaction,
      };

      dispatch(
        applyOptimisticTransactionBalance({
          walletId: payload.walletId,
          transaction: optimisticTransaction,
        }),
      );
      void dispatch(
        refreshPostSendThunk({
          walletId: payload.walletId,
          transaction: optimisticTransaction,
        }),
      );

      return normalizedTransaction;
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to send transaction"));
    }
  },
);

export function refreshPostSendThunk({ walletId = "", transaction = null } = {}) {
  return async (dispatch, getState) => {
    const state = getState();
    const wallets = state.wallet.items || [];
    const recipientWalletId = resolveRecipientWalletIdForRefresh(
      wallets,
      walletId,
      transaction || {},
    );
    const balanceRefreshWalletIds = Array.from(
      new Set([walletId, recipientWalletId].filter(Boolean)),
    );
    const transactionRefreshWalletIds = balanceRefreshWalletIds;

    await Promise.allSettled(
      balanceRefreshWalletIds.map((nextWalletId) =>
        dispatch(
          fetchWalletBalanceThunk({ walletId: nextWalletId, force: true }),
        ).unwrap(),
      ),
    );

    for (const nextWalletId of transactionRefreshWalletIds) {
      try {
        await dispatch(refreshWalletTransactionsThunk(nextWalletId)).unwrap();
      } catch (_error) {
        // Post-send refresh should still load whatever history is already stored.
      }
    }
  };
}

export const validateDestinationThunk = createAsyncThunk(
  "transaction/validateDestination",
  async (payload, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.accessToken || state.auth.token;
      const wallet = state.wallet.items.find((item) => item.walletId === payload.walletId) || null;

      return normalizeDestinationValidation(
        await validateDestination(token, {
          ...payload,
          chain: wallet?.chain || payload.chain || "",
        }),
      );
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to validate destination"));
    }
  },
);

const transactionSlice = createSlice({
  name: "transaction",
  initialState,
  reducers: {
    clearTransactionState(state) {
      state.byWalletId = {};
      state.status = "idle";
      state.error = "";
      state.previewData = null;
      state.sendResult = null;
      state.historyRefreshToken = 0;
      state.hasLoadedOnceByWalletId = {};
      state.lastFetchedAtByWalletId = {};
      state.requestStatusByWalletId = {};
    },
    clearPreviewData(state) {
      state.previewData = null;
    },
    clearSendResult(state) {
      state.sendResult = null;
    },
    requestHistoryRefresh(state) {
      state.historyRefreshToken += 1;
    },
    upsertLiveTransaction(state, action) {
      if (!action.payload) return;

      const wallets = action.payload.wallets || [];
      const targetTransaction = action.payload.transaction || action.payload;

      const walletId = resolveWalletIdForTransaction(targetTransaction, wallets);

      if (!walletId) {
        return;
      }

      state.byWalletId[walletId] = upsertTransactionList(
        state.byWalletId[walletId] || [],
        targetTransaction,
      );
      state.hasLoadedOnceByWalletId[walletId] = true;
      state.lastFetchedAtByWalletId[walletId] = Date.now();
      state.requestStatusByWalletId[walletId] = "idle";

      if (
        state.sendResult &&
        getTransactionIdentity(state.sendResult) ===
          getTransactionIdentity(targetTransaction)
      ) {
        state.sendResult = {
          ...state.sendResult,
          ...targetTransaction,
        };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTransactionsThunk.pending, (state, action) => {
        state.status = "loading";
        state.error = "";
        state.requestStatusByWalletId[action.meta.arg] = "loading";
      })
      .addCase(fetchTransactionsThunk.fulfilled, (state, action) => {
        state.status = "idle";
        state.byWalletId[action.payload.walletId] = action.payload.items;
        state.hasLoadedOnceByWalletId[action.payload.walletId] = true;
        state.lastFetchedAtByWalletId[action.payload.walletId] = Date.now();
        state.requestStatusByWalletId[action.payload.walletId] = "idle";
      })
      .addCase(fetchTransactionsThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || action.payload || "Failed to load transactions";
        state.requestStatusByWalletId[action.meta.arg] = "error";
        // Prevent infinite loop in AppProvider by ensuring the key exists
        const walletId = action.meta.arg;
        if (walletId && !state.byWalletId[walletId]) {
          state.byWalletId[walletId] = [];
        }
      })
      .addCase(fetchUserTransactionsThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(fetchUserTransactionsThunk.fulfilled, (state, action) => {
        state.status = "idle";
        Object.entries(action.payload.groupedByWallet).forEach(([walletId, items]) => {
          const existing = state.byWalletId[walletId] || [];
          const combined = [...existing, ...items];

          state.byWalletId[walletId] = Array.from(
            new Map(combined.map((tx) => [tx.id, tx])).values(),
          ).sort((a, b) => getTxTimestamp(b) - getTxTimestamp(a));

          state.hasLoadedOnceByWalletId[walletId] = true;
          state.lastFetchedAtByWalletId[walletId] = Date.now();
          state.requestStatusByWalletId[walletId] = "idle";
        });
      })
      .addCase(fetchUserTransactionsThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || "Failed to load account history";
      })
      .addCase(previewTransactionThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(previewTransactionThunk.fulfilled, (state, action) => {
        state.status = "idle";
        state.previewData = action.payload;
      })
      .addCase(previewTransactionThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || action.payload || "Failed to preview transaction";
      })
      .addCase(sendTransactionThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
        state.sendResult = null;
      })
      .addCase(sendTransactionThunk.fulfilled, (state, action) => {
        state.status = "idle";
        state.previewData = null;
        state.sendResult = action.payload;
      })
      .addCase(sendTransactionThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || action.payload || "Failed to send transaction";
      })
      .addCase(validateDestinationThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(validateDestinationThunk.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(validateDestinationThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.payload?.message || action.payload || "Failed to validate destination";
      });
  },
});

export const {
  clearPreviewData,
  clearSendResult,
  clearTransactionState,
  requestHistoryRefresh,
  upsertLiveTransaction,
} = transactionSlice.actions;

export default transactionSlice.reducer;
