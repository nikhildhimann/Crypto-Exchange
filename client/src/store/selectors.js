import { createSelector } from "@reduxjs/toolkit";

import {
  getChainMeta,
  getTokenMeta,
  getNetworkOptions,
} from "../config/chains";
import { hasLoadedBalanceEntry } from "./balanceSlice";
import {
  normalizeWallet,
  resolveWalletBalanceEntry,
} from "./walletSlice";
import { buildNftCollectionDetailKey } from "./nftSlice";
import normalizeAssetMarketData from "../lib/assets";

const NETWORK_ORDER = {
  mainnet: 0,
  testnet: 1,
  preprod: 2,
  devnet: 3,
};

function sortNetworkCodes(networkCodes = []) {
  return [...networkCodes].sort((left, right) => {
    const leftPriority = NETWORK_ORDER[left] ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = NETWORK_ORDER[right] ?? Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.localeCompare(right);
  });
}

function resolveDisplayFiatValue(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return numericValue;
}

function resolveWalletFiatValue(wallet = {}) {
  const normalized = normalizeAssetMarketData(wallet);
  return normalized?.fiatValue ?? 0;
}

function resolveTokenFiatValue(tokenBalance = {}, tokenMeta = {}) {
  const explicitFiatValue = resolveDisplayFiatValue(
    tokenBalance?.fiatValue ??
      tokenBalance?.usdValue ??
      tokenBalance?.metadata?.fiatValue ??
      0,
  );

  if (explicitFiatValue) {
    return explicitFiatValue;
  }

  const fiatRateHint = Number(tokenMeta?.fiatRateHint || 0);
  if (!Number.isFinite(fiatRateHint) || fiatRateHint <= 0) {
    return 0;
  }

  const tokenBalanceValue = Number.parseFloat(
    tokenBalance?.availableBalance ?? tokenBalance?.balance ?? "0",
  );

  if (!Number.isFinite(tokenBalanceValue)) {
    return 0;
  }

  return tokenBalanceValue * fiatRateHint;
}

function buildWalletIdentityKey(wallet = {}) {
  return (
    String(wallet?.walletId || wallet?.id || "").trim() ||
    [
      String(wallet?.chain || "")
        .trim()
        .toLowerCase(),
      String(wallet?.network || "")
        .trim()
        .toLowerCase(),
      String(wallet?.address || "").trim(),
    ]
      .filter(Boolean)
      .join(":")
  );
}

function buildWalletAssetEntry(wallet) {
  const displayBalance = String(wallet?.balance ?? "0") || "0";
  const availableBalance =
    String(wallet?.availableBalance ?? displayBalance) || displayBalance;
  const onChainBalance =
    String(wallet?.onChainBalance ?? displayBalance) || displayBalance;

  return {
    id: buildWalletIdentityKey(wallet),
    walletId: wallet.walletId,
    name: wallet.chainMeta?.name || wallet.asset,
    symbol: wallet.asset,
    asset: wallet.asset,
    iconUrl: wallet.chainMeta?.icon || null,
    color: wallet.chainMeta?.color || "#4F46E5",
    balance: displayBalance,
    availableBalance,
    onChainBalance,
    fiatValue: resolveWalletFiatValue(wallet),
    change: 0,
    address: wallet.address,
    network: wallet.network,
    label: wallet.name,
    wallet,
    chain: wallet.chain,
    chainMeta: wallet.chainMeta || null,
    explorerUrl: wallet.explorerUrl || "",
    explorer: wallet.explorer || null,
    hasBalanceLoaded: wallet?.hasBalanceLoaded === true,
    assetType: "native",
    standard: "native",
    contractAddress: null,
    token: null,
  };
}

function buildTokenAssetId(walletId, tokenBalance = {}) {
  const tokenKey =
    String(tokenBalance.contractAddress || "")
      .trim()
      .toLowerCase() ||
    String(
      tokenBalance.code || tokenBalance.asset || tokenBalance.symbol || "token",
    )
      .trim()
      .toLowerCase();

  return `${walletId}:${tokenKey}`;
}

function buildTokenAssetEntries(wallet, balance, supportedChains) {
  const tokenBalances = Array.isArray(balance?.tokenBalances)
    ? balance.tokenBalances
    : [];

  return tokenBalances.map((tokenBalance) => {
    const tokenMeta =
      getTokenMeta(
        wallet.chain,
        tokenBalance.code || tokenBalance.asset || tokenBalance.symbol,
        supportedChains,
        { contractAddress: tokenBalance.contractAddress },
      ) || {};
    const symbol = String(
      tokenMeta.asset ||
        tokenMeta.symbol ||
        tokenBalance.asset ||
        tokenBalance.currency ||
        tokenBalance.symbol ||
        "",
    )
      .trim()
      .toUpperCase();
    const displayName =
      tokenMeta.name ||
      tokenMeta.label ||
      tokenBalance.label ||
      symbol ||
      "Token";
    const availableBalance = String(
      tokenBalance.availableBalance ?? tokenBalance.balance ?? "0",
    );
    const totalBalance = String(tokenBalance.balance ?? availableBalance);

    return {
      id: buildTokenAssetId(wallet.walletId, tokenBalance),
      walletId: wallet.walletId,
      name: displayName,
      symbol,
      asset: symbol,
      iconUrl: tokenMeta.icon || wallet.chainMeta?.icon || null,
      color: tokenMeta.color || wallet.chainMeta?.color || "#4F46E5",
      balance: totalBalance,
      availableBalance,
      onChainBalance: totalBalance,
      fiatValue: resolveTokenFiatValue(tokenBalance, tokenMeta),
      change: 0,
      address: wallet.address,
      network: wallet.network,
      label: wallet.name,
      wallet,
      chain: wallet.chain,
      chainMeta: wallet.chainMeta || null,
      assetType: String(
        tokenBalance.assetType || tokenMeta.assetType || "token",
      ).toLowerCase(),
      standard: String(
        tokenBalance.standard || tokenMeta.standard || "token",
      ).toLowerCase(),
      contractAddress:
        tokenBalance.contractAddress || tokenMeta.contractAddress || null,
      token: {
        ...tokenMeta,
        ...tokenBalance,
      },
    };
  });
}

function normalizeComparableDisplayValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildPortfolioRowDisplayModel(
  asset = {},
  duplicateNativeSymbols = new Set(),
) {
  const balanceLabel = `${String(asset.balance ?? "0")} ${asset.symbol}`;
  const chainLabel = String(asset.chainMeta?.name || asset.chain || "").trim();
  const symbol = String(asset.symbol || asset.asset || "")
    .trim()
    .toUpperCase();
  const baseName = String(asset.name || symbol || "Asset").trim();
  const isToken = String(asset.assetType || "").toLowerCase() === "token";

  if (isToken) {
    const displayTitle =
      chainLabel &&
      normalizeComparableDisplayValue(baseName) ===
        normalizeComparableDisplayValue(chainLabel) &&
      symbol
        ? `${baseName} (${symbol})`
        : baseName;

    return {
      ...asset,
      displayTitle,
      displaySubtitle: chainLabel
        ? `${balanceLabel} • ${chainLabel}`
        : balanceLabel,
      displayKind: "token",
      displayKindLabel: "Token",
    };
  }

  return {
    ...asset,
    displayTitle: chainLabel || baseName,
    displaySubtitle:
      duplicateNativeSymbols.has(symbol) && chainLabel
        ? `${balanceLabel} • ${chainLabel}`
        : balanceLabel,
    displayKind: "native",
    displayKindLabel: "Native",
  };
}

export const selectToken = (state) => state.auth.token;
export const selectAccessToken = (state) =>
  state.auth.accessToken || state.auth.token;
export const selectRefreshToken = (state) => state.auth.refreshToken;
export const selectUserId = (state) => state.auth.userId;
export const selectAuthUser = (state) => state.auth.user || null;
export const selectAuthRole = (state) =>
  state.auth.role || state.auth.user?.role || "";
export const selectAuthRoles = (state) =>
  Array.isArray(state.auth.roles)
    ? state.auth.roles
    : state.auth.role
      ? [state.auth.role]
      : [];
export const selectAuthPermissions = (state) =>
  Array.isArray(state.auth.permissions) ? state.auth.permissions : [];
export const selectSessionState = (state) =>
  state.auth.sessionState || "unknown";
export const selectHasStoredSession = (state) =>
  Boolean(
    state.auth.token ||
    state.auth.accessToken ||
    state.auth.refreshToken ||
    state.auth.sessionId,
  );
export const selectIsAuthenticated = createSelector(
  [selectSessionState, selectHasStoredSession],
  (sessionState, hasStoredSession) =>
    sessionState === "active" && hasStoredSession,
);
export const selectUnlockState = (state) => state.unlock;
export const selectAutoLockMinutes = (state) =>
  state.unlock.autoLockMinutes || 5;
export const selectHasPin = (state) =>
  Boolean(state.unlock.pinHash && state.unlock.pinSalt);

export const selectSupportedChains = createSelector(
  [(state) => state.chain.supported],
  (supported) => (Array.isArray(supported) ? supported : []),
);

export const selectFirstSupportedChain = createSelector(
  [selectSupportedChains],
  (supportedChains) => supportedChains[0] || null,
);

export const selectWallets = createSelector(
  [(state) => state.wallet.items],
  (wallets) => (Array.isArray(wallets) ? wallets : []),
);
export const selectActiveWalletId = (state) => state.wallet.activeWalletId;
export const selectSelectedNetwork = (state) =>
  state.wallet.selectedNetwork || "";
export const selectBalancesByWalletId = (state) => state.balance.byWalletId;
export const selectPreviewData = (state) => state.transaction.previewData;
export const selectSendResult = (state) => state.transaction.sendResult;
export const selectHistoryRefreshToken = (state) =>
  state.transaction.historyRefreshToken || 0;
export const selectNotifications = (state) => state.notification.items;
export const selectUnreadNotificationCount = (state) =>
  state.notification.unreadCount || 0;
export const selectWalletsLoading = (state) =>
  state.wallet.status === "loading";
export const selectBalancesLoading = (state) =>
  state.balance.status === "loading";
export const selectNotificationsLoading = (state) =>
  state.notification.status === "loading";
export const selectTransactionsLoading = (state) =>
  state.transaction.status === "loading";
export const selectBalancesHaveLoadedOnce = (state) =>
  Boolean(state.balance.hasLoadedOnce);
export const selectBalanceLastFetchedAt = (state) =>
  Number(state.balance.lastFetchedAt || 0) || 0;
export const selectBalanceLastFullFetchedAt = (state) =>
  Number(state.balance.lastFullFetchedAt || 0) || 0;
export const selectBalanceLastFetchedAtByWalletId = (state) =>
  state.balance.lastFetchedAtByWalletId || {};
export const selectNotificationsHaveLoadedOnce = (state) =>
  Boolean(state.notification.hasLoadedOnce);
export const selectNotificationsLastFetchedAt = (state) =>
  Number(state.notification.lastFetchedAt || 0) || 0;
export const selectTransactionsLastFetchedAtByWalletId = (state) =>
  state.transaction.lastFetchedAtByWalletId || {};
export const selectTransactionsHaveLoadedOnceByWalletId = (state) =>
  state.transaction.hasLoadedOnceByWalletId || {};

export const selectActiveWalletRaw = createSelector(
  [selectWallets, selectActiveWalletId, selectSelectedNetwork],
  (wallets, activeWalletId, selectedNetwork) => {
    const requestedWallet =
      wallets.find(
        (wallet) =>
          wallet.walletId === activeWalletId &&
          (!selectedNetwork || wallet.network === selectedNetwork),
      ) || null;

    if (requestedWallet) {
      return requestedWallet;
    }

    return (
      wallets.find(
        (wallet) => !selectedNetwork || wallet.network === selectedNetwork,
      ) || null
    );
  },
);

