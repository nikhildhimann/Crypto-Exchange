import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  LayoutGrid,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useSelector } from "react-redux";

import { useAppContext } from "../../contexts/AppContext";
import { selectHistoryRefreshToken } from "../../store/selectors";
import { WalletAvatar } from "../ui/WalletAvatar";

function getHistoryTimestampLabel(transaction) {
  if (transaction?.displayTimestamp) {
    return (
      transaction?.dateTimeLabel || transaction?.date || "Time unavailable"
    );
  }

  return "Time unavailable";
}

function formatNetworkLabel(networkCode = "", fallbackLabel = "") {
  if (fallbackLabel) {
    return fallbackLabel;
  }

  const normalizedNetworkCode = String(networkCode || "").toLowerCase();

  if (normalizedNetworkCode === "mainnet") {
    return "Mainnet";
  }

  if (normalizedNetworkCode === "testnet") {
    return "Testnet";
  }

  if (normalizedNetworkCode === "preprod") {
    return "Preprod";
  }

  if (normalizedNetworkCode === "devnet") {
    return "Devnet";
  }

  if (!normalizedNetworkCode) {
    return "Current Network";
  }

  return `${normalizedNetworkCode.charAt(0).toUpperCase()}${normalizedNetworkCode.slice(1)}`;
}

function truncateTokenId(id, start = 6, end = 4) {
  const str = String(id || "");
  if (str.length <= start + end + 2) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

/**
 * Format a crypto amount for compact display.
 * Limits to 8 significant figures and strips trailing zeros.
 * e.g. 0.000271988752154458 → "0.000271989"
 *      0.299981             → "0.299981"
 *      1.5                  → "1.5"
 */
function formatCryptoAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? "");
  // toPrecision gives us 8 significant figures, parseFloat strips trailing zeros
  return parseFloat(num.toPrecision(8)).toString();
}

function normalizeTransactionList(transactions) {
  if (Array.isArray(transactions)) {
    return transactions;
  }

  if (Array.isArray(transactions?.data)) {
    return transactions.data;
  }

  return [];
}

function isIncomingTransaction(transaction = {}) {
  return (
    transaction?.isIncoming === true ||
    String(transaction?.direction || "").trim().toLowerCase() === "incoming"
  );
}

function isOutgoingTransaction(transaction = {}) {
  return (
    transaction?.isSwap !== true &&
    (transaction?.isOutgoing === true ||
      String(transaction?.direction || "").trim().toLowerCase() === "outgoing")
  );
}

function isSwapTransaction(transaction = {}) {
  return (
    transaction?.isSwap === true ||
    String(transaction?.type || "").trim().toLowerCase() === "swap" ||
    String(transaction?.direction || "").trim().toLowerCase() === "swap"
  );
}

function getTransactionTitle(transaction = {}) {
  if (isSwapTransaction(transaction)) {
    const fromAsset = transaction?.fromAsset || transaction?.asset || "";
    const toAsset = transaction?.toAsset || "";
    if (fromAsset && toAsset) {
      return `Swap ${fromAsset} → ${toAsset}`;
    }
    return "Swap";
  }
  
  return (
    transaction?.counterpartyName ||
    transaction?.toAddress ||
    transaction?.fromAddress ||
    "Unknown"
  );
}

function getTransactionSubtitle(transaction = {}) {
  if (isSwapTransaction(transaction)) {
    const sourceNetwork = transaction?.sourceChain || transaction?.chain || "source";
    const destinationNetwork = transaction?.destinationChain || "destination";
    return `${String(sourceNetwork).toUpperCase()} to ${String(destinationNetwork).toUpperCase()}`;
  }

  return (
    transaction?.chainLabel ||
    transaction?.networkLabel ||
    transaction?.chainMeta?.name ||
    transaction?.chain ||
    "Wallet"
  );
}

function getTransactionAssetSymbol(transaction = {}) {
  if (isSwapTransaction(transaction)) {
    return (
      transaction?.destinationAsset ||
      transaction?.toAsset ||
      transaction?.asset ||
      transaction?.symbol ||
      transaction?.currency ||
      ""
    );
  }

  return transaction?.asset || transaction?.symbol || transaction?.currency || "";
}

function getTransactionDisplayAmount(transaction = {}) {
  if (isSwapTransaction(transaction)) {
    return (
      transaction?.destinationAmount ||
      transaction?.estimatedReceiveAmount ||
      transaction?.amount ||
      "0"
    );
  }

  return transaction?.amount || "0";
}

function getTransactionStatusTone(transaction = {}) {
  return transaction?.statusTone || transaction?.displayStatus || transaction?.status || "pending";
}

function getTransactionStatusLabel(transaction = {}) {
  return transaction?.statusLabel || transaction?.displayStatus || transaction?.status || "pending";
}

function getStatusClasses(tone = "pending") {
  if (tone === "success") {
    return "text-emerald-400";
  }

  if (tone === "failed") {
    return "text-rose-400";
  }

  return "text-amber-400";
}

