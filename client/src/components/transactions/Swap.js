import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  RefreshCw,
  Settings2,
  X,
  XCircle,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

import { buildExplorerTransactionUrl, getChainMeta } from "../../config/chains";
import { useAppContext } from "../../contexts/AppContext";
import { getErrorMessage } from "../../lib/errorMessage";
import { runtimeConfig } from "../../lib/runtimeConfig";

const PREVIEW_DEBOUNCE_MS = runtimeConfig.conversionPreviewDebounceMs;
const POLL_INTERVAL_MS = runtimeConfig.swapStatusPollIntervalMs;
const MIN_CONFIRM_LOADING_MS = 1000;
const MAX_SWAP_AMOUNT_DECIMALS = 18;
const MAX_SWAP_AMOUNT_WHOLE_DIGITS = 24;
const MAX_SWAP_AMOUNT_INPUT_LENGTH = MAX_SWAP_AMOUNT_WHOLE_DIGITS + MAX_SWAP_AMOUNT_DECIMALS + 1;
const FINAL_SWAP_STATUSES = new Set(["completed", "failed", "payout_failed", "manual_review", "expired"]);
const POLLING_SWAP_STATUSES = new Set([
  "awaiting_source_submission",
  "awaiting_source_confirmation",
  "source_received",
  "ready_for_payout",
  "payout_submitted",
]);

function normalizeCode(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeAssetSymbol(value = "") {
  return String(value || "").trim().toUpperCase();
}

function buildEndpointKey({ chain, network, asset }) {
  const normalizedChain = normalizeCode(chain);
  const normalizedNetwork = normalizeCode(network);
  const normalizedAsset = normalizeAssetSymbol(asset);

  if (!normalizedChain || !normalizedNetwork || !normalizedAsset) {
    return "";
  }

  return `${normalizedChain}:${normalizedNetwork}:${normalizedAsset}`;
}

function isFinalStatus(status = "") {
  return FINAL_SWAP_STATUSES.has(normalizeCode(status));
}

function isPollingStatus(status = "") {
  return POLLING_SWAP_STATUSES.has(normalizeCode(status));
}

function isAcceptedSwapStatus(status = "") {
  const normalizedStatus = normalizeCode(status);

  return (
    normalizedStatus &&
    normalizedStatus !== "previewed" &&
    normalizedStatus !== "failed" &&
    normalizedStatus !== "payout_failed" &&
    normalizedStatus !== "expired"
  );
}

function isPositiveAmountInput(value = "") {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return false;
  }

  return new RegExp(
    `^(?!0+(\\.0+)?$)[0-9]{1,${MAX_SWAP_AMOUNT_WHOLE_DIGITS}}(\\.[0-9]{1,${MAX_SWAP_AMOUNT_DECIMALS}})?$`,
  ).test(normalized);
}

function sanitizeSwapAmountInput(value = "") {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim()
    .slice(0, MAX_SWAP_AMOUNT_INPUT_LENGTH);

  if (!normalized) {
    return "";
  }

  if (!/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }

  const [wholePartRaw = "", fractionPartRaw = ""] = normalized.split(".");
  const wholePart = wholePartRaw.slice(0, MAX_SWAP_AMOUNT_WHOLE_DIGITS);
  const fractionPart = fractionPartRaw.slice(0, MAX_SWAP_AMOUNT_DECIMALS);

  if (normalized.startsWith(".")) {
    return fractionPart ? `0.${fractionPart}` : "0.";
  }

  return normalized.includes(".") ? `${wholePart}.${fractionPart}` : wholePart;
}

function formatAmount(value, maximumFractionDigits = 6, minimumFractionDigits = 0) {
  const numeric = Number.parseFloat(String(value ?? "0"));

  if (!Number.isFinite(numeric)) {
    return "0";
  }

  return numeric.toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

function formatRate(value) {
  return formatAmount(value, 8, 0);
}

function formatPercentFromBps(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0%";
  }

  const percentage = numeric / 100;
  const hasFraction = percentage % 1 !== 0;
  return `${percentage.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}%`;
}

function formatBalanceLabel(wallet) {
  return formatAmount(wallet?.availableBalance || wallet?.balance || "0");
}

function formatQuoteRemaining(expiresAt) {
  if (!expiresAt) {
    return "";
  }

  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  const remainingSeconds = Math.max(Math.floor(remainingMs / 1000), 0);

  if (remainingSeconds <= 0) {
    return "Expired";
  }

  return `Valid for ${remainingSeconds}s`;
}

function truncateMiddle(value, start = 8, end = 6) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "Unavailable";
  }

  if (normalized.length <= start + end + 3) {
    return normalized;
  }

  return `${normalized.slice(0, start)}...${normalized.slice(-end)}`;
}