export const selectSelectedChainCode = createSelector(
  [selectActiveWalletRaw, selectFirstSupportedChain],
  (activeWalletRaw, firstSupportedChain) =>
    activeWalletRaw?.chain || firstSupportedChain?.code || "",
);

export const selectSelectedChainMeta = createSelector(
  [selectSupportedChains, selectSelectedChainCode],
  (supportedChains, chainCode) =>
    chainCode ? getChainMeta(chainCode, supportedChains) : null,
);

export const selectSelectedNetworkCode = createSelector(
  [selectSelectedNetwork, selectActiveWalletRaw],
  (selectedNetwork, activeWalletRaw) =>
    selectedNetwork || activeWalletRaw?.network || "",
);

export const selectActiveChainMeta = createSelector(
  [selectSupportedChains, selectActiveWalletRaw, selectSelectedChainMeta],
  (supportedChains, wallet, selectedChainMeta) =>
    wallet?.chain
      ? getChainMeta(wallet.chain, supportedChains)
      : selectedChainMeta || null,
);

export const selectActiveBalance = createSelector(
  [selectBalancesByWalletId, selectActiveWalletRaw],
  (balancesByWalletId, activeWalletRaw) =>
    (activeWalletRaw?.walletId ? balancesByWalletId[activeWalletRaw.walletId] : null) || null,
);

export const selectCurrency = createSelector(
  [selectActiveBalance, selectActiveChainMeta],
  (activeBalance, activeChainMeta) =>
    activeBalance?.currency ||
    activeBalance?.asset ||
    activeChainMeta?.symbol ||
    "",
);

export const selectSupportsDestinationTag = createSelector(
  [selectActiveChainMeta],
  (activeChainMeta) => Boolean(activeChainMeta?.supportsDestinationTag),
);

export const selectActiveWallet = createSelector(
  [selectActiveWalletRaw, selectActiveBalance, selectActiveChainMeta],
  (activeWalletRaw, activeBalance, activeChainMeta) => {
    if (!activeWalletRaw) {
      return null;
    }

    return normalizeWallet(activeWalletRaw, activeBalance, activeChainMeta);
  },
);

export const selectWalletCards = createSelector(
  [selectWallets, selectBalancesByWalletId, selectSupportedChains],
  (wallets, balancesByWalletId, supportedChains) =>
    wallets.map((wallet) => {
      const chainMeta = getChainMeta(wallet.chain, supportedChains);
      const balanceEntry = resolveWalletBalanceEntry(
        wallet,
        balancesByWalletId[wallet.walletId] || null,
        chainMeta,
      );
      const normalizedWallet = normalizeWallet(
        wallet,
        balanceEntry,
        chainMeta,
      );
      const normalizedMarketWallet = normalizeAssetMarketData(normalizedWallet);
      const hasBalanceLoaded = hasLoadedBalanceEntry(balanceEntry);
      const fiatValue = hasBalanceLoaded
        ? resolveWalletFiatValue(normalizedMarketWallet)
        : 0;
      const priceUsd = hasBalanceLoaded
        ? Number(normalizedMarketWallet?.priceUsd || 0) || 0
        : 0;
      const change24h = hasBalanceLoaded
        ? Number(
            normalizedMarketWallet?.change24h ??
              normalizedMarketWallet?.change ??
              0,
          ) || 0
        : 0;
      const usdValue = hasBalanceLoaded
        ? Number(
            normalizedMarketWallet?.usdValue ??
              normalizedMarketWallet?.fiatValue ??
              fiatValue,
          ) || 0
        : 0;

      return {
        ...normalizedMarketWallet,
        hasBalanceLoaded,
        fiatValue,
        currentFiatValue: fiatValue,
        usdValue,
        priceUsd,
        change24h,
        market: normalizedWallet.market ||
          normalizedMarketWallet.market || {
            priceUsd,
            change24h,
          },
      };
    }),
);

function normalizeDisplayString(value) {
  return typeof value === "string"
    ? value.trim()
    : value == null
      ? ""
      : String(value).trim();
}

const selectAccounts = createSelector(
  [(state) => state.account.items],
  (accounts) => (Array.isArray(accounts) ? accounts : []),
);

const selectActiveAccountIdState = (state) =>
  state.account.activeAccountId || null;

function resolveWalletDisplayTitle(wallet = {}, account = null) {
  const explicitWalletLabel = normalizeDisplayString(wallet.label);
  const genericWalletLabel = normalizeDisplayString(
    wallet.walletLabel || wallet.displayName || wallet.name,
  );
  const accountName = normalizeDisplayString(account?.name);

  if (accountName) {
    return accountName;
  }

  if (
    explicitWalletLabel &&
    (!genericWalletLabel ||
      explicitWalletLabel.toLowerCase() !== genericWalletLabel.toLowerCase())
  ) {
    return explicitWalletLabel;
  }

  if (explicitWalletLabel) {
    return explicitWalletLabel;
  }

  return (
    genericWalletLabel || wallet.chainName || wallet.asset || "Main Wallet"
  );
}

function resolveWalletDisplayMeta(wallet = {}, account = null) {
  const accountName = normalizeDisplayString(account?.name);

  if (wallet.balanceLabel) {
    return wallet.balanceLabel;
  }

  if (accountName && wallet.networkLabel) {
    return `${accountName} • ${wallet.networkLabel}`;
  }

  return wallet.networkLabel || accountName || "";
}

function resolveAccountDisplayTitle(account = {}, index = 0) {
  return (
    normalizeDisplayString(account?.name) ||
    normalizeDisplayString(account?.label) ||
    normalizeDisplayString(account?.type) ||
    `Account ${index + 1}`
  );
}

