import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  ImageOff,
  LayoutGrid,
  RefreshCw,
  User,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useAppContext } from "../../contexts/AppContext";
import { buildExplorerTransactionUrl, getChainMeta } from "../../config/chains";
import { copyTextToClipboard } from "../../lib/clipboard";

function truncate(value = "", start = 6, end = 4) {
  const normalized = String(value || "").trim();

  if (!normalized) return "Unavailable";
  if (normalized.length <= start + end) return normalized;

  return `${normalized.slice(0, start)}...${normalized.slice(-end)}`;
}

function truncateDisplayValue(value = "", start = 12, end = 8) {
  const normalized = String(value || "").trim();

  if (!normalized) return "Unavailable";
  if (normalized.length <= start + end) return normalized;

  return `${normalized.slice(0, start)}...${normalized.slice(-end)}`;
}

function normalizeStatus(transaction = {}) {
  if (transaction?.statusTone === "success") return "completed";
  if (transaction?.statusTone === "failed") return "failed";
  if (transaction?.statusTone === "pending") return "pending";

  const status = String(transaction?.status || "").trim().toLowerCase();
  const chainStatus = String(transaction?.chainStatus || "").trim().toLowerCase();

  if (transaction?.succeeded === true) return "completed";
  if (transaction?.validated === true && transaction?.succeeded === false) return "failed";
  if (chainStatus === "confirmed") return "completed";
  if (chainStatus === "failed") return "failed";

  if (status === "success" || status === "completed") return "completed";
  if (status === "failed" || status === "payout_failed" || status === "expired") return "failed";
  if (status === "manual_review") return "manual_review";

  return "pending";
}

function normalizeTransactionType(transaction = {}) {
  if (transaction?.isSwap) return "swap";
  if (transaction?.isNft) return "nft_transfer";
  if (transaction?.type) return transaction.type;
  if (transaction?.transactionType === "internal") return "swapped";
  if (transaction?.isIncoming) return "received";

  return "sent";
}

function getStatusLabel(status = "", transaction = {}) {
  if (transaction?.statusDetailLabel) return transaction.statusDetailLabel;
  if (transaction?.statusLabel) return transaction.statusLabel;

  if (status === "completed") return "Confirmed";
  if (status === "failed") return "Failed";
  if (status === "manual_review") return "Manual review";

  return "Pending confirmation";
}

function getPendingSwapHashLabel(status = "") {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (
    normalizedStatus === "completed" ||
    normalizedStatus === "failed" ||
    normalizedStatus === "payout_failed" ||
    normalizedStatus === "expired"
  ) {
    return "Unavailable";
  }

  return "Pending / Not submitted yet";
}