function waitForMinimumDelay(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function getSwapTrackingId(swap = {}) {
  return String(swap?.conversionId || swap?.swapId || swap?.quoteId || "").trim();
}

function resolveWalletAssetSymbol(asset) {
  return normalizeAssetSymbol(
    asset?.asset ||
      asset?.symbol ||
      asset?.wallet?.asset ||
      asset?.chainMeta?.symbol ||
      "",
  );
}

function isNativeWalletOption(asset) {
  if (!asset?.walletId) {
    return false;
  }

  if (normalizeCode(asset?.assetType) === "token") {
    return false;
  }

  const chainSymbol = normalizeAssetSymbol(asset?.chainMeta?.symbol || asset?.wallet?.chainMeta?.symbol || "");
  const assetSymbol = resolveWalletAssetSymbol(asset);

  if (!assetSymbol) {
    return false;
  }

  return !chainSymbol || assetSymbol === chainSymbol;
}

function buildWalletEndpoint(asset) {
  return {
    chain: normalizeCode(asset?.chain || asset?.wallet?.chain),
    network: normalizeCode(asset?.network || asset?.wallet?.network),
    asset: resolveWalletAssetSymbol(asset),
  };
}

function getStatusPresentation(status = "") {
  const normalizedStatus = normalizeCode(status);

  switch (normalizedStatus) {
    case "previewed":
      return {
        title: "Review Ready",
        message: "Quote created. Review the live fees and confirm to start the swap.",
        tone: "indigo",
      };
    case "awaiting_source_submission":
      return {
        title: "Submitting Source Transfer",
        message: "We are sending your source asset into the treasury-routed swap flow.",
        tone: "blue",
      };
    case "awaiting_source_confirmation":
      return {
        title: "Waiting For Source Confirmation",
        message: "Your source transfer is on-chain and must confirm before payout can begin.",
        tone: "amber",
      };
    case "source_received":
    case "ready_for_payout":
      return {
        title: "Preparing Payout",
        message: "Source confirmation is complete. The backend is checking payout liquidity and fees.",
        tone: "amber",
      };
    case "payout_submitted":
      return {
        title: "Payout Submitted",
        message: "The destination payout is on-chain and awaiting final confirmation.",
        tone: "blue",
      };
    case "completed":
      return {
        title: "Swap Completed",
        message: "Your destination payout has been sent successfully.",
        tone: "emerald",
      };
    case "manual_review":
      return {
        title: "Manual Review Needed",
        message: "The swap needs operator review before it can be finished safely.",
        tone: "amber",
      };
    case "failed":
    case "payout_failed":
      return {
        title: "Swap Failed",
        message: "The swap could not be completed. Our team will review it for refund or retry.",
        tone: "rose",
      };
    case "expired":
      return {
        title: "Quote Expired",
        message: "This quote is no longer valid. Refresh the amount to request a new preview.",
        tone: "rose",
      };
    default:
      return {
        title: "Swap Update",
        message: "The backend is processing the latest swap state.",
        tone: "slate",
      };
  }
}

function getToneClasses(tone = "slate") {
  switch (tone) {
    case "emerald":
      return {
        badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
        icon: "text-emerald-400",
      };
    case "rose":
      return {
        badge: "bg-rose-500/10 text-rose-300 border-rose-500/20",
        icon: "text-rose-400",
      };
    case "amber":
      return {
        badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        icon: "text-amber-400",
      };
    case "blue":
    case "indigo":
      return {
        badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
        icon: "text-indigo-400",
      };
    default:
      return {
        badge: "bg-slate-800/80 text-slate-300 border-slate-700",
        icon: "text-slate-300",
      };
  }
}

function buildExplorerUrl(supportedChains, chain, network, txHash) {
  if (!txHash) {
    return "";
  }

  const chainMeta = getChainMeta(chain, supportedChains);
  return buildExplorerTransactionUrl(chainMeta, network, txHash);
}

function renderWalletAvatar(wallet) {
  if (wallet?.iconUrl) {
    return (
      <img
        src={wallet.iconUrl}
        alt={wallet.symbol || wallet.asset || "Asset"}
        className="w-6 h-6 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="w-6 h-6 bg-slate-950 rounded-full flex items-center justify-center font-bold text-[10px]">
      {(wallet?.symbol || wallet?.asset || "A").charAt(0)}
    </div>
  );
}

function WalletPickerModal({
  open,
  mode,
  options,
  selectedId,
  onSelect,
  onClose,
}) {
  if (!open) {
    return null;
  }

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative z-[101] w-full max-w-[340px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-5">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">
              {mode === "from" ? "Select Source Wallet" : "Select Destination Wallet"}
            </h3>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-300 transition-colors hover:text-white"
            >
              X
            </button>
          </div>

          <div className="custom-scrollbar max-h-[60vh] overflow-y-auto p-4">
            <div className="space-y-2">
              {options.map((wallet) => {
                const isActive = selectedId === wallet.id;
                return (
                  <motion.button
                    key={wallet.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onSelect(wallet);
                      onClose();
                    }}
                    className={`w-full rounded-3xl border p-4 text-left transition-all ${
                      isActive
                        ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                        : "border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative flex-shrink-0">
                          {wallet.iconUrl ? (
                            <img
                              src={wallet.iconUrl}
                              alt=""
                              className="h-10 w-10 rounded-full border border-white/10 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-sm font-bold text-slate-300">
                              {(wallet.symbol || wallet.asset || "A").charAt(0)}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className={`truncate text-sm font-black uppercase tracking-tight ${
                            isActive ? "text-indigo-400" : "text-slate-200"
                          }`}>
                            {wallet.symbol || wallet.asset}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {wallet.chainName || wallet.chainMeta?.name || wallet.chain} {" - "} {wallet.networkLabel || wallet.network}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black text-white">
                          {formatBalanceLabel(wallet)}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Available
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ReviewModal({
  open,
  preview,
  onClose,
  onConfirm,
  isExecuting,
}) {
  if (!open || !preview) {
    return null;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={isExecuting ? undefined : onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative z-[101] w-full max-w-[360px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-950 shadow-2xl"
        >
          <div className="border-b border-white/5 bg-white/5 px-6 py-5">
            <h3 className="text-lg font-black text-white">Review Swap</h3>
            <p className="mt-1 text-sm text-slate-400">
              Confirm the backend quote before the source transfer is submitted.
            </p>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-400">From</span>
                <span className="font-black text-white">
                  {preview.from.amount} {preview.from.symbol}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-400">To</span>
                <span className="font-black text-white">
                  {preview.to.estimatedReceiveAmount} {preview.to.symbol}
                </span>
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Rate</span>
                <span className="font-bold text-white">
                  1 {preview.from.symbol} = {formatRate(preview.pricing.exchangeRate)} {preview.to.symbol}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Gross Destination</span>
                <span className="font-bold text-white">
                  {preview.to.grossDestinationAmount} {preview.to.symbol}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Source Network Fee</span>
                <span className="font-bold text-white">
                  {preview.from.sourceNetworkFee} {preview.from.symbol}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">System Fee</span>
                <span className="font-bold text-white">
                  {preview.to.systemFeeAmount} {preview.to.symbol} ({formatPercentFromBps(preview.pricing.systemFeeBps)})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Payout Network Fee</span>
                <span className="font-bold text-white">
                  {preview.to.payoutNetworkFeeEstimate} {preview.to.symbol}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-3 text-sm">
                <span className="font-bold text-slate-300">Estimated Receive</span>
                <span className="font-black text-emerald-400">
                  {preview.to.estimatedReceiveAmount} {preview.to.symbol}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Quote Expiry</span>
                <span className="font-bold text-indigo-300">{formatQuoteRemaining(preview.expiresAt)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onClose}
                disabled={isExecuting}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 py-4 text-sm font-bold text-slate-300 transition-all hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isExecuting}
                className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white transition-all hover:bg-indigo-500 disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Submitting</span>
                  </>
                ) : (
                  <span>Confirm Swap</span>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ProcessingModal({
  open,
  swap,
  onClose,
}) {
  if (!open || !swap) {
    return null;
  }

  const presentation = getStatusPresentation(swap.status);
  const toneClasses = getToneClasses(presentation.tone);
  const normalizedStatus = normalizeCode(swap.status);
  const StatusIcon =
    normalizedStatus === "completed"
      ? CheckCircle2
      : normalizedStatus === "failed" || normalizedStatus === "expired"
      ? XCircle
      : Clock3;
  const sourceLabel = `${swap.from?.amount || "0"} ${swap.from?.symbol || ""}`.trim();
  const destinationLabel = `${
    swap.to?.finalReceiveAmount || swap.to?.estimatedReceiveAmount || "0"
  } ${swap.to?.symbol || ""}`.trim();
  const title = isFinalStatus(normalizedStatus)
    ? presentation.title
    : "Swap is processing";

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-[120] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
        />
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 24 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 24 }}
          transition={{ type: "spring", damping: 24, stiffness: 280 }}
          className="relative z-[121] w-full max-w-[360px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-950 shadow-2xl"
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-300 transition-colors hover:text-white"
            aria-label="Close processing status"
          >
            <X size={16} />
          </button>

          <div className="px-6 pb-6 pt-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-indigo-500/20 bg-indigo-500/10">
              {isFinalStatus(normalizedStatus) ? (
                <StatusIcon size={30} className={toneClasses.icon} />
              ) : (
                <RefreshCw size={30} className="animate-spin text-indigo-300" />
              )}
            </div>

            <div className={`mx-auto mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClasses.badge}`}>
              <StatusIcon size={13} />
              <span>{String(swap.status || "processing").replace(/_/g, " ")}</span>
            </div>

            <h3 className="text-2xl font-black tracking-tight text-white">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {swap.failureReason || presentation.message}
            </p>

            <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-4 text-left">
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-slate-400">You pay</span>
                <span className="font-black text-white">{sourceLabel}</span>
              </div>
              <div className="mt-3 flex justify-between gap-4 text-sm">
                <span className="text-slate-400">
                  {normalizedStatus === "completed" ? "You received" : "Estimated receive"}
                </span>
                <span className="font-black text-emerald-400">{destinationLabel}</span>
              </div>
              <div className="mt-3 flex justify-between gap-4 text-sm">
                <span className="text-slate-400">Swap ID</span>
                <span className="font-mono text-xs font-bold text-slate-300">
                  {truncateMiddle(swap.swapId, 10, 8)}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="mt-6 w-full rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 active:scale-[0.98]"
            >
              View on Home
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export function Swap() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const assetContextId = state?.assetContextId;
  const {
    visibleAssets,
    supportedChains,
    getSwapPairs,
    previewSwap,
    reviewSwap,
    executeSwap,
    getSwapById,
    refreshApp,
    showTransactionStatus,
    updateTransactionStatus,
    hasDismissedSwapSubmitted,
    markSwapSubmittedDismissed,
  } = useAppContext();

  const [pairsState, setPairsState] = useState({
    loading: true,
    enabled: false,
    pairs: [],
    error: "",
    diagnostics: null,
  });
  const [pickerMode, setPickerMode] = useState("");
  const [sourceWalletId, setSourceWalletId] = useState("");
  const [destinationWalletId, setDestinationWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reviewValidating, setReviewValidating] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [activeSwap, setActiveSwap] = useState(null);
  const [activeSubmittedSwapKey, setActiveSubmittedSwapKey] = useState("");
  const [executing, setExecuting] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [quoteTick, setQuoteTick] = useState(Date.now());

  const previewRequestRef = useRef(0);
  const pollInFlightRef = useRef(false);
  const hasRefreshedFinalStateRef = useRef("");
  const executeRequestRef = useRef({ pending: false, swapId: "" });
  const activeSubmittedSwapKeyRef = useRef("");

  const rawWalletOptions = useMemo(
    () =>
      (Array.isArray(visibleAssets) ? visibleAssets : [])
        .filter(isNativeWalletOption)
        .sort((left, right) => {
          const rightValue = Number.parseFloat(right?.fiatValue || right?.usdValue || 0) || 0;
          const leftValue = Number.parseFloat(left?.fiatValue || left?.usdValue || 0) || 0;

          return rightValue - leftValue;
        }),
    [visibleAssets],
  );

  const walletOptions = useMemo(
    () =>
      rawWalletOptions.map((wallet) => ({
        ...wallet,
        id: String(wallet.id || wallet.walletId),
        endpointKey: buildEndpointKey(buildWalletEndpoint(wallet)),
      })),
    [rawWalletOptions],
  );

  const walletOptionsById = useMemo(
    () => new Map(walletOptions.map((wallet) => [wallet.id, wallet])),
    [walletOptions],
  );

  const sourceWalletOptions = walletOptions;

  const selectedSourceWallet = sourceWalletId ? walletOptionsById.get(sourceWalletId) || null : null;

  const selectedDestinationWallet = destinationWalletId
    ? walletOptionsById.get(destinationWalletId) || null
    : null;
  const sameAssetSelected =
    Boolean(selectedSourceWallet && selectedDestinationWallet) &&
    normalizeAssetSymbol(selectedSourceWallet?.symbol || selectedSourceWallet?.asset) ===
      normalizeAssetSymbol(selectedDestinationWallet?.symbol || selectedDestinationWallet?.asset);

  const destinationWalletOptions = useMemo(() => {
    if (!selectedSourceWallet?.id) {
      return walletOptions;
    }

    const sourceAsset = normalizeAssetSymbol(
      selectedSourceWallet?.symbol || selectedSourceWallet?.asset,
    );

    return walletOptions.filter(
      (wallet) => normalizeAssetSymbol(wallet?.symbol || wallet?.asset) !== sourceAsset,
    );
  }, [selectedSourceWallet, walletOptions]);

  const swapLocked = Boolean(activeSwap);
  const displaySwap = activeSwap || preview;
  const quoteExpired =
  Boolean(preview?.expiresAt) && new Date(preview.expiresAt).getTime() <= quoteTick;
const statusPresentation = getStatusPresentation(activeSwap?.status || preview?.status || "");
const toneClasses = getToneClasses(statusPresentation.tone);
const hasValidAmount = isPositiveAmountInput(amount);
const formValidationMessage = !selectedSourceWallet
  ? "Select a source wallet to start the swap."
  : !selectedDestinationWallet
    ? "Select a destination wallet to receive the swapped asset."
    : sameAssetSelected
      ? "Source and destination assets must be different."
      : amount.trim() && !hasValidAmount
        ? "Enter a valid positive amount with up to 18 decimals."
      : "";
const showValidationMessage =
  !activeSwap && Boolean(formValidationMessage) && Boolean(sourceWalletId || destinationWalletId);
const canRequestPreview =
  Boolean(selectedSourceWallet?.id) &&
  Boolean(selectedDestinationWallet?.id) &&
  hasValidAmount &&
  !sameAssetSelected &&
  !swapLocked;

  useEffect(() => {
    let isMounted = true;

    async function loadPairs() {
      setPairsState((current) => ({
        ...current,
        loading: true,
        error: "",
      }));

      try {
        const result = await getSwapPairs();

        if (!isMounted) {
          return;
        }

        setPairsState({
          loading: false,
          enabled: Boolean(result.enabled),
          pairs: Array.isArray(result.pairs) ? result.pairs : [],
          error: "",
          diagnostics: result.diagnostics || null,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setPairsState({
          loading: false,
          enabled: false,
          pairs: [],
          error: getErrorMessage(error, "Failed to load supported swap routes"),
          diagnostics: null,
        });
      }
    }

    loadPairs();

    return () => {
      isMounted = false;
    };
  }, [getSwapPairs]);

  useEffect(() => {
    if (!sourceWalletOptions.length) {
      if (sourceWalletId) {
        setSourceWalletId("");
      }

      return;
    }

    const stillValid = sourceWalletOptions.some((wallet) => wallet.id === sourceWalletId);
    if (stillValid) {
      return;
    }

    const preferredWallet =
      sourceWalletOptions.find(
        (wallet) => wallet.id === assetContextId || wallet.walletId === assetContextId,
      ) || sourceWalletOptions[0];

    setSourceWalletId(preferredWallet.id);
  }, [assetContextId, sourceWalletId, sourceWalletOptions]);

  useEffect(() => {
    if (!destinationWalletOptions.length) {
      if (destinationWalletId) {
        setDestinationWalletId("");
      }

      return;
    }

    const stillValid = destinationWalletOptions.some((wallet) => wallet.id === destinationWalletId);
    if (stillValid) {
      return;
    }

    setDestinationWalletId(destinationWalletOptions[0].id);
  }, [destinationWalletId, destinationWalletOptions]);

  useEffect(() => {
    activeSubmittedSwapKeyRef.current = activeSubmittedSwapKey;
  }, [activeSubmittedSwapKey]);

  useEffect(() => {
    setPreview(null);
    setPreviewLoading(false);
    setReviewValidating(false);
    setPreviewError("");
    setReviewOpen(false);
    previewRequestRef.current += 1;
    setStatusError("");
  }, [sourceWalletId, destinationWalletId, amount]);

  useEffect(() => {
    if (!preview?.expiresAt || activeSwap) {
      return undefined;
    }

    setQuoteTick(Date.now());
    const intervalId = window.setInterval(() => {
      setQuoteTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeSwap, preview?.expiresAt]);

  useEffect(() => {
    if (!canRequestPreview) {
      setPreviewLoading(false);
      return undefined;
    }

    let isActive = true;
    const normalizedAmount = amount.trim();
    const currentRequestId = previewRequestRef.current + 1;
    previewRequestRef.current = currentRequestId;

    const timeoutId = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");

      try {
        const response = await previewSwap({
          fromWalletId: selectedSourceWallet.id,
          toWalletId: selectedDestinationWallet.id,
          amount: normalizedAmount,
        });

        if (!isActive || previewRequestRef.current !== currentRequestId) {
          return;
        }

        setPreview(response);
        setStatusError("");
      } catch (error) {
        if (!isActive || previewRequestRef.current !== currentRequestId) {
          return;
        }

        setPreview(null);
        setPreviewError(getErrorMessage(error, "Failed to preview swap"));
      } finally {
        if (isActive && previewRequestRef.current === currentRequestId) {
          setPreviewLoading(false);
        }
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [
    amount,
    canRequestPreview,
    previewSwap,
    selectedDestinationWallet,
    selectedSourceWallet,
  ]);

  useEffect(() => {
    if (!activeSwap?.swapId || !isPollingStatus(activeSwap.status)) {
      return undefined;
    }

    let isMounted = true;

    const intervalId = window.setInterval(async () => {
      if (pollInFlightRef.current) {
        return;
      }

      pollInFlightRef.current = true;

      try {
        const response = await getSwapById(activeSwap.swapId);
        if (isMounted) {
          setActiveSwap(response);
          setStatusError("");
          if (
            activeSubmittedSwapKeyRef.current &&
            activeSubmittedSwapKeyRef.current === getSwapTrackingId(response)
          ) {
            showSwapStatusModal(response, { replace: true });
          }
        }
      } catch (error) {
        if (isMounted) {
          setStatusError(getErrorMessage(error, "Failed to refresh swap status"));
        }
      } finally {
        pollInFlightRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [activeSwap?.status, activeSwap?.swapId, getSwapById]);

  useEffect(() => {
    if (!activeSwap?.swapId || !isFinalStatus(activeSwap.status)) {
      return;
    }

    const refreshKey = `${activeSwap.swapId}:${activeSwap.status}`;
    if (hasRefreshedFinalStateRef.current === refreshKey) {
      return;
    }

    hasRefreshedFinalStateRef.current = refreshKey;
    refreshApp().catch(() => null);
  }, [activeSwap?.status, activeSwap?.swapId, refreshApp]);

  const estimatedReceiveDisplay =
    displaySwap?.to?.finalReceiveAmount ||
    displaySwap?.finalReceiveAmount ||
    displaySwap?.to?.estimatedReceiveAmount ||
    "0";
  const sourceExplorerUrl = buildExplorerUrl(
    supportedChains,
    activeSwap?.from?.chain,
    activeSwap?.from?.network,
    activeSwap?.from?.sourceTransaction?.txHash,
  );
  const payoutExplorerUrl = buildExplorerUrl(
    supportedChains,
    activeSwap?.to?.chain,
    activeSwap?.to?.network,
    activeSwap?.to?.payoutTransaction?.txHash,
  );

  const dismissActiveSubmittedSwap = (swapKey = "") => {
    const normalizedKey = String(
      swapKey || activeSubmittedSwapKeyRef.current || "",
    ).trim();

    if (normalizedKey) {
      markSwapSubmittedDismissed(normalizedKey);
    }

    activeSubmittedSwapKeyRef.current = "";
    setActiveSubmittedSwapKey("");
  };

  const handleStatusClose = () => {
    dismissActiveSubmittedSwap();
    setReviewOpen(false);
    setActiveSwap(null);
    void refreshApp().catch(() => null);
    navigate("/app/home", { replace: true });
  };

  const showSwapStatusModal = (swapRecord, overrides = {}) => {
    if (!swapRecord) {
      return;
    }

    const swapTrackingId = getSwapTrackingId(swapRecord);
    if (
      swapTrackingId &&
      hasDismissedSwapSubmitted(swapTrackingId)
    ) {
      return;
    }

    const normalizedStatus = normalizeCode(swapRecord.status);
    const presentation = getStatusPresentation(normalizedStatus);
    const isPendingState =
      Boolean(normalizedStatus) &&
      !isFinalStatus(normalizedStatus) &&
      normalizedStatus !== "previewed";

    const basePayload = {
      variant: isPendingState
        ? "pending"
        : normalizedStatus === "completed"
          ? "success"
          : "failed",
      pending: isPendingState,
      success: normalizedStatus === "completed",
      title:
        overrides.title ||
        (isPendingState ? "Swap Submitted" : presentation.title),
      message:
        overrides.message ||
        swapRecord.failureReason ||
        presentation.message,
      amount:
        swapRecord?.to?.finalReceiveAmount ||
        swapRecord?.finalReceiveAmount ||
        swapRecord?.to?.estimatedReceiveAmount ||
        "",
      asset: {
        symbol: swapRecord?.to?.symbol || swapRecord?.to?.asset || "",
      },
      recipientName: `Swap ${swapRecord?.from?.symbol || ""} -> ${swapRecord?.to?.symbol || ""}`.trim(),
      recipientAddress: swapRecord.swapId || "",
      timestamp: swapRecord.updatedAt || swapRecord.createdAt || "",
      primaryLabel: "View on Home",
      hideSecondaryAction: true,
      swapTrackingId,
      onClose: () => handleStatusClose(),
      ...overrides,
    };

    if (overrides.replace === true) {
      const updatedStatus = updateTransactionStatus(basePayload);
      if (!updatedStatus) {
        showTransactionStatus(basePayload);
      }
      return;
    }

    showTransactionStatus(basePayload);
  };

  const handleReset = () => {
    setAmount("");
    setPreview(null);
    setPreviewError("");
    setReviewOpen(false);
    setActiveSwap(null);
    setActiveSubmittedSwapKey("");
    setReviewValidating(false);
    setExecuting(false);
    setStatusError("");
    setPickerMode("");
    previewRequestRef.current += 1;
    executeRequestRef.current = { pending: false, swapId: "" };
    hasRefreshedFinalStateRef.current = "";
    activeSubmittedSwapKeyRef.current = "";
    setQuoteTick(Date.now());
  };

  const handleSwapDirection = () => {
    if (!selectedSourceWallet || !selectedDestinationWallet || swapLocked) {
      return;
    }

    const reverseSameAsset =
      normalizeAssetSymbol(selectedDestinationWallet?.symbol || selectedDestinationWallet?.asset) ===
      normalizeAssetSymbol(selectedSourceWallet?.symbol || selectedSourceWallet?.asset);

    if (reverseSameAsset) {
      toast.error("Source and destination assets must be different");
      return;
    }

    setSourceWalletId(selectedDestinationWallet.id);
    setDestinationWalletId(selectedSourceWallet.id);
  };

  const handleReview = async () => {
    if (
      !preview?.swapId ||
      reviewValidating ||
      previewLoading ||
      executing ||
      activeSwap
    ) {
      return;
    }

    if (quoteExpired) {
      setPreview(null);
      setPreviewError("Swap quote expired. Enter the amount again to refresh the preview.");
      setStatusError("Swap quote expired. Enter the amount again to refresh the preview.");
      return;
    }

    setReviewValidating(true);
    setPreviewError("");
    setStatusError("");

    try {
      const reviewedSwap = await reviewSwap({
        swapId: preview.swapId,
      });

      setPreview(reviewedSwap);
      setReviewOpen(true);
    } catch (error) {
      const message = getErrorMessage(error, "Failed to validate swap");
      setStatusError(message);
      toast.error(message);
    } finally {
      setReviewValidating(false);
    }
  };

  const handleExecute = async () => {
    if (!preview?.swapId || executing || previewLoading || activeSwap) {
      return;
    }

    if (
      executeRequestRef.current.pending &&
      executeRequestRef.current.swapId === preview.swapId
    ) {
      return;
    }

    if (quoteExpired) {
      setReviewOpen(false);
      setPreview(null);
      setPreviewError("Swap quote expired. Enter the amount again to refresh the preview.");
      return;
    }

    const previewSnapshot = preview;
    const minimumDelay = waitForMinimumDelay(MIN_CONFIRM_LOADING_MS);

    executeRequestRef.current = { pending: true, swapId: preview.swapId };
    setExecuting(true);
    setStatusError("");

    try {
      const response = await executeSwap({
        swapId: previewSnapshot.swapId,
      });
      await minimumDelay;
      const normalizedStatus = normalizeCode(response.status);

      if (normalizedStatus === "previewed") {
        setPreview(response);
        setActiveSwap(null);
        setActiveSubmittedSwapKey("");
        toast.error("Swap execution did not start. Please review the quote again.");
      } else {
        const submittedSwapKey = getSwapTrackingId(response);
        setActiveSwap(response);
        setPreview(null);
        setReviewOpen(false);
        setActiveSubmittedSwapKey(submittedSwapKey);
        showSwapStatusModal(response, { replace: true });
      }

      if (normalizedStatus === "completed") {
        toast.success("Swap completed");
      } else if (
        normalizedStatus === "failed" ||
        normalizedStatus === "payout_failed" ||
        normalizedStatus === "expired"
      ) {
        toast.error(response.failureReason || "Swap could not be completed");
      } else if (normalizedStatus === "manual_review") {
        toast.error(response.failureReason || "Swap moved to manual review");
      } else if (normalizedStatus === "previewed") {
        toast.error(response.failureReason || "Swap execution did not start");
      } else {
        toast.success("Swap started. Track it from Home or History.");
      }

      if (isAcceptedSwapStatus(normalizedStatus)) {
        void refreshApp().catch(() => null);
      }
    } catch (error) {
      const message = getErrorMessage(error, "Failed to execute swap");
      let latestSwap = null;

      if (previewSnapshot?.swapId) {
        try {
          latestSwap = await getSwapById(previewSnapshot.swapId);
        } catch {
          latestSwap = null;
        }
      }

      await minimumDelay;

      if (latestSwap?.swapId) {
        const latestStatus = normalizeCode(latestSwap.status);

        if (latestStatus === "previewed") {
          setPreview(latestSwap);
          setActiveSwap(null);
          setActiveSubmittedSwapKey("");
        } else {
          const submittedSwapKey = getSwapTrackingId(latestSwap);
          setActiveSwap(latestSwap);
          setPreview(null);
          setReviewOpen(false);
          setActiveSubmittedSwapKey(submittedSwapKey);
          showSwapStatusModal(latestSwap, { replace: true });
        }

        if (isAcceptedSwapStatus(latestStatus)) {
          setStatusError("");
          toast.success("Swap started. Track it from Home or History.");
          void refreshApp().catch(() => null);
        } else {
          setStatusError(latestSwap.failureReason || message);
          toast.error(latestSwap.failureReason || message);
        }
      } else {
        setStatusError(message);
        toast.error(message);
      }
    } finally {
      executeRequestRef.current = { pending: false, swapId: "" };
      setExecuting(false);
    }
  };

  if (pairsState.loading) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="aura-container"
      >
        <section className="swap-header-section sticky top-0 z-50">
          <div className="swap-header-inner aura-header">
            <button onClick={() => navigate(-1)} className="aura-header-button group">
              <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-0.5" />
            </button>
            <h1 className="aura-header-title">Swap</h1>
            <div className="w-10" />
          </div>
        </section>

        <div className="flex flex-1 items-center justify-center px-6">
          <div className="flex items-center gap-3 rounded-3xl border border-slate-800 bg-slate-900 px-5 py-4 text-slate-300">
            <RefreshCw size={18} className="animate-spin text-indigo-400" />
            <span className="text-sm font-bold">Loading supported swap routes...</span>
          </div>
        </div>
      </motion.div>
    );
  }

  const showEmptyState =
    Boolean(pairsState.error) ||
    !pairsState.enabled ||
    !sourceWalletOptions.length;
  const primaryAvailabilityWarning =
    pairsState.diagnostics?.emptyReasons?.[0] ||
    pairsState.diagnostics?.configWarnings?.[0] ||
    "";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="aura-container"
    >
      <section className="swap-header-section sticky top-0 z-50">
        <div className="swap-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-0.5" />
          </button>
          <h1 className="aura-header-title">Swap</h1>
          <button disabled className="aura-header-button opacity-40">
            <Settings2 size={20} />
          </button>
        </div>
      </section>

      <div className="relative mt-6 flex flex-1 flex-col space-y-6 px-5">
        {showEmptyState ? (
          <section className="flex flex-1 items-center">
            <div className="w-full rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-lg">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-indigo-400">
                <ArrowDownUp size={24} />
              </div>
              <h2 className="text-xl font-black text-white">
                {pairsState.error
                  ? "Swap is unavailable right now"
                  : !pairsState.enabled
                    ? "Swap is currently disabled"
                    : !sourceWalletOptions.length
                      ? "No supported swap wallets"
                      : "No eligible wallets found"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {pairsState.error ||
                  (!pairsState.enabled
                    ? "The backend reported that swap support is turned off for this environment."
                    : !sourceWalletOptions.length
                      ? "Create or import a supported native wallet to get started. Pricing and route checks happen when you preview a swap."
                      : "Create or fund a supported source and destination wallet to get started.")}
              </p>
              {primaryAvailabilityWarning ? (
                <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
                    {primaryAvailabilityWarning}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <>
            {previewError ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">
                  {previewError}
                </p>
              </div>
            ) : null}

            {!previewError && showValidationMessage ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
                  {formValidationMessage}
                </p>
              </div>
            ) : null}

            {statusError ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                  {statusError}
                </p>
              </div>
            ) : null}

            <section className="swap-interface-section">
              <div className="swap-interface-inner relative space-y-2 group">
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg transition-colors hover:border-slate-700">
                  <div className="mb-4 flex justify-between text-sm">
                    <span className="font-bold uppercase tracking-wider text-slate-400">You Pay</span>
                    <span className="font-medium text-slate-500">
                      Balance: {formatBalanceLabel(selectedSourceWallet)} {selectedSourceWallet?.symbol}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => setPickerMode("from")}
                      disabled={swapLocked}
                      className="flex items-center space-x-2 rounded-2xl bg-slate-800 px-4 py-2.5 shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-60"
                    >
                      {renderWalletAvatar(selectedSourceWallet)}
                      <div className="text-left">
                        <span className="block font-bold">{selectedSourceWallet?.symbol}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {selectedSourceWallet?.networkLabel || selectedSourceWallet?.network}
                        </span>
                      </div>
                      <ChevronDown size={16} className="text-slate-400" />
                    </button>

                    <input
                      type="text"
                      inputMode="decimal"
                      maxLength={MAX_SWAP_AMOUNT_INPUT_LENGTH}
                      placeholder="0"
                      value={amount}
                      disabled={swapLocked}
                      onChange={(event) => {
                        const nextValue = sanitizeSwapAmountInput(event.target.value);
                        if (nextValue === null) {
                          return;
                        }

                        setAmount(nextValue);
                      }}
                      className="w-full flex-1 bg-transparent text-right text-3xl font-extrabold text-white placeholder:text-slate-700 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500"
                    />
                  </div>

                </div>

                <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 pt-2">
                  <motion.button
                    whileHover={{ scale: swapLocked ? 1 : 1.1, rotate: swapLocked ? 0 : 180 }}
                    whileTap={{ scale: swapLocked ? 1 : 0.9 }}
                    onClick={handleSwapDirection}
                    disabled={swapLocked}
                    className="rounded-full border-[6px] border-slate-950 bg-indigo-600 p-3 text-white shadow-xl shadow-indigo-600/30 transition-transform disabled:opacity-50"
                  >
                    <ArrowDownUp size={20} strokeWidth={2.5} />
                  </motion.button>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg transition-colors hover:border-slate-700">
                  <div className="mb-4 flex justify-between text-sm">
                    <span className="font-bold uppercase tracking-wider text-slate-400">You Receive</span>
                    <span className="font-medium text-slate-500">
                      Balance: {formatBalanceLabel(selectedDestinationWallet)} {selectedDestinationWallet?.symbol}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => setPickerMode("to")}
                      disabled={swapLocked || !destinationWalletOptions.length}
                      className="flex items-center space-x-2 rounded-2xl bg-slate-800 px-4 py-2.5 shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-60"
                    >
                      {renderWalletAvatar(selectedDestinationWallet)}
                      <div className="text-left">
                        <span className="block font-bold">{selectedDestinationWallet?.symbol || "--"}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {selectedDestinationWallet?.networkLabel || selectedDestinationWallet?.network || "Select"}
                        </span>
                      </div>
                      <ChevronDown size={16} className="text-slate-400" />
                    </button>

                    <div className="flex-1 overflow-hidden text-ellipsis text-right text-3xl font-extrabold text-slate-500">
                      {formatAmount(estimatedReceiveDisplay, 8, 0)}
                    </div>
                  </div>

                  {!destinationWalletOptions.length && selectedSourceWallet ? (
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
                      Add or select a wallet with a different asset to continue.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {(displaySwap || previewLoading || amount.trim()) && (
              <section className="swap-details-section">
                <div className="swap-details-inner">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg"
                  >
                    {previewLoading && !displaySwap ? (
                      <div className="flex items-center gap-3 text-sm text-slate-300">
                        <RefreshCw size={16} className="animate-spin text-indigo-400" />
                        <span className="font-bold">Fetching live quote...</span>
                      </div>
                    ) : null}

                    {displaySwap ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-400">Rate</span>
                          <span className="font-bold text-white">
                            1 {displaySwap.from.symbol} = {formatRate(displaySwap.pricing.exchangeRate)} {displaySwap.to.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-400">Source Network Fee</span>
                          <span className="font-bold text-white">
                            {displaySwap.from.sourceNetworkFee} {displaySwap.from.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-400">System Fee</span>
                          <span className="font-bold text-white">
                            {displaySwap.to.systemFeeAmount} {displaySwap.to.symbol}
                            {displaySwap.pricing.systemFeeBps
                              ? ` (${formatPercentFromBps(displaySwap.pricing.systemFeeBps)})`
                              : ""}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-400">Payout Network Fee</span>
                          <span className="font-bold text-white">
                            {(displaySwap.to.payoutNetworkFee || displaySwap.to.payoutNetworkFeeEstimate)} {displaySwap.to.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-400">Estimated Receive</span>
                          <span className="font-bold text-emerald-400">
                            {estimatedReceiveDisplay} {displaySwap.to.symbol}
                          </span>
                        </div>
                        {!activeSwap ? (
                          <div className="flex justify-between text-sm">
                            <span className="font-medium text-slate-400">Quote Expiry</span>
                            <span className={`font-bold ${quoteExpired ? "text-rose-300" : "text-indigo-300"}`}>
                              {formatQuoteRemaining(displaySwap.expiresAt)}
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </motion.div>
                </div>
              </section>
            )}

            {activeSwap ? (
              <section className="swap-status-section">
                <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${toneClasses.badge}`}>
                    {activeSwap.status === "completed" ? (
                      <CheckCircle2 size={14} className={toneClasses.icon} />
                    ) : activeSwap.status === "failed" || activeSwap.status === "expired" ? (
                      <XCircle size={14} className={toneClasses.icon} />
                    ) : (
                      <Clock3 size={14} className={toneClasses.icon} />
                    )}
                    <span>{statusPresentation.title}</span>
                  </div>

                  <div>
                    <h2 className="text-xl font-black text-white">{statusPresentation.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      {activeSwap.failureReason || statusPresentation.message}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Swap ID</span>
                      <span className="font-bold text-white">
                        {truncateMiddle(activeSwap.swapId, 10, 8)}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-between text-sm">
                      <span className="text-slate-400">Current Status</span>
                      <span className="font-bold text-white">{activeSwap.status}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">You sent</span>
                      <span className="font-bold text-white">
                        {activeSwap.from.amount} {activeSwap.from.symbol}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-between text-sm">
                      <span className="text-slate-400">
                        {activeSwap.status === "completed" ? "You received" : "Estimated receive"}
                      </span>
                      <span className="font-bold text-emerald-400">
                        {activeSwap.to.finalReceiveAmount || activeSwap.to.estimatedReceiveAmount} {activeSwap.to.symbol}
                      </span>
                    </div>
                    {activeSwap.failureCode ? (
                      <div className="mt-3 flex justify-between text-sm">
                        <span className="text-slate-400">Failure Code</span>
                        <span className="font-bold text-amber-300">{activeSwap.failureCode}</span>
                      </div>
                    ) : null}
                  </div>

                  {activeSwap.from.sourceTransaction?.txHash ? (
                    <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                            Source Transfer
                          </p>
                          <p className="mt-1 text-sm font-bold text-white">
                            {truncateMiddle(activeSwap.from.sourceTransaction.txHash)}
                          </p>
                          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                            {activeSwap.from.sourceTransaction.status || "pending"}
                            {activeSwap.from.sourceTransaction.chainStatus
                              ? ` • ${activeSwap.from.sourceTransaction.chainStatus}`
                              : ""}
                          </p>
                        </div>
                        {sourceExplorerUrl ? (
                          <button
                            onClick={() => window.open(sourceExplorerUrl, "_blank", "noopener,noreferrer")}
                            className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-indigo-300"
                          >
                            <ExternalLink size={14} />
                            <span>Explorer</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {activeSwap.to.payoutTransaction?.txHash ? (
                    <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                            Destination Payout
                          </p>
                          <p className="mt-1 text-sm font-bold text-white">
                            {truncateMiddle(activeSwap.to.payoutTransaction.txHash)}
                          </p>
                          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                            {activeSwap.to.payoutTransaction.status || "pending"}
                            {activeSwap.to.payoutTransaction.chainStatus
                              ? ` • ${activeSwap.to.payoutTransaction.chainStatus}`
                              : ""}
                          </p>
                        </div>
                        {payoutExplorerUrl ? (
                          <button
                            onClick={() => window.open(payoutExplorerUrl, "_blank", "noopener,noreferrer")}
                            className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-indigo-300"
                          >
                            <ExternalLink size={14} />
                            <span>Explorer</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {isFinalStatus(activeSwap.status) ? (
                    <button
                      onClick={handleReset}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950 py-4 text-sm font-black text-white transition-all hover:bg-slate-800"
                    >
                      Start New Swap
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 text-sm font-bold text-slate-300">
                      <RefreshCw size={16} className="animate-spin text-indigo-400" />
                      <span>Checking backend status periodically...</span>
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {!activeSwap || !isFinalStatus(activeSwap.status) ? (
              <section className="swap-action-section mt-8 mb-6 flex flex-1 items-end">
                <div className="swap-action-inner w-full">
                  <button
                    disabled={
                      swapLocked ||
                      previewLoading ||
                      reviewValidating ||
                      executing ||
                      !preview?.swapId ||
                      quoteExpired ||
                      Boolean(formValidationMessage)
                    }
                    onClick={handleReview}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 font-bold text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                  >
                    {previewLoading ? (
                      <>
                        <RefreshCw size={22} className="animate-spin" />
                        <span>Fetching Quote</span>
                      </>
                    ) : reviewValidating ? (
                      <>
                        <RefreshCw size={22} className="animate-spin" />
                        <span>Validating Swap</span>
                      </>
                    ) : swapLocked ? (
                      <>
                        <RefreshCw size={22} className="animate-spin" />
                        <span>Swap In Progress</span>
                      </>
                    ) : quoteExpired ? (
                      <>
                        <AlertTriangle size={22} />
                        <span>Quote Expired</span>
                      </>
                    ) : formValidationMessage ? (
                      <>
                        <AlertTriangle size={22} />
                        <span>Swap Unavailable</span>
                      </>
                    ) : (
                      <span>Review Swap</span>
                    )}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}

        <WalletPickerModal
          open={pickerMode === "from"}
          mode="from"
          options={sourceWalletOptions}
          selectedId={sourceWalletId}
          onSelect={(wallet) => setSourceWalletId(wallet.id)}
          onClose={() => setPickerMode("")}
        />

        <WalletPickerModal
          open={pickerMode === "to"}
          mode="to"
          options={destinationWalletOptions}
          selectedId={destinationWalletId}
          onSelect={(wallet) => setDestinationWalletId(wallet.id)}
          onClose={() => setPickerMode("")}
        />

        <ReviewModal
          open={reviewOpen}
          preview={preview}
          onClose={() => setReviewOpen(false)}
          onConfirm={handleExecute}
          isExecuting={executing}
        />
      </div>
    </motion.div>
  );
}