function resolveAccountDisplayMeta(account = {}) {
  return (
    normalizeDisplayString(account?.type) ||
    normalizeDisplayString(account?.status) ||
    "Multi-coin account"
  );
}

function resolveDisplayInitial(value, fallback = "A") {
  const normalizedValue = normalizeDisplayString(value);
  return normalizedValue ? normalizedValue.charAt(0).toUpperCase() : fallback;
}

const selectAccountsById = createSelector([selectAccounts], (accounts) => {
  const accountsById = {};

  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (!account?.id) {
      continue;
    }

    accountsById[account.id] = account;
  }

  return accountsById;
});

function attachWalletDisplayModel(wallet = {}, accountsById = {}) {
  const account = wallet?.accountId
    ? accountsById[wallet.accountId] || null
    : null;
  const displayTitle = resolveWalletDisplayTitle(wallet, account);
  const displayMeta = resolveWalletDisplayMeta(wallet, account);

  return {
    ...wallet,
    account: account || null,
    accountName: normalizeDisplayString(account?.name) || "",
    displayTitle,
    displayMeta,
  };
}

export const selectWalletDisplayRows = createSelector(
  [selectWalletCards, selectAccountsById],
  (walletCards, accountsById) =>
    walletCards.map((wallet) => attachWalletDisplayModel(wallet, accountsById)),
);

export const selectAccountSwitcherRows = createSelector(
  [selectAccounts],
  (accounts) =>
    accounts.map((account, index) => {
      const displayTitle = resolveAccountDisplayTitle(account, index);

      return {
        ...account,
        accountId: account?.id || account?.accountId || null,
        displayTitle,
        displayMeta: resolveAccountDisplayMeta(account),
        displayInitial: resolveDisplayInitial(displayTitle),
        canArchive: accounts.length > 1,
      };
    }),
);

export const selectAvailableWalletNetworks = createSelector(
  [selectWalletCards],
  (walletCards) => {
    const seenNetworks = new Set();

    const uniqueNetworks = walletCards
      .map((wallet) => String(wallet.network || "").toLowerCase())
      .filter((network) => {
        if (!network || seenNetworks.has(network)) {
          return false;
        }

        seenNetworks.add(network);
        return true;
      });

    return sortNetworkCodes(uniqueNetworks);
  },
);

export const selectVisibleWalletDisplayRows = createSelector(
  [selectWalletDisplayRows, selectSelectedNetworkCode],
  (walletRows, selectedNetwork) =>
    walletRows.filter(
      (wallet) => !selectedNetwork || wallet.network === selectedNetwork,
    ),
);

export const selectVisibleWalletCards = createSelector(
  [selectWalletCards, selectSelectedNetworkCode],
  (walletCards, selectedNetwork) =>
    walletCards.filter(
      (wallet) => !selectedNetwork || wallet.network === selectedNetwork,
    ),
);

export const selectVisibleWalletIds = createSelector(
  [selectVisibleWalletCards],
  (visibleWalletCards) =>
    visibleWalletCards.map((wallet) => wallet.walletId).filter(Boolean),
);

export const selectCurrentWalletDisplayModel = createSelector(
  [
    selectVisibleWalletDisplayRows,
    selectWalletDisplayRows,
    selectActiveWalletId,
  ],
  (visibleWalletRows, walletRows, activeWalletId) =>
    visibleWalletRows.find(
      (wallet) =>
        wallet.walletId === activeWalletId || wallet.id === activeWalletId,
    ) ||
    walletRows.find(
      (wallet) =>
        wallet.walletId === activeWalletId || wallet.id === activeWalletId,
    ) ||
    visibleWalletRows[0] ||
    walletRows[0] ||
    null,
);

export const selectActiveAccountId = selectActiveAccountIdState;

export const selectActiveAccountDisplayModel = createSelector(
  [
    selectAccountSwitcherRows,
    selectActiveAccountIdState,
    selectCurrentWalletDisplayModel,
    selectActiveWallet,
  ],
  (accountRows, activeAccountId, currentWalletDisplay, activeWallet) => {
    const activeAccount =
      accountRows.find(
        (account) =>
          account.accountId === activeAccountId ||
          account.id === activeAccountId,
      ) ||
      accountRows[0] ||
      null;
    const representativeWallet = currentWalletDisplay || activeWallet || null;

    if (!activeAccount) {
      if (!representativeWallet) {
        return null;
      }

      const fallbackTitle = resolveWalletDisplayTitle(representativeWallet);

      return {
        id: representativeWallet?.accountId || null,
        accountId: representativeWallet?.accountId || null,
        displayTitle: fallbackTitle || "Crypto Wallet",
        displayMeta:
          representativeWallet?.displayMeta ||
          representativeWallet?.balanceLabel ||
          "",
        displayAddress:
          representativeWallet?.shortAddress ||
          representativeWallet?.address ||
          "",
        displayInitial: resolveDisplayInitial(fallbackTitle),
        icon:
          representativeWallet?.icon || representativeWallet?.iconUrl || null,
        representativeWallet,
      };
    }

    return {
      ...activeAccount,
      displayAddress:
        normalizeDisplayString(activeAccount?.displayAddress) ||
        normalizeDisplayString(activeAccount?.address) ||
        "",
      icon: activeAccount?.icon || null,
      representativeWallet,
    };
  },
);

export const selectActiveTransactions = createSelector(
  [(state) => state.transaction.byWalletId, selectActiveWalletRaw],
  (byWalletId, activeWalletRaw) => byWalletId[activeWalletRaw?.walletId] || [],
);

