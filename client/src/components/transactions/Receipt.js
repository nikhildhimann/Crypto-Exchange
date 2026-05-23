import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import {
  Share2,
  Download,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImageOff,
  LayoutGrid,
  X,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useAppContext } from "../../contexts/AppContext";
import { buildExplorerTransactionUrl, getChainMeta } from "../../config/chains";
import { copyTextToClipboard } from "../../lib/clipboard";
import { toast } from "sonner";

function getReceiptIdentity(source) {
  if (!source || typeof source !== "object") {
    return "";
  }

  return String(
    source.id ||
      source.transactionId ||
      source._id ||
      source.transactionHash ||
      source.txHash ||
      source.hash ||
      "",
  ).trim();
}

function resolveReceiptStatus(status = "") {
  if (status === "success") return "completed";
  if (status === "failed") return "failed";
  if (status === "manual_review") return "manual review";
  if (status === "pending") return "pending";
  return status || "";
}

function resolveSwapReceiptStatus(status = "") {
  const normalizedStatus = normalizeText(status).toLowerCase();

  if (normalizedStatus === "completed" || normalizedStatus === "success") {
    return "completed";
  }

  if (
    normalizedStatus === "failed" ||
    normalizedStatus === "payout_failed" ||
    normalizedStatus === "expired"
  ) {
    return "failed";
  }

  if (normalizedStatus === "manual_review") {
    return "manual review";
  }

  return "pending";
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function getSwapPayload(source = {}) {
  if (source?.swap && typeof source.swap === "object") {
    return source.swap;
  }

  const metadataSwap = source?.metadata?.swap;
  return metadataSwap && typeof metadataSwap === "object" ? metadataSwap : {};
}

function isSwapReceiptSource(source = {}) {
  return (
    source?.isSwap === true ||
    normalizeText(source?.type).toLowerCase() === "swap" ||
    normalizeText(source?.direction).toLowerCase() === "swap" ||
    Boolean(getSwapPayload(source).swapId)
  );
}

function getFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function formatChainNetwork(chain = "", network = "") {
  return [normalizeText(chain).toUpperCase(), normalizeText(network)]
    .filter(Boolean)
    .join(" ");
}

function buildReceiptExplorerUrl(chain, network, txHash, supportedChains = []) {
  return buildExplorerTransactionUrl(
    getChainMeta(chain, supportedChains),
    network,
    txHash,
  );
}

function getRouteSwapId(value = "") {
  const normalized = normalizeText(value);

  return normalized.startsWith("swap:") ? normalized.slice(5).trim() : "";
}

function buildReceiptSourceFromSwapRecord(record = {}) {
  const swapId = getFirstText(record?.swapId, record?.quoteId);
  if (!swapId) {
    return null;
  }

  const from = record?.from || {};
  const to = record?.to || {};
  const fees = record?.fees || {};
  const sourceTransaction = from?.sourceTransaction || {};
  const payoutTransaction = to?.payoutTransaction || {};
  const sourceTxHash = getFirstText(record?.sourceTxHash, sourceTransaction.txHash);
  const payoutTxHash = getFirstText(record?.payoutTxHash, payoutTransaction.txHash);
  const finalReceiveAmount = getFirstText(
    to.finalReceiveAmount,
    record.finalReceiveAmount,
    to.estimatedReceiveAmount,
  );
  const sourceNetworkFee = getFirstText(from.sourceNetworkFee, fees.sourceNetworkFee);
  const systemFeeAmount = getFirstText(to.systemFeeAmount, fees.systemFeeAmount);
  const payoutNetworkFee = getFirstText(
    to.payoutNetworkFee,
    fees.payoutNetworkFee,
    to.payoutNetworkFeeEstimate,
    fees.payoutNetworkFeeEstimate,
  );

  return {
    id: `swap:${swapId}`,
    isSwap: true,
    type: "swap",
    direction: "swap",
    status: record.status || "pending",
    date: record.updatedAt || record.createdAt || "",
    displayTimestamp: record.updatedAt || record.createdAt || "",
    sourceAmount: from.amount || "",
    sourceAsset: from.symbol || from.asset || "",
    destinationAmount: finalReceiveAmount,
    destinationAsset: to.symbol || to.asset || "",
    sourceChain: from.chain || "",
    sourceNetwork: from.network || "",
    destinationChain: to.chain || "",
    destinationNetwork: to.network || "",
    sourceTxHash,
    payoutTxHash,
    walletAddress: from.address || "",
    requestId: record.requestId || "",
    networkFee: sourceNetworkFee,
    systemFeeAmount,
    payoutNetworkFee,
    counterpartyId: swapId,
    swap: {
      swapId,
      requestId: record.requestId || "",
      status: record.status || "pending",
      sourceAmount: from.amount || "",
      sourceAsset: from.symbol || from.asset || "",
      destinationAsset: to.symbol || to.asset || "",
      estimatedReceiveAmount: to.estimatedReceiveAmount || finalReceiveAmount,
      finalReceiveAmount,
      sourceChain: from.chain || "",
      sourceNetwork: from.network || "",
      destinationChain: to.chain || "",
      destinationNetwork: to.network || "",
      sourceTxHash,
      payoutTxHash,
      sourceNetworkFee,
      systemFeeAmount,
      payoutNetworkFee,
    },
  };
}

function hasReceiptIdentity(source) {
  return Boolean(getReceiptIdentity(source));
}

function matchesReceiptRoute(source, requestedId) {
  if (!requestedId) {
    return hasReceiptIdentity(source);
  }

  return getReceiptIdentity(source) === String(requestedId);
}

function hasUsableReceiptData(source, requestedId) {
  if (!matchesReceiptRoute(source, requestedId)) {
    return false;
  }

  if (isSwapReceiptSource(source)) {
    const swap = getSwapPayload(source);
    const sourceAmount = getFirstText(source?.sourceAmount, swap.sourceAmount, source?.amount);
    const destinationAmount = getFirstText(
      source?.destinationAmount,
      swap.finalReceiveAmount,
      swap.estimatedReceiveAmount,
      source?.amount,
    );
    const sourceAsset = getFirstText(source?.sourceAsset, swap.sourceAsset);
    const destinationAsset = getFirstText(
      source?.destinationAsset,
      swap.destinationAsset,
      source?.symbol,
      source?.asset,
    );
    const status = getFirstText(source?.status, swap.status);

    return Boolean(sourceAmount && destinationAmount && sourceAsset && destinationAsset && status);
  }

  const amount =
    source?.amount !== undefined && source?.amount !== null
      ? String(source.amount).trim()
      : "";
  const status = typeof source?.status === "string" ? source.status.trim() : "";
  const network = String(
    source?.walletNetwork ||
      source?.network ||
      source?.chain ||
      "",
  ).trim();
  const symbol = String(
    source?.symbol ||
      source?.asset ||
      source?.currency ||
      "",
  ).trim();
  const timestamp =
    source?.displayTimestamp ||
    source?.dateTimeLabel ||
    source?.date ||
    source?.chainTimestamp ||
    source?.confirmedAt ||
    source?.createdAt ||
    source?.updatedAt ||
    source?.timestamp ||
    null;

  return Boolean(
    amount &&
      status &&
      symbol &&
      (network || timestamp || source?.transactionHash || source?.txHash || source?.hash || source?.id || source?.transactionId || source?._id),
  );
}

function normalizeTx(source, supportedChains = []) {
  if (!hasUsableReceiptData(source, getReceiptIdentity(source))) {
    return null;
  }

  const swap = getSwapPayload(source);
  const isSwap = isSwapReceiptSource(source);
  const rawStatus = getFirstText(source?.status, swap.status);
  const status = isSwap
    ? resolveSwapReceiptStatus(rawStatus)
    : resolveReceiptStatus(rawStatus);
  const date =
    source?.dateTimeLabel ||
    source?.date ||
    source?.displayTimestamp ||
    source?.chainTimestamp ||
    source?.confirmedAt ||
    source?.createdAt ||
    source?.updatedAt ||
    source?.timestamp ||
    "Time unavailable";
  const transactionHash =
    source?.transactionHash ||
    source?.txHash ||
    source?.hash ||
    "";
  const network =
    source?.networkLabel ||
    source?.walletNetwork ||
    source?.network ||
    source?.chain ||
    "Unavailable";
  const sourceTxHash = getFirstText(
    source?.sourceTxHash,
    swap.sourceTxHash,
    transactionHash,
  );
  const destinationTxHash = getFirstText(source?.payoutTxHash, swap.payoutTxHash);
  const sourceChain = getFirstText(source?.sourceChain, swap.sourceChain, source?.chain);
  const sourceNetwork = getFirstText(source?.sourceNetwork, swap.sourceNetwork, source?.network);
  const destinationChain = getFirstText(source?.destinationChain, swap.destinationChain);
  const destinationNetwork = getFirstText(source?.destinationNetwork, swap.destinationNetwork);
  const sourceAmount = getFirstText(source?.sourceAmount, swap.sourceAmount, source?.amount);
  const sourceAsset = getFirstText(source?.sourceAsset, swap.sourceAsset, source?.asset, source?.symbol);
  const destinationAmount = getFirstText(
    source?.destinationAmount,
    swap.finalReceiveAmount,
    swap.estimatedReceiveAmount,
    source?.amount,
  );
  const destinationAsset = getFirstText(
    source?.destinationAsset,
    swap.destinationAsset,
    source?.symbol,
    source?.asset,
    source?.currency,
  );
  const isNft = Boolean(source?.isNft);

  return {
    id:
      source?.id ||
      source?.transactionId ||
      source?._id ||
      source?.transactionHash ||
      source?.txHash ||
      source?.hash,
    isSwap,
    receiptTitle: isSwap ? "Swap Receipt" : "Transaction Receipt",
    amount: isSwap ? destinationAmount : String(source?.amount ?? ""),
    symbol: isSwap ? destinationAsset : isNft ? "NFT" : source?.symbol || source?.asset || source?.currency || "",
    fiatAmount:
      source?.fiatAmount ??
      source?.fiatValue ??
      source?.usdValue ??
      0,
    date,
    status,
    statusLabel:
      source?.statusLabel ||
      source?.statusDetailLabel ||
      status ||
      "unknown",
    transactionHash,
    network,
    isNft,
    title:
      source?.displayTitle ||
      source?.nft?.title ||
      (isNft ? "NFT Transfer" : isSwap ? "Swap Receipt" : "Transaction Receipt"),
    subtitle: source?.displaySubtitle || "",
    explorerUrl: source?.explorerUrl || "",
    tokenId: source?.tokenId || source?.nft?.tokenId || "",
    contractAddress: source?.contractAddress || source?.nft?.contractAddress || "",
    standard: source?.standard || source?.nft?.standard || "",
    confirmations: Number(source?.confirmations || 0),
    chainStatus: source?.chainStatus || "",
    nft: source?.nft || null,
    swapId: getFirstText(source?.counterpartyId, swap.swapId, source?.id).replace(/^swap:/, ""),
    requestId: getFirstText(source?.requestId, swap.requestId),
    sourceAmount,
    sourceAsset,
    destinationAmount,
    destinationAsset,
    sourceChain,
    sourceNetwork,
    destinationChain,
    destinationNetwork,
    sourceTxHash,
    destinationTxHash,
    sourceExplorerUrl: buildReceiptExplorerUrl(
      sourceChain,
      sourceNetwork,
      sourceTxHash,
      supportedChains,
    ),
    destinationExplorerUrl: buildReceiptExplorerUrl(
      destinationChain,
      destinationNetwork,
      destinationTxHash,
      supportedChains,
    ),
    sourceWalletAddress: getFirstText(source?.walletAddress),
    sourceNetworkFee: getFirstText(source?.networkFee, swap.sourceNetworkFee),
    systemFeeAmount: getFirstText(source?.systemFeeAmount, swap.systemFeeAmount),
    payoutNetworkFee: getFirstText(source?.payoutNetworkFee, swap.payoutNetworkFee),
  };
}

function buildReceiptText(tx, fiatCurrency = "$") {
  if (!tx?.isSwap) {
    return `Transaction Receipt

Amount: ${tx.amount} ${tx.symbol}
Fiat: ${fiatCurrency}${Number(tx.fiatAmount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}
Date: ${tx.date}
Status: ${tx.statusLabel || "unknown"}
Network: ${tx.network}
Hash: ${tx.transactionHash || "Unavailable"}`;
  }

  return [
    "Swap Receipt",
    "",
    `Status: ${tx.statusLabel || "unknown"}`,
    `Date/Time: ${tx.date}`,
    `Source: ${tx.sourceAmount || "Unavailable"} ${tx.sourceAsset || ""}`.trim(),
    `Destination: ${tx.destinationAmount || "Unavailable"} ${tx.destinationAsset || ""}`.trim(),
    `Source Chain/Network: ${formatChainNetwork(tx.sourceChain, tx.sourceNetwork) || "Unavailable"}`,
    `Destination Chain/Network: ${formatChainNetwork(tx.destinationChain, tx.destinationNetwork) || "Unavailable"}`,
    `Source Tx Hash: ${tx.sourceTxHash || "Unavailable"}`,
    `Destination Tx Hash: ${tx.destinationTxHash || "Unavailable"}`,
    `Source Explorer URL: ${tx.sourceExplorerUrl || "Unavailable"}`,
    `Destination Explorer URL: ${tx.destinationExplorerUrl || "Unavailable"}`,
    `Source Wallet: ${tx.sourceWalletAddress || "Unavailable"}`,
    `Swap ID: ${tx.swapId || "Unavailable"}`,
    `Request ID: ${tx.requestId || "Unavailable"}`,
    `Source Network Fee: ${tx.sourceNetworkFee || "Unavailable"} ${tx.sourceAsset || ""}`.trim(),
    `System Fee: ${tx.systemFeeAmount || "Unavailable"} ${tx.destinationAsset || ""}`.trim(),
    `Destination Network Fee: ${tx.payoutNetworkFee || "Unavailable"} ${tx.destinationAsset || ""}`.trim(),
  ].join("\n");
}

export function Receipt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    transactions,
    fiatCurrency,
    fetchTransactionDetails,
    getSwapById,
    supportedChains,
  } = useAppContext();

  const stateTx = location.state?.transaction;
  const routeSwapId = useMemo(() => getRouteSwapId(id), [id]);

  const txFromStore = useMemo(
    () =>
      transactions.find(
        (t) =>
          t.id === id ||
          t.transactionId === id ||
          t._id === id ||
          t.transactionHash === id ||
          t.txHash === id ||
          t.hash === id,
      ) || null,
    [transactions, id],
  );

  const preferredTx = useMemo(() => {
    if (routeSwapId) {
      return null;
    }

    if (hasUsableReceiptData(stateTx, id)) {
      return stateTx;
    }

    if (hasUsableReceiptData(txFromStore, id)) {
      return txFromStore;
    }

    if (hasUsableReceiptData(stateTx, id)) {
      return stateTx;
    }

    return null;
  }, [id, routeSwapId, stateTx, txFromStore]);

  const [fetchedTx, setFetchedTx] = useState(null);
  const [loading, setLoading] = useState(Boolean(routeSwapId) || (!preferredTx && Boolean(id)));

  useEffect(() => {
    setFetchedTx(null);
    setLoading(Boolean(routeSwapId) || (!preferredTx && Boolean(id)));
  }, [preferredTx, id, routeSwapId]);

  useEffect(() => {
    let isMounted = true;

    async function loadTransaction() {
      if (routeSwapId) {
        if (!getSwapById) {
          setLoading(false);
          return;
        }

        setLoading(true);

        try {
          const response = await getSwapById(routeSwapId);
          const latestSwapReceipt = buildReceiptSourceFromSwapRecord(response);

          if (
            isMounted &&
            latestSwapReceipt &&
            hasUsableReceiptData(latestSwapReceipt, id)
          ) {
            setFetchedTx(latestSwapReceipt);
          } else if (isMounted) {
            setFetchedTx(null);
          }
        } catch {
          if (isMounted) {
            setFetchedTx(null);
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }

        return;
      }

      if (preferredTx || !id || !fetchTransactionDetails) {
        return;
      }

      setLoading(true);

      try {
        const response = await fetchTransactionDetails(id);

        if (isMounted && hasUsableReceiptData(response, id)) {
          setFetchedTx(response);
        }
      } catch {
        if (isMounted) {
          setFetchedTx(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadTransaction();

    return () => {
      isMounted = false;
    };
  }, [preferredTx, id, routeSwapId, fetchTransactionDetails, getSwapById]);

  const tx = useMemo(
    () => normalizeTx(preferredTx || fetchedTx, supportedChains),
    [preferredTx, fetchedTx, supportedChains],
  );

  const handleCopyHash = async () => {
    if (!tx?.transactionHash) return;

    try {
      await copyTextToClipboard(tx.transactionHash);
      toast.success("Transaction hash copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCopyValue = async (value, label = "Value") => {
    if (!value) return;

    try {
      await copyTextToClipboard(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleShare = async () => {
    if (!tx) return;

    const headline = tx.isNft
      ? `${tx.title || "NFT Transfer"}`
      : `${tx.amount} ${tx.symbol}`;
    const text = `Transaction ${tx.statusLabel || "Update"}

Amount: ${headline}
Date: ${tx.date}
Hash: ${tx.transactionHash}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: tx.isSwap ? "Swap Receipt" : "Transaction Receipt",
          text,
        });
        return;
      } catch {}
    }

    try {
      await copyTextToClipboard(text);
      toast.success("Receipt copied");
    } catch {
      toast.error("Failed to share");
    }
  };

  const handleSave = async () => {
    if (!tx) return;

    const amountLabel = tx.isNft
      ? `${tx.title || "NFT Transfer"}${tx.tokenId ? ` (Token #${tx.tokenId})` : ""}`
      : `${tx.amount} ${tx.symbol}`;
    const fiatLine =
      !tx.isNft && tx.fiatAmount !== null && tx.fiatAmount !== undefined
        ? `Fiat: ${fiatCurrency}${Number(tx.fiatAmount || 0).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : "";
    const text = `Transaction Receipt

Amount: ${amountLabel}
${fiatLine}
Date: ${tx.date}
Status: ${tx.statusLabel || "unknown"}
Network: ${tx.network}
Hash: ${tx.transactionHash || "Unavailable"}`;

    try {
      await copyTextToClipboard(text);
      toast.success("Receipt copied for saving");
    } catch {
      toast.error("Failed to save receipt");
    }
  };

  if (loading) {
    return (
      <div className="aura-container bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center w-full px-6 z-10">
          <h2 className="text-xl font-bold text-white">Loading receipt...</h2>
        </div>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="aura-container bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center w-full px-6 z-10">
          <h2 className="text-xl font-bold text-white">Receipt unavailable</h2>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-indigo-400 hover:text-indigo-300"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const statusClassName =
    tx.status === "failed"
      ? "text-rose-400"
      : tx.status === "pending" || tx.status === "manual review"
      ? "text-amber-400"
      : "text-emerald-400";
  const StatusIcon =
    tx.status === "failed"
      ? XCircle
      : tx.status === "pending" || tx.status === "manual review"
      ? Clock3
      : CheckCircle2;

  return (
    <div className="aura-container bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center w-full px-6 z-10">
        <motion.section
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="receipt-card-section w-full max-w-[340px] relative"
        >
          <button
            onClick={() => navigate(-1)}
            className="absolute top-4 right-4 z-[110] p-2 bg-black/20 hover:bg-black/40 text-white/70 hover:text-white rounded-full backdrop-blur-md transition-all active:scale-90"
          >
            <X size={18} />
          </button>

          <div className="receipt-card-inner">
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
              <div className="bg-gradient-to-b from-indigo-600 to-indigo-700 px-6 pt-10 pb-8 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-10 translate-x-10 blur-2xl" />

                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20 relative z-10"
                >
                  <StatusIcon size={28} className="text-white" />
                </motion.div>

                {tx.isNft ? (
                  <>
                    <div className="w-20 h-20 mx-auto mb-4 rounded-[1.5rem] overflow-hidden border border-white/15 bg-slate-900/40 flex items-center justify-center relative z-10">
                      {tx.nft?.imageUrl ? (
                        <img
                          src={tx.nft.imageUrl}
                          alt={tx.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-white/10 flex items-center justify-center text-white/80">
                          {tx.nft?.collectionName ? <LayoutGrid size={24} /> : <ImageOff size={24} />}
                        </div>
                      )}
                    </div>
                    <h2 className="text-white text-2xl font-black mb-1 relative z-10 tracking-tight">
                      {tx.title}
                    </h2>
                    <p className="text-indigo-100/80 font-bold text-sm mt-1 relative z-10 tracking-wider">
                      {tx.tokenId ? `Token #${tx.tokenId}` : tx.standard || "NFT Transfer"}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-white text-3xl font-black mb-1 relative z-10 tracking-tight">
                      {tx.isSwap
                    ? `${tx.sourceAsset} → ${tx.destinationAsset}`
                    : `${tx.amount} ${tx.symbol}`}
                    </h2>

                    <p className="text-indigo-100/80 font-bold text-sm mt-1 relative z-10 tracking-wider">
                      {fiatCurrency}
                      {Number(tx.fiatAmount || 0).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </>
                )}

                <span className="inline-block mt-4 bg-white/10 backdrop-blur-sm text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-white/10">
                  {tx.statusLabel || "Unknown"}
                </span>
              </div>

              <div className="flex w-full overflow-hidden relative">
                <div className="absolute -left-3 -top-3 w-6 h-6 bg-slate-950 rounded-full border border-slate-800/50" />
                <div className="h-[2px] w-full border-t-2 border-dashed border-slate-800/80 mt-[-1px]" />
                <div className="absolute -right-3 -top-3 w-6 h-6 bg-slate-950 rounded-full border border-slate-800/50" />
              </div>

              <div className="p-7 space-y-5 bg-slate-900">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                    Date
                  </span>
                  <span className="text-white font-bold text-sm">{tx.date}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                    Status
                  </span>
                  <span className={`${statusClassName} font-black text-xs capitalize`}>
                    {tx.statusLabel || "unknown"}
                  </span>
                </div>

                {tx.isSwap ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                        Source
                      </span>
                      <span className="text-white font-bold text-sm">
                        {tx.sourceAmount} {tx.sourceAsset}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                        Destination
                      </span>
                      <span className="text-emerald-400 font-bold text-sm">
                        {tx.destinationAmount} {tx.destinationAsset}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                        Source Chain
                      </span>
                      <span className="text-white font-bold text-sm">
                        {formatChainNetwork(tx.sourceChain, tx.sourceNetwork) || "Unavailable"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                        Destination Chain
                      </span>
                      <span className="text-white font-bold text-sm">
                        {formatChainNetwork(tx.destinationChain, tx.destinationNetwork) || "Unavailable"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                        Source Hash
                      </span>
                      <button
                        onClick={() => handleCopyValue(tx.sourceTxHash, "Source hash")}
                        className="text-indigo-400 font-bold font-mono text-xs cursor-pointer hover:text-indigo-300"
                      >
                        {tx.sourceTxHash
                          ? `${tx.sourceTxHash.slice(0, 8)}...${tx.sourceTxHash.slice(-6)}`
                          : "Unavailable"}
                      </button>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                        Destination Hash
                      </span>
                      <button
                        onClick={() => handleCopyValue(tx.destinationTxHash, "Destination hash")}
                        className="text-indigo-400 font-bold font-mono text-xs cursor-pointer hover:text-indigo-300"
                      >
                        {tx.destinationTxHash
                          ? `${tx.destinationTxHash.slice(0, 8)}...${tx.destinationTxHash.slice(-6)}`
                          : "Unavailable"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                        Network
                      </span>
                      <span className="text-white font-bold text-sm">{tx.network}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                        Hash
                      </span>
                      <button
                        onClick={handleCopyHash}
                        className="text-indigo-400 font-bold font-mono text-xs cursor-pointer hover:text-indigo-300"
                      >
                        {tx.transactionHash
                          ? `${tx.transactionHash.slice(0, 8)}...${tx.transactionHash.slice(-6)}`
                          : "Unavailable"}
                      </button>
                    </div>
                  </>
                )}

                {tx.isNft ? (
                  <>
                    {tx.nft?.collectionName ? (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                          Collection
                        </span>
                        <span className="text-white font-bold text-sm">{tx.nft.collectionName}</span>
                      </div>
                    ) : null}

                    {tx.tokenId ? (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                          Token ID
                        </span>
                        <span className="text-white font-bold text-sm">{tx.tokenId}</span>
                      </div>
                    ) : null}

                    {tx.standard ? (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                          Standard
                        </span>
                        <span className="text-white font-bold text-sm">{tx.standard}</span>
                      </div>
                    ) : null}

                    {tx.confirmations > 0 ? (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                          Confirmations
                        </span>
                        <span className="text-white font-bold text-sm">{tx.confirmations}</span>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {tx.explorerUrl ? (
                  <button
                    onClick={() => window.open(tx.explorerUrl, "_blank", "noopener,noreferrer")}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm font-bold text-white transition-colors hover:border-indigo-500/50 hover:text-indigo-200"
                  >
                    <ExternalLink size={16} />
                    Open Explorer
                  </button>
                ) : null}

                <div className="pt-6 border-t border-slate-800/50 text-center">
                  <p className="text-slate-600 font-bold text-[9px] uppercase tracking-[0.3em] mb-3">
                    Crypto Wallet Secure Transaction
                  </p>

                  <div className="w-full flex items-center justify-center space-x-1.5 opacity-30 grayscale invert">
                    {[...Array(15)].map((_, i) => (
                      <div
                        key={i}
                        className={`bg-white rounded-full ${
                          i % 3 === 0
                            ? "h-6 w-1"
                            : i % 2 === 0
                            ? "h-4 w-[1px]"
                            : "h-2 w-[1.5px]"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      </div>

      <section className="fixed bottom-8 left-0 w-full px-6 z-50">
        <div className="max-w-sm mx-auto flex space-x-4">
          <button
            onClick={handleSave}
            className="flex-1 bg-slate-900/80 backdrop-blur-xl border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold py-4 rounded-2xl flex items-center justify-center space-x-2 transition-all active:scale-95"
          >
            <Download size={18} />
            <span className="text-sm">Save</span>
          </button>

          <button
            onClick={handleShare}
            className="flex-[1.5] bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center space-x-2 transition-all shadow-[0_10px_25px_-5px_rgba(79,70,229,0.4)] active:scale-95 tracking-wide"
          >
            <Share2 size={18} />
            <span className="text-sm">Share Receipt</span>
          </button>
        </div>
      </section>
    </div>
  );
}