function formatFiatAmount(value, fiatCurrency) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }

  return `${fiatCurrency}${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function mapTransactionForDetail(transaction, userProfile) {
  if (!transaction) return null;

  const type = normalizeTransactionType(transaction);
  const isSwap = type === "swap";
  const isReceived = type === "received";
  const isSent = type === "sent";
  const nft =
    transaction?.nft && typeof transaction.nft === "object" && !Array.isArray(transaction.nft)
      ? transaction.nft
      : null;
  const isNft = isSwap ? false : Boolean(transaction?.isNft || nft);

  const symbol =
    (isNft ? "NFT" : "") ||
    transaction.symbol ||
    transaction.asset ||
    transaction.currency ||
    transaction.chainMeta?.symbol ||
    "";

  const status = normalizeStatus(transaction);
  const statusLabel = getStatusLabel(status, transaction);
  const transactionHash =
    transaction.transactionHash ||
    transaction.txHash ||
    transaction.hash ||
    "";
  const address =
    transaction.address ||
    transaction.toAddress ||
    transaction.fromAddress ||
    transaction.walletAddress ||
    "";
  const sourceAmount =
    transaction.sourceAmount ||
    transaction.fromAmount ||
    transaction.swap?.sourceAmount ||
    transaction.amount ||
    "0";
  const sourceAsset =
    transaction.sourceAsset ||
    transaction.fromAsset ||
    transaction.swap?.sourceAsset ||
    transaction.asset ||
    symbol;
  const destinationAmount =
    transaction.destinationAmount ||
    transaction.toAmount ||
    transaction.finalReceiveAmount ||
    transaction.estimatedReceiveAmount ||
    transaction.swap?.finalReceiveAmount ||
    transaction.swap?.estimatedReceiveAmount ||
    transaction.amount ||
    "0";
  const destinationAsset =
    transaction.destinationAsset ||
    transaction.toAsset ||
    transaction.swap?.destinationAsset ||
    transaction.asset ||
    symbol;

  const baseFromInfo = isReceived
    ? {
        name:
          transaction.counterpartyName ||
          truncate(transaction.fromAddress) ||
          "Unknown Sender",
        handle: transaction.fromAddress || transaction.counterpartyId || "",
        avatar: transaction.counterpartyAvatar || "",
      }
    : {
        name: userProfile?.displayName || "Your Wallet",
        handle: userProfile?.handle || transaction.walletAddress || "",
        avatar: userProfile?.avatar || "",
      };

  const baseToInfo = isReceived
    ? {
        name: userProfile?.displayName || "Your Wallet",
        handle: userProfile?.handle || transaction.walletAddress || "",
        avatar: userProfile?.avatar || "",
      }
    : {
        name:
          transaction.counterpartyName ||
          truncate(transaction.toAddress) ||
          "Unknown Recipient",
        handle: transaction.toAddress || transaction.counterpartyId || "",
        avatar: transaction.counterpartyAvatar || "",
      };

  return {
    ...transaction,
    nft,
    id: transaction?.id || transaction?.transactionId || transaction?.hash || "",
    type,
    isSwap,
    isNft,
    isReceived,
    isSent,
    symbol,
    status,
    statusLabel,
    amount: transaction.amount || "0",
    title: transaction.displayTitle || transaction.counterpartyName || "Transaction",
    subtitle: transaction.displaySubtitle || "",
    fiatAmount: transaction.fiatAmount ?? transaction.amountFiat ?? null,
    date:
      transaction.date ||
      transaction.dateTimeLabel ||
      transaction.createdAt ||
      transaction.timestamp ||
      "",
    transactionHash,
    explorerUrl: transaction.explorerUrl || "",
    address,
    chainStatus: transaction.chainStatus || "",
    confirmations: transaction.confirmations ?? null,
    contractAddress: transaction.contractAddress || nft?.contractAddress || "",
    tokenId: transaction.tokenId || nft?.tokenId || "",
    standard: transaction.standard || nft?.standard || "",
    chainLabel: transaction.chainLabel || transaction.chainMeta?.name || "",
    networkLabel: transaction.networkLabel || "",
    networkFee: transaction.networkFee || "0",
    networkFeeAsset:
      transaction.networkFeeAsset ||
      transaction.networkFeeCurrency ||
      transaction.chainMeta?.symbol ||
      symbol,
    networkFeeFiat: transaction.networkFeeFiat ?? transaction.feeFiat ?? null,
    destinationTag:
      transaction.destinationTag ?? transaction.executionParams?.destinationTag ?? null,
    sourceAmount,
    sourceAsset,
    destinationAmount,
    destinationAsset,
    sourceTxHash:
      transaction.sourceTxHash ||
      transaction.swap?.sourceTxHash ||
      transaction.transactionHash ||
      transaction.txHash ||
      "",
    payoutTxHash: transaction.payoutTxHash || transaction.swap?.payoutTxHash || "",
    sourceChain:
      transaction.sourceChain || transaction.swap?.sourceChain || transaction.chain || "",
    sourceNetwork:
      transaction.sourceNetwork || transaction.swap?.sourceNetwork || transaction.network || "",
    destinationChain:
      transaction.destinationChain || transaction.swap?.destinationChain || "",
    destinationNetwork:
      transaction.destinationNetwork || transaction.swap?.destinationNetwork || "",
    payoutNetworkFee:
      transaction.payoutNetworkFee ||
      transaction.swap?.payoutNetworkFee ||
      transaction.swap?.payoutNetworkFeeEstimate ||
      "0",
    systemFeeAmount:
      transaction.systemFeeAmount || transaction.swap?.systemFeeAmount || "0",
    fromInfo: isSwap
      ? {
          name: `${sourceAmount} ${sourceAsset}`,
          handle: `${String(
            transaction.sourceChain || transaction.swap?.sourceChain || transaction.chain || "Source",
          ).toUpperCase()} ${transaction.sourceNetwork || transaction.swap?.sourceNetwork || transaction.network || ""}`.trim(),
          avatar: "",
        }
      : baseFromInfo,
    toInfo: isSwap
      ? {
          name: `${destinationAmount} ${destinationAsset}`,
          handle: `${String(
            transaction.destinationChain || transaction.swap?.destinationChain || "Destination",
          ).toUpperCase()} ${transaction.destinationNetwork || transaction.swap?.destinationNetwork || ""}`.trim(),
          avatar: "",
        }
      : baseToInfo,
  };
}

function DetailButton({ label, value, copied, onCopy }) {
  return (
    <div className="flex items-center justify-between group">
      <span className="text-xs text-slate-400 font-bold tracking-wide">
        {label}
      </span>
      <button
        onClick={onCopy}
        className="flex items-center space-x-2 bg-slate-800/40 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700/50 hover:border-slate-500 active:scale-95 transition-all group-hover:shadow-lg shadow-indigo-500/5"
      >
        <span className="text-xs text-slate-200 font-bold tracking-wider font-mono">
          {value}
        </span>
        {copied ? (
          <CheckCircle2 size={12} className="text-emerald-400" />
        ) : (
          <Copy size={12} className="text-slate-500 hover:text-white transition-colors" />
        )}
      </button>
    </div>
  );
}

export function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    transactions,
    fiatCurrency,
    userProfile,
    supportedChains,
    fetchTransactionDetails,
  } = useAppContext();

  const initialTransaction = useMemo(
    () =>
      transactions.find(
        (item) => item.id === id || item.transactionId === id || item.hash === id,
      ) || null,
    [transactions, id],
  );

  const [tx, setTx] = useState(() =>
    mapTransactionForDetail(initialTransaction, userProfile),
  );
  const [loading, setLoading] = useState(!initialTransaction);
  const [copiedType, setCopiedType] = useState("");
  const [explorerSheetOpen, setExplorerSheetOpen] = useState(false);

  useEffect(() => {
    setTx(mapTransactionForDetail(initialTransaction, userProfile));
  }, [initialTransaction, userProfile]);

  useEffect(() => {
    let isMounted = true;

    async function loadTransaction() {
      if (initialTransaction?.isSwap) {
        setLoading(false);
        return;
      }

      if (!id || !fetchTransactionDetails) {
        setLoading(false);
        return;
      }

      if (!initialTransaction) {
        setLoading(true);
      }

      try {
        const response = await fetchTransactionDetails(id);

        if (isMounted) {
          setTx(mapTransactionForDetail(response, userProfile));
        }
      } catch (_error) {
        if (isMounted && !initialTransaction) {
          setTx(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadTransaction();

    return () => {
      isMounted = false;
    };
  }, [fetchTransactionDetails, id, initialTransaction, userProfile]);

  const handleCopy = async (text, type) => {
    const normalized = String(text || "").trim();
    if (!normalized) return;

    try {
      await copyTextToClipboard(normalized);
      setCopiedType(type);
      window.setTimeout(() => setCopiedType(""), 2000);
    } catch {
      setCopiedType("");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-slate-950 text-white">
        <h2 className="text-xl font-bold">Loading transaction...</h2>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-slate-950 text-white">
        <h2 className="text-xl font-bold">Transaction Not Found</h2>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-indigo-400 hover:text-indigo-300"
        >
          Go Back
        </button>
      </div>
    );
  }

  const isReceived = tx.isReceived;
  const isSent = tx.isSent;
  const isSwap = tx.isSwap;
  const isCompleted = tx.status === "completed";
  const isFailed = tx.status === "failed";
  const isManualReview = tx.status === "manual_review";
  const sign = isSwap ? "" : isReceived ? "+" : isSent ? "-" : "";

  const Icon = isSwap
    ? RefreshCw
    : isReceived
      ? ArrowDownLeft
      : isSent
        ? ArrowUpRight
        : RefreshCw;
  const iconBg = isSwap
    ? "bg-indigo-500/20 text-indigo-400"
    : isReceived
      ? "bg-emerald-500/20 text-emerald-400"
      : isSent
        ? "bg-rose-500/20 text-rose-400"
        : "bg-indigo-500/20 text-indigo-400";
  const statusIconClassName = isCompleted
    ? "text-emerald-400"
    : isFailed
      ? "text-rose-400"
      : isManualReview
        ? "text-amber-400"
        : "text-amber-400";
  const StatusIcon = isCompleted ? CheckCircle2 : isFailed ? XCircle : Clock3;

  const sourceExplorerUrl = isSwap
    ? buildExplorerTransactionUrl(
        getChainMeta(tx.sourceChain, supportedChains),
        tx.sourceNetwork,
        tx.sourceTxHash,
      )
    : "";
  const destinationExplorerUrl = isSwap
    ? buildExplorerTransactionUrl(
        getChainMeta(tx.destinationChain, supportedChains),
        tx.destinationNetwork,
        tx.payoutTxHash,
      )
    : "";

  const openSwapExplorerUrl = (url) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    setExplorerSheetOpen(false);
  };

  const handleExplorerClick = () => {
    if (isSwap) {
      setExplorerSheetOpen(true);
      return;
    }

    if (tx.explorerUrl) {
      window.open(tx.explorerUrl, "_blank", "noopener,noreferrer");
      return;
    }

    navigate(`/app/explorer/${tx.id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="aura-container"
    >
      <section className="tx-header-section sticky top-0 z-50">
        <div className="tx-header-inner aura-header">
          <button
            onClick={() => navigate(-1)}
            className="aura-header-button group rounded-full"
          >
            <ArrowLeft
              size={18}
              className="group-hover:-translate-x-0.5 transition-transform"
            />
          </button>
          <h1 className="aura-header-title text-lg font-bold">
            Transaction Details
          </h1>
          <div className="w-10" />
        </div>
      </section>

      <div className="px-5 mt-4 flex flex-col space-y-6 pb-8">
        <section className="tx-summary-section">
          <div className="tx-summary-inner flex flex-col items-center space-y-4 pt-2">
            {tx.isNft ? (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-24 h-24 rounded-[1.75rem] overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center"
              >
                {tx.nft?.imageUrl ? (
                  <img
                    src={tx.nft.imageUrl}
                    alt={tx.nft?.title || tx.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center text-indigo-300">
                    {tx.nft?.collectionName ? <LayoutGrid size={28} /> : <ImageOff size={28} />}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className={`w-16 h-16 rounded-full flex items-center justify-center ${iconBg}`}
              >
                <Icon size={28} strokeWidth={2.5} />
              </motion.div>
            )}

            <div className="text-center space-y-1">
              {tx.isNft ? (
                <>
                  <h2 className="text-[2rem] font-black tracking-tighter text-white leading-none">
                    {tx.title}
                  </h2>
                  <p className="text-base font-medium text-indigo-300 mt-1">
                    {tx.nft?.collectionName || tx.subtitle || "NFT Transfer"}
                  </p>
                  <p className="text-sm font-medium text-slate-400 mt-2">
                    {tx.tokenId ? `Token #${tx.tokenId}` : tx.standard || "NFT"}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-[2.5rem] font-black tracking-tighter text-white leading-none">
                    {sign}
                    {isSwap
                      ? `${tx.destinationAmount} ${tx.destinationAsset}`
                      : `${tx.amount} ${tx.symbol}`}
                  </h2>
                  <p className="text-base font-medium text-slate-400 mt-1">
                    {isSwap
                      ? `${tx.sourceAsset} -> ${tx.destinationAsset}`
                      : formatFiatAmount(tx.fiatAmount, fiatCurrency) || tx.date}
                  </p>
                  {isSwap && (
                    <p className="text-sm font-medium text-slate-500 mt-2">
                      {formatFiatAmount(tx.fiatAmount, fiatCurrency) || tx.date}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center space-x-2 bg-transparent border border-slate-700/60 px-5 py-2 rounded-full mt-2">
              <StatusIcon size={14} className={statusIconClassName} />
              <span className="text-xs font-bold text-white tracking-wide capitalize">
                {tx.statusLabel}
              </span>
              <span className="text-slate-500 text-xs">-</span>
              <span className="text-xs font-medium text-slate-400">
                {tx.date}
              </span>
            </div>
          </div>
        </section>

        <section className="tx-details-section">
          <div className="tx-details-inner w-full bg-slate-900/40 rounded-3xl border border-slate-800/80 p-5 space-y-6">
            <div className="relative pl-8 space-y-10 border-b border-slate-800/60 pb-8">
              <div className="absolute left-[13px] top-6 bottom-14 w-0.5 bg-gradient-to-b from-indigo-500 via-indigo-500/20 to-emerald-500 rounded-full" />

              <div className="relative flex items-center">
                <div className="absolute left-[-23px] w-4 h-4 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                </div>

                <div className="w-11 h-11 shrink-0 mr-4">
                  {tx.fromInfo?.avatar ? (
                    <img
                      src={tx.fromInfo.avatar}
                      alt="avatar"
                      className="w-full h-full rounded-full border border-white/5 object-cover shadow-2xl"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-800 rounded-full flex items-center justify-center text-slate-500 border border-slate-700">
                      <User size={20} />
                    </div>
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">
                    From
                  </span>
                  <h3 className="text-sm font-black text-white leading-tight truncate">
                    {tx.fromInfo?.name || "Unknown"}
                  </h3>
                  <p className="text-[11px] text-blue-400 font-medium tracking-tight mt-0.5 truncate">
                    {tx.fromInfo?.handle || "Unavailable"}
                  </p>
                </div>
              </div>

              <div className="relative flex items-center">
                <div className="absolute left-[-23px] w-4 h-4 rounded-full bg-slate-900 border-2 border-emerald-500 flex items-center justify-center z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                </div>

                <div className="w-11 h-11 shrink-0 mr-4">
                  {tx.toInfo?.avatar ? (
                    <img
                      src={tx.toInfo.avatar}
                      alt="avatar"
                      className="w-full h-full rounded-full border border-white/5 object-cover shadow-2xl"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-800 rounded-full flex items-center justify-center text-slate-500 border border-slate-700">
                      <User size={20} />
                    </div>
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">
                    To
                  </span>
                  <h3 className="text-sm font-black text-white leading-tight truncate">
                    {tx.toInfo?.name || "Unknown"}
                  </h3>
                  <p className="text-[11px] text-blue-400 font-medium tracking-tight mt-0.5 truncate">
                    {tx.toInfo?.handle || "Unavailable"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 pt-1">
              {isSwap && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-bold tracking-wide">
                      Source Amount
                    </span>
                    <span className="text-xs font-bold text-white block tracking-wide">
                      {tx.sourceAmount} {tx.sourceAsset}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-bold tracking-wide">
                      Destination Amount
                    </span>
                    <span className="text-xs font-bold text-emerald-400 block tracking-wide">
                      {tx.destinationAmount} {tx.destinationAsset}
                    </span>
                  </div>

                  {tx.systemFeeAmount !== "0" && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-bold tracking-wide">
                        System Fee
                      </span>
                      <span className="text-xs font-bold text-white block tracking-wide">
                        {tx.systemFeeAmount} {tx.destinationAsset}
                      </span>
                    </div>
                  )}

                  {tx.payoutNetworkFee !== "0" && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-bold tracking-wide">
                        Destination Network Fee
                      </span>
                      <span className="text-xs font-bold text-white block tracking-wide">
                        {tx.payoutNetworkFee} {tx.destinationAsset}
                      </span>
                    </div>
                  )}

                  {tx.sourceTxHash && (
                    <DetailButton
                      label="Source Tx Hash"
                      value={truncateDisplayValue(tx.sourceTxHash)}
                      copied={copiedType === "sourceHash"}
                      onCopy={() => handleCopy(tx.sourceTxHash, "sourceHash")}
                    />
                  )}

                  {!tx.sourceTxHash && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-bold tracking-wide">
                        Source Tx Hash
                      </span>
                      <span className="text-xs font-bold text-slate-500 block tracking-wide">
                        {getPendingSwapHashLabel(tx.status)}
                      </span>
                    </div>
                  )}

                  {tx.payoutTxHash && (
                    <DetailButton
                      label="Destination Tx Hash"
                      value={truncateDisplayValue(tx.payoutTxHash)}
                      copied={copiedType === "payoutHash"}
                      onCopy={() => handleCopy(tx.payoutTxHash, "payoutHash")}
                    />
                  )}

                  {!tx.payoutTxHash && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-bold tracking-wide">
                        Destination Tx Hash
                      </span>
                      <span className="text-xs font-bold text-slate-500 block tracking-wide">
                        {getPendingSwapHashLabel(tx.status)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {tx.address && (
                <DetailButton
                  label="Network Address"
                  value={truncateDisplayValue(tx.address)}
                  copied={copiedType === "address"}
                  onCopy={() => handleCopy(tx.address, "address")}
                />
              )}

              {tx.transactionHash && (
                <DetailButton
                  label="Transaction Hash"
                  value={truncateDisplayValue(tx.transactionHash)}
                  copied={copiedType === "hash"}
                  onCopy={() => handleCopy(tx.transactionHash, "hash")}
                />
              )}

              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold tracking-wide">
                  Network Fee
                </span>
                <div className="text-right">
                  <span className="text-xs font-bold text-white block tracking-wide">
                    {tx.networkFee} {tx.networkFeeAsset}
                  </span>
                  {tx.networkFeeFiat !== null && tx.networkFeeFiat !== undefined && (
                    <span className="text-[10px] font-medium text-slate-500 mt-0.5 block">
                      {fiatCurrency}
                      {Number(tx.networkFeeFiat).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {(tx.chainLabel || tx.networkLabel) && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-bold tracking-wide">
                    Network
                  </span>
                  <span className="text-xs font-bold text-white block tracking-wide">
                    {[tx.chainLabel, tx.networkLabel].filter(Boolean).join(" - ")}
                  </span>
                </div>
              )}

              {tx.chainStatus && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-bold tracking-wide">
                    Chain Status
                  </span>
                  <span className="text-xs font-bold text-white block tracking-wide">
                    {tx.chainStatus}
                  </span>
                </div>
              )}

              {tx.confirmations !== null && tx.confirmations !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-bold tracking-wide">
                    Confirmations
                  </span>
                  <span className="text-xs font-bold text-white block tracking-wide">
                    {tx.confirmations}
                  </span>
                </div>
              )}

              {tx.contractAddress && (
                <DetailButton
                  label="Contract Address"
                  value={truncateDisplayValue(tx.contractAddress)}
                  copied={copiedType === "contract"}
                  onCopy={() => handleCopy(tx.contractAddress, "contract")}
                />
              )}

              {tx.destinationTag !== null &&
                tx.destinationTag !== undefined &&
                tx.destinationTag !== "" && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-bold tracking-wide">
                      Destination Tag
                    </span>
                    <span className="text-xs font-bold text-white block tracking-wide">
                      {tx.destinationTag}
                    </span>
                  </div>
                )}
            </div>
          </div>
        </section>

        <section className="tx-actions-section mt-4 mb-2 w-full">
          <div className="tx-actions-inner flex space-x-4 w-full">
            <button
              onClick={handleExplorerClick}
              className="flex-1 bg-transparent border-2 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-white font-bold py-3.5 rounded-2xl transition-all flex items-center justify-center space-x-2 active:scale-95"
            >
              {tx.explorerUrl && !isSwap ? (
                <ExternalLink size={16} className="text-slate-300" />
              ) : (
                <FileText size={16} className="text-slate-300" />
              )}
              <span className="text-sm">
                {isSwap ? "View on block explorer" : tx.explorerUrl ? "Open Explorer" : "View on Explorer"}
              </span>
            </button>

            <button
              onClick={() => navigate(`/app/receipt/${tx.id}`)}
              className="flex-1 bg-[#5d43fe] hover:bg-indigo-500 text-white font-bold py-3.5 rounded-2xl transition-all shadow-[0_4px_20px_rgba(93,67,254,0.4)] flex items-center justify-center text-sm active:scale-95"
            >
              Share Receipt
            </button>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {isSwap && explorerSheetOpen ? (
          <div className="absolute inset-0 z-[120] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExplorerSheetOpen(false)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", damping: 24, stiffness: 260 }}
              className="relative z-[121] w-full rounded-t-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-2xl"
            >
              <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-700" />
              <h3 className="mb-4 text-center text-base font-black text-white">
                View on block explorer
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => openSwapExplorerUrl(sourceExplorerUrl)}
                  disabled={!sourceExplorerUrl}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 text-left transition-all hover:border-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-black text-white">
                      Source Tx Hash
                    </span>
                    <span className="mt-1 block font-mono text-xs font-bold text-slate-500">
                      {tx.sourceTxHash
                        ? truncate(tx.sourceTxHash)
                        : getPendingSwapHashLabel(tx.status)}
                    </span>
                  </span>
                  <ExternalLink size={16} className="text-indigo-300" />
                </button>

                <button
                  onClick={() => openSwapExplorerUrl(destinationExplorerUrl)}
                  disabled={!destinationExplorerUrl}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 text-left transition-all hover:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-black text-white">
                      Destination Tx Hash
                    </span>
                    <span className="mt-1 block font-mono text-xs font-bold text-slate-500">
                      {tx.payoutTxHash
                        ? truncate(tx.payoutTxHash)
                        : getPendingSwapHashLabel(tx.status)}
                    </span>
                  </span>
                  <ExternalLink size={16} className="text-emerald-300" />
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