function getTransactionTimestamp(transaction) {
  const candidate =
    transaction?.displayTimestamp ||
    transaction?.chainTimestamp ||
    transaction?.confirmedAt ||
    transaction?.createdAt ||
    transaction?.updatedAt ||
    null;

  if (!candidate) {
    return 0;
  }

  const parsed = new Date(candidate).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeTransactionIdentityValue(value) {
  return String(value || "").trim();
}

const CLIENT_TRANSACTION_DEDUPE_WINDOW_MS = 15 * 60 * 1000;

function buildTransactionSignature(transaction = {}) {
  return [
    normalizeTransactionIdentityValue(transaction.userId),
    normalizeTransactionIdentityValue(transaction.accountId),
    normalizeTransactionIdentityValue(transaction.walletId),
    normalizeTransactionIdentityValue(transaction.chain).toLowerCase(),
    normalizeTransactionIdentityValue(transaction.network).toLowerCase(),
    normalizeTransactionIdentityValue(transaction.direction).toLowerCase(),
    normalizeTransactionIdentityValue(transaction.amountBaseUnits),
    normalizeTransactionIdentityValue(transaction.asset).toUpperCase(),
    normalizeTransactionIdentityValue(transaction.assetType).toLowerCase(),
    normalizeTransactionIdentityValue(transaction.standard).toLowerCase(),
    normalizeTransactionIdentityValue(transaction.contractAddress),
    normalizeTransactionIdentityValue(transaction.fromAddress),
    normalizeTransactionIdentityValue(transaction.toAddress),
  ].join("|");
}

function getTransactionPriority(transaction = {}) {
  const normalizedStatus = normalizeTransactionIdentityValue(
    transaction.status,
  ).toLowerCase();
  const hasTxHash = Boolean(
    normalizeTransactionIdentityValue(transaction.txHash),
  );

  if (normalizedStatus === "success") {
    return hasTxHash ? 5 : 4;
  }

  if (normalizedStatus === "failed") {
    return hasTxHash ? 4 : 3;
  }

  if (normalizedStatus === "pending") {
    return hasTxHash ? 2 : 1;
  }

  return hasTxHash ? 2 : 0;
}

function shouldTreatTransactionsAsDuplicate(left = {}, right = {}) {
  const leftTxHash = normalizeTransactionIdentityValue(left.txHash);
  const rightTxHash = normalizeTransactionIdentityValue(right.txHash);

  if (leftTxHash && rightTxHash && leftTxHash === rightTxHash) {
    return (
      normalizeTransactionIdentityValue(left.walletId) ===
      normalizeTransactionIdentityValue(right.walletId)
    );
  }

  if (buildTransactionSignature(left) !== buildTransactionSignature(right)) {
    return false;
  }

  const leftStatus = normalizeTransactionIdentityValue(
    left.status,
  ).toLowerCase();
  const rightStatus = normalizeTransactionIdentityValue(
    right.status,
  ).toLowerCase();
  const leftIsPendingWithoutHash = leftStatus === "pending" && !leftTxHash;
  const rightIsPendingWithoutHash = rightStatus === "pending" && !rightTxHash;
  const leftIsConfirmedWithHash =
    leftStatus === "success" && Boolean(leftTxHash);
  const rightIsConfirmedWithHash =
    rightStatus === "success" && Boolean(rightTxHash);

  if (
    !(
      (leftIsPendingWithoutHash && rightIsConfirmedWithHash) ||
      (rightIsPendingWithoutHash && leftIsConfirmedWithHash)
    )
  ) {
    return false;
  }

  const timeDelta = Math.abs(
    getTransactionTimestamp(left) - getTransactionTimestamp(right),
  );
  return timeDelta <= CLIENT_TRANSACTION_DEDUPE_WINDOW_MS;
}

function mergeVisibleTransactions(transactions = []) {
  const deduped = [];

  for (const transaction of transactions) {
    const duplicateIndex = deduped.findIndex((existing) =>
      shouldTreatTransactionsAsDuplicate(existing, transaction),
    );

    if (duplicateIndex === -1) {
      deduped.push(transaction);
      continue;
    }

    const existing = deduped[duplicateIndex];
    const existingPriority = getTransactionPriority(existing);
    const nextPriority = getTransactionPriority(transaction);

    if (
      nextPriority > existingPriority ||
      (nextPriority === existingPriority &&
        getTransactionTimestamp(transaction) >
          getTransactionTimestamp(existing))
    ) {
      deduped[duplicateIndex] = transaction;
    }
  }

  return deduped;
}

function normalizeSwapAsset(value = "") {
  return String(value || "").trim().toUpperCase();
}

function areDisplayAmountsEqual(left, right) {
  const leftText = normalizeTransactionIdentityValue(left);
  const rightText = normalizeTransactionIdentityValue(right);

  if (!leftText || !rightText) {
    return false;
  }

  if (leftText === rightText) {
    return true;
  }

  const leftNumber = Number(leftText);
  const rightNumber = Number(rightText);

  return (
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber) &&
    Math.abs(leftNumber - rightNumber) <=
      Math.max(1e-12, Math.abs(leftNumber) * 1e-10)
  );
}

function getSwapMetadata(transaction = {}) {
  const metadata = transaction?.metadata;
  const swap = metadata && typeof metadata === "object" ? metadata.swap : null;

  if (!swap || typeof swap !== "object") {
    return null;
  }

  return swap.swapId ? swap : null;
}

function isSourceSwapTransaction(transaction = {}) {
  return getSwapMetadata(transaction)?.role === "source_transfer";
}

function isMatchingSwapPayout(transaction = {}, sourceSwap = {}) {
  const swap = getSwapMetadata(sourceSwap) || {};
  const payoutTxHash = normalizeTransactionIdentityValue(swap.payoutTxHash);
  const txHash = normalizeTransactionIdentityValue(
    transaction.txHash || transaction.transactionHash,
  );

  if (payoutTxHash && txHash && payoutTxHash === txHash) {
    return true;
  }

  const destinationWalletId = normalizeTransactionIdentityValue(swap.toWalletId);
  const destinationAsset = normalizeSwapAsset(swap.destinationAsset);
  const receiveAmount = normalizeTransactionIdentityValue(
    swap.finalReceiveAmount || swap.estimatedReceiveAmount,
  );

  if (
    !destinationWalletId ||
    normalizeTransactionIdentityValue(transaction.walletId) !== destinationWalletId ||
    normalizeTransactionIdentityValue(transaction.direction).toLowerCase() !== "incoming" ||
    normalizeSwapAsset(transaction.asset || transaction.symbol || transaction.currency) !==
      destinationAsset
  ) {
    return false;
  }

  if (
    receiveAmount &&
    !areDisplayAmountsEqual(transaction.amount, receiveAmount)
  ) {
    return false;
  }

  const timeDelta = Math.abs(
    getTransactionTimestamp(transaction) - getTransactionTimestamp(sourceSwap),
  );
  return timeDelta <= 24 * 60 * 60 * 1000;
}