function getStatusIcon(tone = "pending") {
  if (tone === "success") {
    return CheckCircle2;
  }

  if (tone === "failed") {
    return XCircle;
  }

  return Clock3;
}

function renderTransactionVisual(transaction = {}) {
  const incoming = isIncomingTransaction(transaction);
  const isNft = Boolean(transaction?.isNft);
  const nftImage = transaction?.nft?.imageUrl || transaction?.nft?.thumbnailUrl;
  const iconUrl = transaction?.iconUrl || transaction?.assetIcon || transaction?.assetIconUrl;

  if (isNft && nftImage) {
    return (
      <div className="relative shrink-0 w-12 h-12">
        <img
          src={nftImage}
          alt="NFT"
          className="w-full h-full rounded-2xl object-cover border border-slate-700 shadow-sm relative z-10"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = "/images/nft-placeholder.png";
          }}
        />
        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-950 z-20 shadow-lg ${
          incoming ? "bg-emerald-500" : "bg-rose-500"
        }`}>
          {incoming ? <ArrowDownLeft size={10} className="text-white" /> : <ArrowUpRight size={10} className="text-white" />}
        </div>
      </div>
    );
  }

  if (iconUrl) {
    return (
      <div className="relative shrink-0">
        <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-950 z-20 shadow-md ${
          incoming ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
        }`}>
          {incoming ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
        </div>
        <img
          src={iconUrl}
          alt={getTransactionAssetSymbol(transaction)}
          className="w-12 h-12 rounded-2xl object-cover bg-slate-800 border border-white/5 relative z-10 shadow-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border relative overflow-hidden ${
        incoming
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : "bg-rose-500/10 border-rose-500/20 text-rose-400"
      }`}
    >
       <div className="absolute inset-0 bg-current opacity-5 blur-sm" />
      {incoming ? (
        <ArrowDownLeft size={24} className="relative z-10" />
      ) : (
        <ArrowUpRight size={24} className="relative z-10" />
      )}
    </div>
  );
}

export function History() {
  const navigate = useNavigate();
  const historyRefreshToken = useSelector(selectHistoryRefreshToken);
  const {
    transactions,
    loadTransactions,
    refreshTransactions,
    refreshBalances,
    activeWallet,
    wallets,
    activeAccountDisplay,
    selectedNetworkCode,
    visibleWalletCards,
    transactionsLoading,
    fiatCurrency,
  } = useAppContext();
  const [filter, setFilter] = useState("all");
  const autoRefreshInFlightRef = useRef(null);
  const autoRefreshQueuedRef = useRef(false);
  const consumedHistoryRefreshTokenRef = useRef(0);
  const hasInitializedHistoryRefreshRef = useRef(false);
  const networkLabel = formatNetworkLabel(
    selectedNetworkCode,
    activeWallet?.networkLabel || "",
  );
  const transactionList = normalizeTransactionList(transactions);

  const runHistoryLoad = useCallback(async () => {
    if (autoRefreshInFlightRef.current) {
      autoRefreshQueuedRef.current = true;
      return autoRefreshInFlightRef.current;
    }

    const request = Promise.resolve(loadTransactions()).finally(() => {
      autoRefreshInFlightRef.current = null;

      if (autoRefreshQueuedRef.current) {
        autoRefreshQueuedRef.current = false;
        void runHistoryLoad();
      }
    });

    autoRefreshInFlightRef.current = request;
    return request;
  }, [loadTransactions]);

  useEffect(() => {
    if (!hasInitializedHistoryRefreshRef.current) {
      hasInitializedHistoryRefreshRef.current = true;
      consumedHistoryRefreshTokenRef.current = historyRefreshToken;
      void runHistoryLoad();
      return;
    }

    if (
      !historyRefreshToken ||
      historyRefreshToken <= consumedHistoryRefreshTokenRef.current
    ) {
      return;
    }

    consumedHistoryRefreshTokenRef.current = historyRefreshToken;
    void runHistoryLoad();
  }, [historyRefreshToken, runHistoryLoad]);

  const filteredTransactions = (() => {
    if (filter === "all") {
      return transactionList;
    }

    if (filter === "nfts") {
      return transactionList.filter(
        (transaction) =>
          !isSwapTransaction(transaction) && Boolean(transaction?.isNft),
      );
    }

    if (filter === "received") {
      return transactionList.filter(
        (transaction) =>
          !isSwapTransaction(transaction) && isIncomingTransaction(transaction),
      );
    }

    if (filter === "sent") {
      return transactionList.filter(
        (transaction) =>
          !isSwapTransaction(transaction) && isOutgoingTransaction(transaction),
      );
    }

    return transactionList.filter(
      (transaction) =>
        String(transaction?.transactionType || "").trim().toLowerCase() === "internal",
    );
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="aura-container"
    >
      <section className="history-header-section sticky top-0 z-50">
        <div className="history-header-inner aura-header">
          <button
            onClick={() => navigate(-1)}
            className="aura-header-button group"
          >
            <ArrowLeft
              size={20}
              className="group-hover:-translate-x-0.5 transition-transform"
            />
          </button>
          <h1 className="aura-header-title">History</h1>
          <button
            onClick={async () => {
              if (transactionsLoading) return;
              try {
                await Promise.allSettled([refreshTransactions(), refreshBalances()]);
              } catch (err) {
                console.error("Manual refresh failed:", err);
              }
            }}
            className={`aura-header-button ${transactionsLoading ? "text-indigo-400" : ""}`}
            disabled={transactionsLoading}
          >
            <RefreshCw
              size={20}
              className={`${transactionsLoading ? "animate-spin" : "hover:rotate-180 transition-transform duration-500"}`}
            />
          </button>
        </div>
      </section>

      <div className="px-5 py-2">
        <section className="mb-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              Active Account
            </p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <WalletAvatar
                  icon={activeAccountDisplay?.icon}
                  label={activeAccountDisplay?.displayTitle || "Account"}
                  size="sm"
                  className="border-white/10 bg-indigo-500/10"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {activeAccountDisplay?.displayTitle || networkLabel}
                  </p>
                  <p className="text-xs font-medium text-slate-400">
                    {wallets.length}{" "}
                    {wallets.length === 1 ? "wallet" : "wallets"} included
                  </p>
                </div>
              </div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-300">
                {activeAccountDisplay?.displayMeta || "Active"}
              </p>
            </div>
          </div>
        </section>

        <section className="history-filters-section">
          <div className="history-filters-inner flex space-x-2 overflow-x-auto pb-4 scrollbar-hide">
            {["all", "nfts", "received", "sent", "internal"].map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-full text-sm font-semibold capitalize whitespace-nowrap transition-all shadow-sm ${filter === type
                    ? "bg-indigo-600 text-white shadow-indigo-600/30 border border-indigo-500"
                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-white"
                  }`}
              >
                {type}
              </button>
            ))}
          </div>
        </section>

        <section className="history-list-section">
          <div className="history-list-inner space-y-3 mt-2">
            <AnimatePresence mode="popLayout">
              {Array.isArray(filteredTransactions) &&
                filteredTransactions.map((transaction) => {
                const statusTone = getTransactionStatusTone(transaction);
                const statusLabel = getTransactionStatusLabel(transaction);
                const StatusIcon = getStatusIcon(statusTone);
                const isNft =
                  !isSwapTransaction(transaction) && Boolean(transaction?.isNft);

                return (
                  <motion.div
                    key={transaction.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() =>
                      navigate(`/app/transaction/${transaction.id}`)
                    }
                    className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition-colors shadow-lg"
                  >
                    <div className="flex items-center space-x-4 min-w-0 flex-1">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${isSwapTransaction(transaction)
                            ? "bg-indigo-500/20 text-indigo-400"
                            : isIncomingTransaction(transaction)
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                      >
                        {isSwapTransaction(transaction) ? (
                          <RefreshCw size={24} />
                        ) : isIncomingTransaction(transaction) ? (
                          <ArrowDownLeft size={24} />
                        ) : (
                          <ArrowUpRight size={24} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-base font-bold text-white truncate">
                          {getTransactionTitle(transaction)}
                        </h4>
                        <p className="text-sm font-medium text-slate-500 truncate">
                          {getTransactionSubtitle(transaction)}{" "}
                          · {getHistoryTimestampLabel(transaction)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      {isNft ? (
                        <div className="text-right flex flex-col items-end shrink-0 pl-2">
                          <p className="text-sm font-bold leading-tight text-white w-28 sm:w-32 truncate text-right">
                            {truncateTokenId(transaction?.displayAmount || "NFT")}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 mt-1 leading-none uppercase tracking-wide w-28 sm:w-32 truncate text-right">
                            {transaction?.displayDirection || "NFT Transfer"}
                          </p>
                        </div>
                      ) : (
                        <div className="text-right">
                          <p
                            className={`text-base font-bold leading-tight whitespace-nowrap ${
                              isIncomingTransaction(transaction) ? "text-emerald-400" : "text-white"
                            }`}
                          >
                            {isSwapTransaction(transaction)
                              ? ""
                              : isIncomingTransaction(transaction)
                                ? "+"
                                : "-"}
                            {formatCryptoAmount(getTransactionDisplayAmount(transaction))}{" "}
                            {getTransactionAssetSymbol(transaction)}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 mt-1 leading-none uppercase tracking-wide">
                            {fiatCurrency}
                            {Number(transaction.fiatAmount || 0).toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </p>
                        </div>
                      )}
                      <div className={`mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${getStatusClasses(statusTone)}`}>
                        <StatusIcon size={11} />
                        <span>{statusLabel}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {Array.isArray(filteredTransactions) && !filteredTransactions.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-12 text-center text-slate-500"
              >
                <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-800">
                  <RefreshCw size={24} className="text-slate-600" />
                </div>
                <p className="text-sm font-semibold">No transactions found.</p>
              </motion.div>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  );
}
