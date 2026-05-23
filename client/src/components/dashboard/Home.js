import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Archive,
  RefreshCw,
  Eye,
  TrendingUp,
  TrendingDown,
  Scan,
  ChevronDown,
  Copy,
  Check,
  Bell,
  Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

import { Card } from "../ui/Card";
import { useAppContext } from "../../contexts/AppContext";
import { beginSetupIntent } from "../../lib/accountSetupFlow";
import { copyTextToClipboard } from "../../lib/clipboard";
import cryptoWalletLogo from "../../img/crypto-wallet-logo.png";
import normalizeAssetMarketData from "../../lib/assets";

const HOME_DROPDOWN_LIMIT = 7;
const HOME_DROPDOWN_POPULAR_SYMBOLS = [
  "BTC",
  "XRP",
  "SOL",
  "BNB",
  "LTC",
  "ETH",
  "ADA",
];

function formatBalance(value, digits = 2) {
  const normalizedValue =
    typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

  if (!normalizedValue) {
    return "";
  }

  return Number.parseFloat(normalizedValue).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 6,
  });
}

function formatFiat(value, fiatCurrency = "$") {
  return `${fiatCurrency}${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getWalletDisplayName(wallet) {
  return (
    wallet?.displayTitle ||
    wallet?.walletLabel ||
    wallet?.displayName ||
    wallet?.name ||
    wallet?.chainName ||
    wallet?.asset ||
    "Main Wallet"
  );
}

function getAccountDisplayName(account) {
  return account?.displayTitle || account?.name || "Crypto Wallet";
}

function getAccountDisplayMeta(account) {
  return account?.displayMeta || "No account selected";
}

function getAccountDisplayInitial(account) {
  return (getAccountDisplayName(account).charAt(0) || "A").toUpperCase();
}

function getWalletAddress(wallet) {
  return wallet?.address || wallet?.shortAddress || "Unavailable";
}

function formatCardAddress(address, start = 12, end = 12) {
  const normalized = String(address || "").trim();

  if (!normalized || normalized === "Unavailable") {
    return "Unavailable";
  }

  if (normalized.length <= start + end + 3) {
    return normalized;
  }

  return `${normalized.slice(0, start)}...${normalized.slice(-end)}`;
}

function getWalletId(wallet) {
  return (
    wallet?.walletId ||
    wallet?.id ||
    wallet?.address ||
    wallet?.asset ||
    "wallet"
  );
}

function getWalletNumericBalance(wallet) {
  const normalized = normalizeAssetMarketData(wallet);
  return normalized?.fiatValue ?? 0;
}

function mapWalletToAsset(wallet) {
  const normalized = normalizeAssetMarketData(wallet);

  return {
    id: getWalletId(wallet),
    walletId: wallet?.walletId || wallet?.id || "",
    name: wallet?.chainName || wallet?.asset || "Wallet",
    symbol: wallet?.asset || "",
    balance: wallet?.balance ?? "",
    balanceLabel: wallet?.balanceLabel || "",
    iconUrl: wallet?.icon || cryptoWalletLogo,
    color: wallet?.chainMeta?.color || "#6366F1",
    address: getWalletAddress(wallet),
    walletName: getWalletDisplayName(wallet),
    hasBalanceLoaded: wallet?.hasBalanceLoaded === true,
    // Enforce canonical market fields for UI consistency
    fiatValue: Number(normalized.fiatValue || 0),
    change: Number(normalized.change24h || 0),
    priceUsd: Number(normalized.priceUsd || 0),
  };
}

function getDisplayFiatValue(value) {
  return Number(value || 0) || 0;
}

function resolveTransactionStatus(tx = {}) {
  if (tx?.isSwap) {
    const normalizedStatus = String(tx?.status || "pending").trim().toLowerCase() || "pending";
    return normalizedStatus === "payout_failed" ? "failed" : normalizedStatus;
  }

  if (tx?.succeeded === true) {
    return "success";
  }

  if (tx?.validated === true && tx?.succeeded === false) {
    return "failed";
  }

  const chainStatus = String(tx?.chainStatus || "").trim().toLowerCase();
  if (chainStatus === "confirmed") {
    return "success";
  }

  if (chainStatus === "failed") {
    return "failed";
  }

  return String(tx?.status || "pending").trim().toLowerCase() || "pending";
}

export function Home() {
  const navigate = useNavigate();
  const {
    activeAccountId,
    accountSwitcherRows,
    activeAccountDisplay,
    walletDisplayRows,
    visibleWalletDisplayRows,
    visibleAssets,
    visibleAssetsTotalFiat,
    activeWallet,
    currentWalletDisplay,
    activeWalletId,
    activeBalance,
    unreadNotificationCount,
    transactions: rawTransactions,
    fiatCurrency,
    bootStatus,
    walletsLoading,
    balancesLoading,
    balancesHaveLoadedOnce,
    refreshApp,
    accountRequestStatus,
    archiveAccount,
    renameAccount,
    selectAccount,
    selectWallet,
    createHbarWalletOnDemand,
    supportedChains,
    selectedNetworkCode,
  } = useAppContext();

  const [selectedAsset, setSelectedAsset] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [showAddAccountChooser, setShowAddAccountChooser] = useState(false);
  const [showAssetSelectorForAdd, setShowAssetSelectorForAdd] = useState(false); // eslint-disable-line no-unused-vars
  const [copied, setCopied] = useState(false);
  const [creatingHbarWallet, setCreatingHbarWallet] = useState(false);
  const [renamingAccount, setRenamingAccount] = useState(null);
  const [newAccountName, setNewAccountName] = useState("");


  const dropdownRef = useRef(null);
  const walletDropdownRef = useRef(null);
  const isAccountActionLoading =
    accountRequestStatus?.rename === "loading" || accountRequestStatus?.archive === "loading";

  const walletRows = useMemo(
    () =>
      visibleWalletDisplayRows?.length
        ? visibleWalletDisplayRows
        : walletDisplayRows || [],
    [visibleWalletDisplayRows, walletDisplayRows],
  );
  const switcherAccounts = useMemo(
    () => accountSwitcherRows || [],
    [accountSwitcherRows],
  );
  const assets = useMemo(() => visibleAssets || [], [visibleAssets]);
  const dropdownAssets = useMemo(() => {
    if (!assets.length) {
      return [];
    }

    const byId = new Map();
    const prioritizedAssets = [];

    for (const symbol of HOME_DROPDOWN_POPULAR_SYMBOLS) {
      // Collect ALL assets matching this symbol (e.g. ETH on Ethereum AND
      // Arbitrum) so every chain sharing a native symbol gets a priority slot.
      const matches = assets.filter(
        (asset) =>
          String(asset?.symbol || "").trim().toUpperCase() === symbol &&
          !byId.has(asset.id),
      );

      for (const match of matches) {
        byId.set(match.id, match);
        prioritizedAssets.push(match);
      }
    }

    const remainingAssets = [...assets]
      .filter((asset) => asset?.id && !byId.has(asset.id))
      .sort(
        (left, right) =>
          getDisplayFiatValue(right?.fiatValue) -
          getDisplayFiatValue(left?.fiatValue),
      );

    const limitedAssets = [...prioritizedAssets, ...remainingAssets].slice(
      0,
      HOME_DROPDOWN_LIMIT,
    );

    if (
      selectedAsset &&
      selectedAsset !== "total" &&
      !limitedAssets.some((asset) => asset.id === selectedAsset)
    ) {
      const selectedMatch = assets.find((asset) => asset.id === selectedAsset);

      if (selectedMatch) {
        limitedAssets[limitedAssets.length - 1] = selectedMatch;
      }
    }

    return limitedAssets.filter(Boolean);
  }, [assets, selectedAsset]);

  const selectedAccount = useMemo(() => {
    return (
      activeAccountDisplay ||
      switcherAccounts.find(
        (account) =>
          account?.accountId === activeAccountId ||
          account?.id === activeAccountId,
      ) ||
      switcherAccounts[0] ||
      null
    );
  }, [activeAccountDisplay, switcherAccounts, activeAccountId]);

  const selectedWallet = useMemo(() => {
    return (
      walletRows.find(
        (wallet) =>
          wallet?.walletId === activeWalletId || wallet?.id === activeWalletId,
      ) ||
      currentWalletDisplay ||
      activeWallet ||
      walletRows[0] ||
      null
    );
  }, [walletRows, currentWalletDisplay, activeWallet, activeWalletId]);

  const transactions = useMemo(
    () => (Array.isArray(rawTransactions) ? rawTransactions : []),
    [rawTransactions],
  );

  const hasRenderableAssets = assets.length > 0;
  const isLoading =
    !hasRenderableAssets &&
    (bootStatus === "booting" ||
      walletsLoading ||
      (balancesLoading && !balancesHaveLoadedOnce));
  const shouldHideCurrentAssetBalance = !hasRenderableAssets && balancesLoading;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }

      if (
        walletDropdownRef.current &&
        !walletDropdownRef.current.contains(event.target)
      ) {
        setShowWalletDropdown(false);
        setShowAddAccountChooser(false);
        setShowAssetSelectorForAdd(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!assets.length) {
      if (selectedAsset !== "total") setSelectedAsset("total");
      return;
    }

    // Default to active wallet or first asset if current selection is invalid or "total"
    if (
      !selectedAsset ||
      selectedAsset === "total" ||
      !assets.some((asset) => asset.id === selectedAsset)
    ) {
      const defaultId =
        assets.find((a) => a.id === activeWalletId)?.id || assets[0].id;
      setSelectedAsset(defaultId);
    }
  }, [assets, selectedAsset, activeWalletId]);

  const hbarTarget = useMemo(() => {
    const chain = supportedChains.find(
      (c) => (c.code || c.id || "").toUpperCase() === "HBAR",
    );
    if (!chain) return {};
    return {
      chain: chain.code || chain.id,
      network:
        chain.defaultNetwork || (chain.networks && chain.networks[0]) || "",
    };
  }, [supportedChains]);

  const existingHbarWallet = useMemo(() => {
    return (
      walletRows.find(
        (w) => (w.chain || w.symbol || "").toUpperCase() === "HBAR",
      ) || null
    );
  }, [walletRows]);


  const totalBalance = getDisplayFiatValue(visibleAssetsTotalFiat);

  const selectedWalletAsset = useMemo(() => {
    if (!selectedWallet) {
      return null;
    }

    if (activeWalletId === selectedAsset) {
      const activeWalletIdentity =
        selectedWallet?.walletId || selectedWallet?.id || activeWalletId || "";
      const hasLiveBalanceEntry =
        Boolean(activeBalance?.walletId) && activeBalance.walletId === activeWalletIdentity;
      const hasSelectedWalletBalance = selectedWallet?.hasBalanceLoaded === true;
      const hasBalanceLoaded = hasLiveBalanceEntry || hasSelectedWalletBalance;
      const fallbackBalance = String(selectedWallet?.balance ?? "0");
      const fallbackAvailableBalance = String(
        selectedWallet?.availableBalance ?? fallbackBalance,
      );
      const fallbackOnChainBalance = String(
        selectedWallet?.onChainBalance ?? fallbackBalance,
      );
      const liveWallet = {
        ...selectedWallet,
        balance: hasLiveBalanceEntry
          ? String(activeBalance?.balance ?? activeBalance?.onChainBalance ?? "0")
          : fallbackBalance,
        availableBalance: hasLiveBalanceEntry
          ? String(activeBalance?.availableBalance ?? activeBalance?.balance ?? activeBalance?.onChainBalance ?? fallbackAvailableBalance)
          : fallbackAvailableBalance,
        onChainBalance: hasLiveBalanceEntry
          ? String(activeBalance?.onChainBalance ?? activeBalance?.balance ?? fallbackOnChainBalance)
          : fallbackOnChainBalance,
        market: hasLiveBalanceEntry
          ? activeBalance?.market ?? selectedWallet?.market
          : selectedWallet?.market ?? { priceUsd: 0, change24h: 0 },
        priceUsd: hasBalanceLoaded
          ? Number(activeBalance?.priceUsd ?? selectedWallet?.priceUsd ?? 0) || 0
          : 0,
        change24h: hasBalanceLoaded
          ? Number(activeBalance?.change24h ?? selectedWallet?.change24h ?? 0) || 0
          : 0,
        usdValue: hasBalanceLoaded
          ? Number(activeBalance?.usdValue ?? activeBalance?.fiatValue ?? selectedWallet?.usdValue ?? 0) || 0
          : 0,
        fiatValue: hasBalanceLoaded
          ? Number(activeBalance?.fiatValue ?? activeBalance?.usdValue ?? selectedWallet?.fiatValue ?? 0) || 0
          : 0,
        hasBalanceLoaded,
      };

      const normalized = normalizeAssetMarketData(liveWallet);

      return {
        ...normalized,
        id: activeWalletId,
        walletId: selectedWallet?.walletId || selectedWallet?.id || "",
        name: selectedWallet?.chainName || selectedWallet?.name || "Wallet",
        symbol: selectedWallet?.asset || "",
        address: getWalletAddress(selectedWallet),
        hasBalanceLoaded,
        iconUrl:
          normalized?.iconUrl ||
          selectedWallet?.iconUrl ||
          selectedWallet?.icon ||
          cryptoWalletLogo,
      };
    }

    const matchedAsset = assets.find((asset) => asset.id === selectedAsset);
    if (matchedAsset) {
      return {
        ...normalizeAssetMarketData(matchedAsset),
        iconUrl: matchedAsset.iconUrl || cryptoWalletLogo,
        address: matchedAsset.address || getWalletAddress(selectedWallet),
        walletId: matchedAsset.walletId || "",
      };
    }

    return null;
  }, [assets, activeWalletId, activeBalance, selectedWallet, selectedAsset]);

  const currentAsset = useMemo(() => {
    if (selectedAsset === "total") {
      return {
        name: "Total Balance",
        symbol: "USD",
        balance: totalBalance,
        fiatValue: totalBalance,
        change: 0,
        isTotal: true,
        address: selectedWallet
          ? getWalletAddress(selectedWallet)
          : "Unavailable",
        iconUrl: selectedWallet?.iconUrl || selectedWallet?.icon || cryptoWalletLogo,
      };
    }

    if (selectedWalletAsset && selectedWalletAsset.id === selectedAsset) {
      return selectedWalletAsset;
    }

    const matchedAsset = assets.find((asset) => asset.id === selectedAsset);
    if (matchedAsset) {
      return {
        ...matchedAsset,
        iconUrl: matchedAsset.iconUrl || cryptoWalletLogo,
      };
    }

    return {
      name: "Wallet",
      symbol: "",
      balance: "",
      fiatValue: 0,
      change: 0,
      hasBalanceLoaded: false,
      iconUrl: selectedWallet?.iconUrl || selectedWallet?.icon || cryptoWalletLogo,
      address: selectedWallet
        ? getWalletAddress(selectedWallet)
        : "Unavailable",
    };
  }, [
    selectedAsset,
    assets,
    totalBalance,
    selectedWallet,
    selectedWalletAsset,
  ]);

  const isPositive = Number(currentAsset?.change || 0) >= 0;

  const handleCopy = async () => {
    const valueToCopy = currentAsset?.address || "";

    if (!valueToCopy || valueToCopy === "Unavailable") {
      return;
    }

    try {
      await copyTextToClipboard(valueToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleAddAccountClick = () => {
    setShowAddAccountChooser((prev) => !prev);
  };

  const handleChooseCreate = () => {
    beginSetupIntent("create", { resetPending: true });
    setShowWalletDropdown(false);
    setShowAddAccountChooser(false);
    navigate("/app/account/create");
  };

  const handleChooseRestore = () => {
    beginSetupIntent("restore", { resetPending: true });
    setShowWalletDropdown(false);
    setShowAddAccountChooser(false);
    navigate("/app/account/restore");
  };

  const handleAddHbarWallet = async () => {
    if (!hbarTarget.chain || !hbarTarget.network || creatingHbarWallet) {
      return;
    }

    setShowWalletDropdown(false);
    setShowAddAccountChooser(false);

    if (existingHbarWallet?.walletId) {
      await selectWallet(existingHbarWallet.walletId);
      toast.success("Hedera wallet is ready");
      navigate("/app/receive", {
        state: { assetContextId: existingHbarWallet.walletId },
      });
      return;
    }

    try {
      setCreatingHbarWallet(true);
      const wallet = await createHbarWalletOnDemand({
        accountId: activeAccountId || undefined,
        network: hbarTarget.network,
      });

      if (wallet?.walletId) {
        await selectWallet(wallet.walletId);
      }

      toast.success("Hedera wallet created");
      navigate("/app/receive", {
        state: { assetContextId: wallet?.walletId || "" },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add Hedera wallet");
    } finally {
      setCreatingHbarWallet(false);
    }
  };

  const handleRenameAccount = async (account) => {
    const accountId = account?.accountId || account?.id || "";
    if (!accountId || typeof window === "undefined") {
      return;
    }

    const currentName = getAccountDisplayName(account);
    const nextName = window.prompt("Rename account", currentName);

    if (nextName === null) {
      return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === currentName) {
      return;
    }

    try {
      await renameAccount(accountId, { name: trimmedName });
    } catch (error) {
      window.alert(error?.message || "Failed to rename account");
    }
  };

  const handleArchiveAccount = async (account) => {
    const accountId = account?.accountId || account?.id || "";
    if (!accountId || typeof window === "undefined") {
      return;
    }

    if (!account?.canArchive) {
      window.alert("At least one active account must remain.");
      return;
    }

    const accountName = getAccountDisplayName(account);
    const shouldArchive = window.confirm(`Archive "${accountName}"?`);
    if (!shouldArchive) {
      return;
    }

    try {
      await archiveAccount(accountId);
      setShowWalletDropdown(false);
      setShowAddAccountChooser(false);
    } catch (error) {
      window.alert(error?.message || "Failed to archive account");
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="aura-container !pb-48"
    >
      <section className="home-header-section sticky top-0 z-50">
        <div className="home-header-inner aura-header">
          <div
            className="flex items-center space-x-3 relative"
            ref={walletDropdownRef}
          >
            <button
              onClick={() => setShowWalletDropdown((prev) => !prev)}
              className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30 hover:bg-indigo-500/30 transition-all active:scale-95 overflow-hidden"
            >
              {selectedAccount?.icon ? (
                <img
                  src={selectedAccount.icon}
                  alt={getAccountDisplayName(selectedAccount)}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="w-3 h-3 bg-indigo-400 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.8)]" />
              )}
            </button>

            <div
              onClick={() => setShowWalletDropdown((prev) => !prev)}
              className="cursor-pointer group flex flex-col items-start min-w-0"
            >
              <div className="flex items-center space-x-1">
                <h1 className="aura-header-title !text-left !text-lg leading-none group-hover:text-indigo-400 transition-colors truncate">
                  {selectedAccount
                    ? getAccountDisplayName(selectedAccount)
                    : "Crypto Wallet"}
                </h1>
              </div>
              <div className="flex items-center space-x-1 mt-1">
                <span className="text-[12px] font-semibold text-slate-500 font-mono tracking-widest truncate max-w-[160px]">
                  {selectedAccount
                    ? getAccountDisplayMeta(selectedAccount)
                    : "No account selected"}
                </span>
              </div>
            </div>

            <AnimatePresence>
              {showWalletDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute left-[-4px] top-full mt-4 w-[calc(100vw-48px)] max-w-[340px] bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-2xl z-[250] p-2.5 overflow-hidden ring-1 ring-white/10"
                >
                  <div className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-white/5 mb-2.5 flex justify-between items-center">
                    <span>Switch Account</span>
                  </div>

                  <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-0.5 custom-scrollbar">
                    {switcherAccounts.length ? (
                      switcherAccounts.map((account) => {
                        const accountId = account?.accountId || account?.id;
                        const isActive = accountId === activeAccountId;

                        return (
                          <div
                            key={
                              accountId || account?.displayTitle || "account"
                            }
                            className={`w-full flex items-center justify-between p-3.5 rounded-3xl transition-all duration-300 group ${isActive
                              ? "bg-indigo-600 shadow-lg shadow-indigo-600/20"
                              : "hover:bg-white/5"
                              }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                selectAccount(accountId);
                                setShowWalletDropdown(false);
                                setShowAddAccountChooser(false);
                              }}
                              className="flex flex-1 items-center space-x-3 text-left min-w-0"
                            >
                              <div className="relative flex-shrink-0">
                                {account?.icon ? (
                                  <img
                                    src={account.icon}
                                    alt=""
                                    className="w-9 h-9 rounded-full object-cover border-2 border-white/10 shadow-lg group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-slate-800 border-2 border-white/10 shadow-lg flex items-center justify-center text-xs font-bold text-slate-300">
                                    {getAccountDisplayInitial(account)}
                                  </div>
                                )}
                                <div
                                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${isActive
                                    ? "bg-emerald-400"
                                    : "bg-slate-700"
                                    }`}
                                />
                              </div>

                              <div className="flex flex-col items-start min-w-0 gap-1 justify-center">
                                <span
                                  className={`text-[13px] font-black tracking-tight truncate leading-tight ${isActive ? "text-white" : "text-slate-200"
                                    }`}
                                >
                                  {getAccountDisplayName(account)}
                                </span>
                                <span
                                  className={`${isActive
                                    ? "text-indigo-100/80"
                                    : "text-slate-500"
                                    } text-[11px] font-bold font-mono leading-none mt-0.5`}
                                >
                                  {account?.displayMeta ||
                                    "Multi-coin account"}
                                </span>
                              </div>
                            </button>

                            <div className="flex items-center gap-1 pl-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRenameAccount(account);
                                }}
                                disabled={isAccountActionLoading}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isActive
                                  ? "text-indigo-100/80 hover:text-white hover:bg-white/10"
                                  : "text-slate-500 hover:text-white hover:bg-white/10"
                                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                                aria-label={`Rename ${getAccountDisplayName(account)}`}
                                title="Rename account"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleArchiveAccount(account);
                                }}
                                disabled={isAccountActionLoading || !account?.canArchive}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isActive
                                  ? "text-indigo-100/80 hover:text-white hover:bg-white/10"
                                  : "text-slate-500 hover:text-white hover:bg-white/10"
                                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                                aria-label={`Archive ${getAccountDisplayName(account)}`}
                                title={
                                  account?.canArchive
                                    ? "Archive account"
                                    : "At least one active account must remain"
                                }
                              >
                                <Archive size={14} />
                              </button>

                              {isActive && (
                                <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                                  <Check size={12} className="text-white" />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                          No accounts found
                        </p>
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {showAddAccountChooser ? (
                      <motion.div
                        key="chooser"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="mt-2 border-t border-white/5 pt-2 space-y-1"
                      >
                        <button
                          onClick={handleChooseCreate}
                          className="w-full py-3 px-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-indigo-400 hover:text-white hover:bg-indigo-500/10 rounded-2xl transition-all"
                        >
                          + Create New Account
                        </button>
                        <button
                          onClick={handleChooseRestore}
                          className="w-full py-3 px-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
                        >
                          + Restore Existing Account
                        </button>
                        {hbarTarget.chain && hbarTarget.network ? (
                          <button
                            onClick={handleAddHbarWallet}
                            disabled={creatingHbarWallet}
                            className="w-full py-3 px-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {creatingHbarWallet
                              ? "Creating Hedera Wallet..."
                              : existingHbarWallet
                                ? "Open Hedera Wallet"
                                : "+ Add Hedera Wallet"}
                          </button>
                        ) : null}
                      </motion.div>
                    ) : (
                      <button
                        key="add"
                        onClick={handleAddAccountClick}
                        className="w-full mt-2 py-3.5 text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-[0.2em] hover:bg-indigo-500/10 rounded-2xl transition-all border-t border-white/5"
                      >
                        + Add New Account
                      </button>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={() => navigate("/app/balance-insights")}
              className="aura-header-button relative"
            >
              <Eye size={22} />
              <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 !rounded-sm border border-slate-950" />
            </button>
            <button
              onClick={() => navigate("/app/notifications")}
              className="aura-header-button relative"
            >
              <Bell size={22} />
              {unreadNotificationCount > 0 ? (
                <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 !rounded-sm border border-slate-950" />
              ) : null}
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-col space-y-8 px-6 pt-4">
        <section className="home-balance-section">
          <div className="home-balance-inner">
            <motion.div variants={itemVariants}>
              <Card
                className={`bg-indigo-500/10 backdrop-blur-3xl border border-white/10 p-6 py-6 flex flex-col items-center justify-center space-y-1 relative shadow-none min-h-[230px] transition-all duration-500 rounded-[3rem] ${showDropdown
                  ? "overflow-visible"
                  : "overflow-hidden hover:scale-[1.02]"
                  }`}
              >
                <div className="w-full flex justify-between items-center z-20 mb-3">
                  <button
                    onClick={() => navigate("/app/receive")}
                    className="p-3 bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 text-white hover:bg-white/30 transition-all active:scale-90 shadow-xl group"
                  >
                    <Scan
                      size={22}
                      className="group-hover:rotate-12 transition-transform"
                    />
                  </button>

                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setShowDropdown((prev) => !prev)}
                      className="flex items-center space-x-2 bg-black/30 backdrop-blur-2xl px-5 py-2.5 rounded-2xl border border-white/10 text-white hover:bg-black/40 transition-all shadow-xl text-xs font-black uppercase tracking-widest active:scale-95"
                    >
                      <span className="text-[9px]">
                        {currentAsset?.name || "Total Balance"}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-500 ${showDropdown ? "rotate-180" : ""}`}
                      />
                    </button>

                    <AnimatePresence>
                      {showDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="absolute right-0 mt-3 w-48 bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl z-[200] overflow-hidden p-2 ring-1 ring-white/5"
                        >
                          {dropdownAssets.map((asset) => (
                            <button
                              key={asset.id}
                              onClick={() => {
                                selectWallet(asset.walletId);
                                setSelectedAsset(asset.id);
                                setShowDropdown(false);
                              }}
                              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl text-left transition-colors mb-1 ${selectedAsset === asset.id
                                ? "bg-indigo-600 text-white"
                                : "text-slate-300 hover:bg-white/5 hover:text-white"
                                }`}
                            >
                              <img
                                src={asset.iconUrl || cryptoWalletLogo}
                                alt=""
                                className="w-8 h-8 rounded-full object-cover shadow-lg"
                              />
                              <span className="font-bold text-xs uppercase tracking-wider">
                                {asset.symbol || asset.name}
                              </span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex flex-col items-center z-10 py-2">
                  <div className="flex items-center space-x-2 mb-1.5 opacity-80">
                    {currentAsset?.isTotal ? (
                      <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[7px] text-white font-black shadow-inner">
                        ∑
                      </div>
                    ) : (
                      <img
                        src={currentAsset?.iconUrl || cryptoWalletLogo}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover shadow-sm !mr-1"
                      />
                    )}
                    <span className="text-[10px] uppercase tracking-[0.15em] font-black text-indigo-100/60">
                      {currentAsset?.isTotal
                        ? "Total Balance"
                        : `${currentAsset?.name || "Wallet"} Balance`}
                    </span>
                  </div>

                  <h2 className="text-3xl font-black text-white tracking-wide drop-shadow-2xl">
                    {currentAsset?.isTotal ? fiatCurrency : ""}
                    {shouldHideCurrentAssetBalance
                      ? ""
                      : formatBalance(currentAsset?.balance)}{" "}
                    {!currentAsset?.isTotal ? currentAsset?.symbol : ""}
                  </h2>

                  <button
                    onClick={handleCopy}
                    className="mt-3 flex items-center space-x-2 bg-black/20 backdrop-blur-lg px-3 py-1.5 rounded-xl border border-white/5 group hover:border-white/20 transition-all active:scale-95"
                    title={currentAsset?.address || "Unavailable"}
                  >
                    <span className="text-[12px] font-mono text-indigo-200/80 group-hover:text-white transition-colors">
                      {formatCardAddress(currentAsset?.address)}
                    </span>
                    {copied ? (
                      <Check size={12} className="shrink-0 text-emerald-400" />
                    ) : (
                      <Copy
                        size={12}
                        className="shrink-0 text-indigo-300 group-hover:text-white"
                      />
                    )}
                  </button>
                </div>

                <div
                  className={`flex items-center space-x-1 text-[11px] font-black tracking-widest px-4 py-1.5 rounded-full mt-4 z-10 shadow-lg border ${isPositive
                    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                    : "text-rose-400 bg-rose-400/10 border-rose-400/20"
                    }`}
                >
                  {isPositive ? (
                    <TrendingUp size={14} />
                  ) : (
                    <TrendingDown size={14} />
                  )}
                  <span className="uppercase">
                    {Number(currentAsset?.change || 0) >= 0 ? "+" : ""}
                    {Number(currentAsset?.change || 0).toFixed(2)}% (24h)
                  </span>
                </div>
              </Card>
            </motion.div>
          </div>
        </section>

        <section className="home-actions-section">
          <div className="home-actions-inner">
            <motion.div
              variants={itemVariants}
              className="flex justify-between space-x-4"
            >
              {[
                {
                  label: "Send",
                  icon: ArrowUpRight,
                  path: "/app/send",
                  color: "text-rose-400",
                  bg: "bg-rose-500/10",
                  border: "border-rose-500/20",
                },
                {
                  label: "Receive",
                  icon: ArrowDownLeft,
                  path: "/app/receive",
                  color: "text-emerald-400",
                  bg: "bg-emerald-500/10",
                  border: "border-emerald-500/20",
                },
                {
                  label: "Swap",
                  icon: RefreshCw,
                  path: "/app/swap",
                  color: "text-indigo-400",
                  bg: "bg-indigo-500/10",
                  border: "border-indigo-500/20",
                },
              ].map((action) => (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(action.path)}
                  className="flex-1 flex flex-col items-center justify-center space-y-3 group"
                >
                  <div
                    className={`w-16 h-16 ${action.bg} ${action.border} border rounded-full flex items-center justify-center transition-all shadow-lg`}
                  >
                    <action.icon
                      size={28}
                      strokeWidth={2.5}
                      className={action.color}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-300">
                    {action.label}
                  </span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="home-assets-section">
          <div className="home-assets-inner">
            <motion.div variants={itemVariants} className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-lg font-bold text-white">Assets</h3>
                <button
                  onClick={() => navigate("/app/portfolio")}
                  className="text-sm font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  See All
                </button>
              </div>

              <div className="space-y-3">
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-slate-900/50 p-4 rounded-3xl border border-slate-800 flex items-center justify-between animate-pulse"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-slate-800 rounded-full" />
                        <div className="space-y-2">
                          <div className="w-24 h-4 bg-slate-800 rounded" />
                          <div className="w-16 h-3 bg-slate-800 rounded" />
                        </div>
                      </div>
                      <div className="space-y-2 flex flex-col items-end">
                        <div className="w-20 h-4 bg-slate-800 rounded" />
                        <div className="w-12 h-3 bg-slate-800 rounded" />
                      </div>
                    </div>
                  ))
                ) : assets.length ? (
                  [...assets]
                    .sort((a, b) => (Number(b.fiatValue) || 0) - (Number(a.fiatValue) || 0))
                    .slice(0, 6)
                    .map((asset) => (
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={asset.id}
                        onClick={() => navigate(`/app/asset/${asset.id}`)}
                        className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors cursor-pointer shadow-lg"
                      >
                        <div className="flex items-center space-x-4 min-w-0">
                          {asset.iconUrl ? (
                            <img
                              src={asset.iconUrl}
                              alt={asset.name}
                              className="w-12 h-12 rounded-full object-cover shadow-sm"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-400">
                              {(asset.symbol || asset.name || "W").charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-base font-bold text-white leading-tight truncate">
                              {asset.name}
                            </h4>
                            <p className="text-sm font-medium text-slate-400">
                              {formatBalance(asset.balance)} {asset.symbol}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-base font-bold text-white leading-tight">
                            {formatFiat(asset.fiatValue, fiatCurrency)}
                          </p>
                          {(() => {
                            const assetChange = Number(asset.change || 0);
                            const isPositive = assetChange >= 0;
                            return (
                              <p
                                className={`text-sm font-medium ${isPositive
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                                  }`}
                              >
                                {isPositive ? "+" : ""}
                                {assetChange.toFixed(2)}%
                              </p>
                            );
                          })()}
                        </div>
                      </motion.div>
                    ))
                ) : (
                  <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 text-center">
                    <p className="text-sm font-semibold text-slate-400">
                      No accounts available yet.
                    </p>
                    <button
                      onClick={() => {
                        beginSetupIntent("create", { resetPending: true });
                        navigate("/app/account/create");
                      }}
                      className="mt-4 text-sm font-bold text-indigo-400 hover:text-indigo-300"
                    >
                      Create Account
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="home-activity-section">
          <div className="home-activity-inner">
            <motion.div variants={itemVariants} className="space-y-4 pt-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-lg font-bold text-white">
                  Recent Activity
                </h3>
                <button
                  onClick={() => navigate("/app/history")}
                  className="text-sm font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  See All
                </button>
              </div>

              <div className="space-y-3">
                {transactions.length ? (
                  transactions.slice(0, 3).map((tx) => {
                    const status = resolveTransactionStatus(tx);
                    const isReceived = tx.type === "received";
                    const isSent = tx.type === "sent";
                    const isSwapped =
                      tx.isSwap === true ||
                      tx.type === "swap" ||
                      tx.type === "swapped" ||
                      tx.direction === "swap";

                    return (
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate(`/app/transaction/${tx.id}`)}
                        key={tx.id}
                        className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex items-center justify-between cursor-pointer shadow-lg hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-center space-x-4">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center ${isReceived
                              ? "bg-emerald-500/20 text-emerald-400"
                              : isSent && !isSwapped
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-indigo-500/20 text-indigo-400"
                              }`}
                          >
                            {isSwapped ? (
                              <RefreshCw size={24} />
                            ) : isReceived ? (
                              <ArrowDownLeft size={24} />
                            ) : isSent ? (
                              <ArrowUpRight size={24} />
                            ) : (
                              <RefreshCw size={24} />
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white capitalize">
                              {tx.counterpartyName || tx.type}
                            </h4>
                            <p className="text-xs font-medium text-slate-400">
                              {String(tx.date || "").split(",")[0] || "Recent"}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p
                            className={`text-sm font-bold ${isReceived || isSwapped ? "text-emerald-400" : "text-white"}`}
                          >
                            {isSwapped ? "" : isReceived ? "+" : isSent ? "-" : ""}
                            {tx.amount} {tx.symbol || tx.asset || selectedWallet?.asset || activeWallet?.asset || ""}
                          </p>
                          <p className="text-xs font-medium text-slate-500 capitalize">
                            {status.replace(/_/g, " ")}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 text-center">
                    <p className="text-sm font-semibold text-slate-400">
                      No transactions yet for this wallet.
                    </p>
                    <button
                      onClick={refreshApp}
                      className="mt-4 text-sm font-bold text-indigo-400 hover:text-indigo-300"
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