function buildSwapHistoryTransaction(sourceTransaction = {}) {
  const swap = getSwapMetadata(sourceTransaction) || {};
  const sourceAsset = normalizeSwapAsset(swap.sourceAsset || sourceTransaction.asset);
  const destinationAsset = normalizeSwapAsset(swap.destinationAsset);
  const receiveAmount =
    swap.finalReceiveAmount || swap.estimatedReceiveAmount || sourceTransaction.amount;
  const sourceAmount = swap.sourceAmount || sourceTransaction.amount;
  const status = String(swap.status || sourceTransaction.status || "pending").toLowerCase();
  const completed = ["completed", "success"].includes(status);
  const failed = ["failed", "payout_failed", "expired"].includes(status);
  const manualReview = status === "manual_review";
  const normalizedStatus = completed
    ? "success"
    : failed
      ? "failed"
      : manualReview
        ? "manual_review"
        : "pending";

  return {
    ...sourceTransaction,
    id: `swap:${swap.swapId || sourceTransaction.id}`,
    transactionId: sourceTransaction.id,
    type: "swap",
    direction: "swap",
    isSwap: true,
    isIncoming: false,
    isOutgoing: false,
    status: normalizedStatus,
    chainStatus:
      completed
        ? "confirmed"
        : failed
        ? "failed"
        : manualReview
        ? "manual_review"
        : "pending",
    succeeded: completed ? true : failed ? false : false,
    validated: completed || failed,
    counterpartyName: `Swap ${sourceAsset} \u2192 ${destinationAsset}`,
    counterpartyId: swap.swapId || sourceTransaction.counterpartyId || "",
    amount: receiveAmount,
    sourceAmount,
    sourceAsset,
    destinationAmount: receiveAmount,
    destinationAsset,
    symbol: destinationAsset,
    asset: destinationAsset,
    currency: destinationAsset,
    swap,
    sourceTxHash: swap.sourceTxHash || sourceTransaction.txHash || "",
    payoutTxHash: swap.payoutTxHash || "",
    sourceChain: swap.sourceChain || sourceTransaction.chain || "",
    sourceNetwork: swap.sourceNetwork || sourceTransaction.network || "",
    destinationChain: swap.destinationChain || "",
    destinationNetwork: swap.destinationNetwork || "",
    networkFee: swap.sourceNetworkFee || sourceTransaction.networkFee || "0",
    networkFeeAsset:
      sourceTransaction.networkFeeAsset || sourceTransaction.asset || sourceAsset,
    payoutNetworkFee: swap.payoutNetworkFee || "0",
    systemFeeAmount: swap.systemFeeAmount || "0",
  };
}

function mergeSwapTransactions(transactions = []) {
  const sourceSwaps = transactions.filter(isSourceSwapTransaction);
  if (!sourceSwaps.length) {
    return transactions;
  }

  const payoutTransactionIds = new Set();
  for (const sourceSwap of sourceSwaps) {
    transactions.forEach((transaction) => {
      if (transaction === sourceSwap) {
        return;
      }

      if (isMatchingSwapPayout(transaction, sourceSwap)) {
        payoutTransactionIds.add(normalizeTransactionIdentityValue(transaction.id));
      }
    });
  }

  return transactions
    .filter((transaction) => !payoutTransactionIds.has(normalizeTransactionIdentityValue(transaction.id)))
    .map((transaction) =>
      isSourceSwapTransaction(transaction)
        ? buildSwapHistoryTransaction(transaction)
        : transaction,
    );
}

export const selectVisibleTransactions = createSelector(
  [(state) => state.transaction.byWalletId, selectVisibleWalletIds],
  (byWalletId, visibleWalletIds) =>
    mergeVisibleTransactions(
      mergeSwapTransactions([
        ...visibleWalletIds.flatMap((walletId) => byWalletId[walletId] || []),
        ...(byWalletId.unresolved || []),
      ])
        .sort((left, right) => getTransactionTimestamp(right) - getTransactionTimestamp(left)),
    ),
);

export const selectBootStatus = createSelector(
  [
    (state) => state.auth.bootstrapped,
    (state) => state.auth.status,
    selectSessionState,
    (state) => state.chain.status,
    (state) => state.wallet.status,
  ],
  (bootstrapped, authStatus, sessionState, chainStatus, walletStatus) => {
    if (!bootstrapped) {
      return "booting";
    }

    if (authStatus === "loading") {
      return "booting";
    }

    if (
      sessionState === "active" &&
      (chainStatus === "loading" || walletStatus === "loading")
    ) {
      return "booting";
    }

    return "ready";
  },
);

export const selectAppError = createSelector(
  [
    (state) => state.auth.error,
    (state) => state.chain.error,
    (state) => state.wallet.error,
    (state) => state.balance.error,
    (state) => state.notification.error,
    (state) => state.transaction.error,
  ],
  (
    authError,
    chainError,
    walletError,
    balanceError,
    notificationError,
    transactionError,
  ) =>
    authError ||
    chainError ||
    walletError ||
    balanceError ||
    notificationError ||
    transactionError ||
    "",
);

export const selectNetworksForActiveChain = createSelector(
  [selectActiveChainMeta, selectFirstSupportedChain],
  (activeChainMeta, firstSupportedChain) =>
    getNetworkOptions(activeChainMeta || firstSupportedChain),
);

export const selectDefaultNetworkForChain = (chainId, supportedChains = []) =>
  (
    (Array.isArray(supportedChains)
      ? supportedChains.find(
          (item) =>
            item?.code === String(chainId || "").toLowerCase() ||
            item?.id === String(chainId || "").toLowerCase(),
        )
      : null) || {}
  ).defaultNetwork || "";

export const selectAppAccessState = createSelector(
  [
    selectSessionState,
    selectHasStoredSession,
    selectUnlockState,
    selectWallets,
    selectHasPin,
  ],
  (sessionState, hasStoredSession, unlockState, wallets, hasPin) => {
    if (sessionState !== "active" || !hasStoredSession) {
      return "logged_out";
    }

    if (wallets.length > 0 && !hasPin) {
      return "pin_setup_required";
    }

    if (wallets.length > 0 && hasPin && !unlockState.locallyUnlocked) {
      return "locked";
    }

    return "unlocked";
  },
);

export const selectAssets = createSelector(
  [selectWalletCards, selectBalancesByWalletId, selectSupportedChains],
  (walletCards, balancesByWalletId, supportedChains) =>
    walletCards
      .flatMap((wallet) => {
        const normalized = normalizeAssetMarketData(wallet);
        const nativeAsset = {
          ...buildWalletAssetEntry(wallet),
          fiatValue: normalized.fiatValue,
          priceUsd: normalized.priceUsd,
          change: normalized.change,
          change24h: normalized.change,
          market: wallet.market || {
            priceUsd: normalized.priceUsd,
            change24h: normalized.change,
          },
        };

        const tokenAssets = buildTokenAssetEntries(
          wallet,
          balancesByWalletId[wallet.walletId],
          supportedChains,
        );

        return [nativeAsset, ...tokenAssets];
      }),
);

export const selectPortfolioRows = createSelector([selectAssets], (assets) => {
  const duplicateNativeSymbols = assets.reduce((result, asset) => {
    if (String(asset?.assetType || "").toLowerCase() !== "native") {
      return result;
    }

    const symbol = String(asset?.symbol || asset?.asset || "")
      .trim()
      .toUpperCase();
    if (!symbol) {
      return result;
    }

    result.set(symbol, (result.get(symbol) || 0) + 1);
    return result;
  }, new Map());

  const sharedNativeSymbols = new Set(
    Array.from(duplicateNativeSymbols.entries())
      .filter(([, count]) => count > 1)
      .map(([symbol]) => symbol),
  );

  return assets.map((asset) =>
    buildPortfolioRowDisplayModel(asset, sharedNativeSymbols),
  );
});

export const selectVisibleAssets = createSelector(
  [selectAssets, selectSelectedNetworkCode],
  (assets, selectedNetwork) =>
    assets.filter(
      (asset) => !selectedNetwork || asset.network === selectedNetwork,
    ),
);

export const selectVisibleAssetsTotalFiat = createSelector(
  [selectVisibleAssets],
  (assets) =>
    assets.reduce(
      (sum, asset) =>
        sum + (Number(asset?.fiatValue ?? asset?.usdValue ?? 0) || 0),
      0,
    ),
);

export function selectNftState(state) {
  return state.nft || {};
}

export const NFT_SUPPORTED_CHAINS = ["polygon"];

export function normalizeNftChain(chain = "") {
  const normalized = String(chain || "").trim().toLowerCase();
  const baseChain = normalized.split("-")[0]; // handle polygon-mainnet etc
  if (baseChain === "polygon" || baseChain === "matic") {
    return "polygon";
  }
  return baseChain;
}

export function isNftSupportedChain(chain = "") {
  return NFT_SUPPORTED_CHAINS.includes(normalizeNftChain(chain));
}

export const selectNftSupportedWallets = createSelector(
  [selectWallets],
  (wallets) => wallets.filter((w) => isNftSupportedChain(w.chain)),
);

export function selectSelectedNftWalletId(state) {
  return state.nft?.selectedWalletId || "";
}

export const selectSelectedNftWallet = createSelector(
  [selectNftSupportedWallets, selectSelectedNftWalletId],
  (supportedWallets, selectedWalletId) => {
    if (!selectedWalletId) {
      return supportedWallets[0] || null;
    }
    return (
      supportedWallets.find((w) => w.walletId === selectedWalletId) ||
      supportedWallets[0] ||
      null
    );
  },
);

export const selectActiveWalletNfts = createSelector(
  [selectNftState, selectSelectedNftWallet],
  (nftState, selectedWallet) => {
    const walletId = selectedWallet?.walletId || "";
    return (
      nftState.listStateByWalletId?.[walletId]?.items ||
      nftState.itemsByWalletId?.[walletId] ||
      []
    );
  },
);

export const selectActiveWalletNftMeta = createSelector(
  [selectNftState, selectSelectedNftWallet],
  (nftState, selectedWallet) => {
    const walletId = selectedWallet?.walletId || "";
    return (
      nftState.listStateByWalletId?.[walletId]?.meta ||
      nftState.metaByWalletId?.[walletId] ||
      null
    );
  },
);

export const selectActiveWalletNftSync = createSelector(
  [selectActiveWalletNftMeta],
  (meta) => meta?.sync || null,
);

export const selectActiveWalletNftsLoading = createSelector(
  [selectNftState, selectSelectedNftWallet],
  (nftState, selectedWallet) => {
    const walletId = selectedWallet?.walletId || "";
    return Boolean(nftState.loadingByWalletId?.[walletId]);
  },
);

export const selectActiveWalletNftsSyncing = createSelector(
  [selectNftState, selectSelectedNftWallet, selectActiveWalletNftMeta],
  (nftState, selectedWallet, meta) => {
    const walletId = selectedWallet?.walletId || "";
    const collectionsMeta =
      nftState.collectionStateByWalletId?.[walletId]?.meta ||
      nftState.collectionsMetaByWalletId?.[walletId] ||
      null;
    const refreshState = nftState.refreshStateByWalletId?.[walletId] || null;

    return Boolean(
      nftState.syncingByWalletId?.[walletId] ||
      meta?.sync?.isSyncing ||
      collectionsMeta?.sync?.isSyncing ||
      refreshState?.loading,
    );
  },
);

export const selectActiveWalletNftsError = createSelector(
  [selectNftState, selectSelectedNftWallet],
  (nftState, selectedWallet) => {
    const walletId = selectedWallet?.walletId || "";
    return nftState.errorByWalletId?.[walletId] || null;
  },
);

export const selectSelectedNftItem = createSelector(
  [selectNftState],
  (nftState) => nftState.selectedItem || null,
);

export const selectSelectedNftLoading = createSelector(
  [selectNftState],
  (nftState) => Boolean(nftState.selectedItemLoading),
);

export const selectSelectedNftError = createSelector(
  [selectNftState],
  (nftState) => nftState.selectedItemError || null,
);

export const selectNftCollectionsByWalletId = (state) =>
  selectNftState(state).collectionsByWalletId || {};

export const selectNftCollectionsLoadingByWalletId = (state) =>
  selectNftState(state).collectionsLoadingByWalletId || {};

export const selectNftCollectionsMetaByWalletId = (state) =>
  selectNftState(state).collectionsMetaByWalletId || {};

export const selectNftRefreshStateByWalletId = (state) =>
  selectNftState(state).refreshStateByWalletId || {};

export const selectActiveWalletNftCollections = createSelector(
  [selectNftState, selectSelectedNftWalletId],
  (nftState, walletId) =>
    nftState.collectionStateByWalletId?.[walletId]?.items ||
    nftState.collectionsByWalletId?.[walletId] ||
    []
);

export const selectActiveWalletNftCollectionsLoading = createSelector(
  [selectNftCollectionsLoadingByWalletId, selectSelectedNftWalletId],
  (loadingByWalletId, walletId) => Boolean(loadingByWalletId[walletId])
);

export const selectActiveWalletNftCollectionsMeta = createSelector(
  [selectNftState, selectSelectedNftWalletId],
  (nftState, walletId) =>
    nftState.collectionStateByWalletId?.[walletId]?.meta ||
    nftState.collectionsMetaByWalletId?.[walletId] ||
    null,
);

export const selectActiveWalletNftCollectionsSync = createSelector(
  [selectActiveWalletNftCollectionsMeta],
  (meta) => meta?.sync || null,
);

export const selectActiveWalletNftRefreshState = createSelector(
  [selectNftRefreshStateByWalletId, selectSelectedNftWalletId],
  (refreshStateByWalletId, walletId) => refreshStateByWalletId[walletId] || null,
);

export const selectActiveWalletNftRefreshPending = createSelector(
  [selectActiveWalletNftRefreshState],
  (refreshState) => Boolean(refreshState?.loading),
);

export const selectActiveWalletNftRefreshError = createSelector(
  [selectActiveWalletNftRefreshState],
  (refreshState) => refreshState?.error || null,
);

export const selectNftCollectionDetailStateByKey = (state) =>
  selectNftState(state).collectionDetailStateByKey || {};

export const selectNftCollectionDetailEntry = (state, params = {}) => {
  const key = buildNftCollectionDetailKey(params);

  if (!key) {
    return null;
  }

  return selectNftCollectionDetailStateByKey(state)[key] || null;
};

export const selectNftCollectionDetailCollection = (state, params = {}) =>
  selectNftCollectionDetailEntry(state, params)?.collection || null;

export const selectNftCollectionDetailItems = (state, params = {}) =>
  selectNftCollectionDetailEntry(state, params)?.items || [];

export const selectNftCollectionDetailMeta = (state, params = {}) =>
  selectNftCollectionDetailEntry(state, params)?.meta || null;

export const selectNftCollectionDetailSync = (state, params = {}) =>
  selectNftCollectionDetailMeta(state, params)?.sync || null;

export const selectNftCollectionDetailLoading = (state, params = {}) =>
  Boolean(selectNftCollectionDetailEntry(state, params)?.loading);

export const selectNftCollectionDetailError = (state, params = {}) =>
  selectNftCollectionDetailEntry(state, params)?.error || null;

export const selectNftActivityByNftId = (state, nftId = "") =>
  selectNftState(state).activityByNftId?.[String(nftId || "").trim()] || null;

export const selectNftActivityItemsByNftId = (state, nftId = "") =>
  selectNftActivityByNftId(state, nftId)?.items || [];

export const selectNftActivityLoadingByNftId = (state, nftId = "") =>
  Boolean(selectNftActivityByNftId(state, nftId)?.loading);

export const selectNftActivityErrorByNftId = (state, nftId = "") =>
  selectNftActivityByNftId(state, nftId)?.error || null;

export const selectNftVisibilityLoadingByNftId = (state, nftId = "") =>
  Boolean(
    selectNftState(state).visibilityLoadingByNftId?.[String(nftId || "").trim()],
  );

export const selectNftVisibilityErrorByNftId = (state, nftId = "") =>
  selectNftState(state).visibilityErrorByNftId?.[String(nftId || "").trim()] || null;

export const selectNftVisibilityResultByNftId = (state, nftId = "") =>
  selectNftState(state).lastVisibilityResultByNftId?.[String(nftId || "").trim()] ||
  null;

export const selectNftFeeEstimateByNftId = (state, nftId = "") =>
  selectNftState(state).feeEstimateByNftId?.[String(nftId || "").trim()] || null;

export const selectNftFeeEstimateLoadingByNftId = (state, nftId = "") =>
  Boolean(selectNftFeeEstimateByNftId(state, nftId)?.loading);

export const selectNftFeeEstimateErrorByNftId = (state, nftId = "") =>
  selectNftFeeEstimateByNftId(state, nftId)?.error || null;
