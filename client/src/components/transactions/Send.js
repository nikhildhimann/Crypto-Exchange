import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ScanLine, RefreshCw } from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { useAppContext } from "../../contexts/AppContext";
import { motion, AnimatePresence } from "motion/react";
import { getErrorMessage } from "../../lib/errorMessage";

const MAX_AMOUNT_DECIMALS = 18;
const MAX_AMOUNT_WHOLE_DIGITS = 24;
const MAX_AMOUNT_INPUT_LENGTH = MAX_AMOUNT_WHOLE_DIGITS + MAX_AMOUNT_DECIMALS + 1;
const MAX_ADDRESS_INPUT_LENGTH = 200;
const POSITIVE_AMOUNT_PATTERN = new RegExp(
  `^(?!0+(\\.0+)?$)[0-9]{1,${MAX_AMOUNT_WHOLE_DIGITS}}(\\.[0-9]{1,${MAX_AMOUNT_DECIMALS}})?$`,
);
const DESTINATION_TAG_PATTERN = /^[0-9]+$/;

function formatBalance(value) {
  return Number.parseFloat(value || "0").toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function formatFiatValue(amount, asset, fiatCurrency) {
  const numericAmount = Number.parseFloat(amount || "0") || 0;
  const fiatValue = Number.parseFloat(asset?.fiatValue || 0) || 0;
  const assetBalance = Number.parseFloat(asset?.balance || 0) || 0;

  if (!numericAmount || !fiatValue || !assetBalance) {
    return `${fiatCurrency}${(0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  const converted = numericAmount * (fiatValue / assetBalance);

  return `${fiatCurrency}${converted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatHash(value) {
  if (!value) {
    return "Unavailable";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatBaseUnitsToDecimal(value, decimals) {
  const normalized = String(value ?? "0").trim();

  if (!/^\d+$/.test(normalized)) {
    return "0";
  }

  if (!decimals) {
    return normalized;
  }

  const padded = normalized.padStart(decimals + 1, "0");
  const integerPart = padded.slice(0, -decimals) || "0";
  const fractionPart = padded.slice(-decimals).replace(/0+$/, "");

  return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
}

function formatDecimalToBaseUnits(value, decimals) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return 0n;
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return 0n;
  }

  const [integerPart = "0", fractionPart = ""] = normalized.split(".");
  const paddedFraction = fractionPart.padEnd(decimals, "0").slice(0, decimals);

  return BigInt(`${integerPart}${paddedFraction}`.replace(/^0+(?=\d)/, "") || "0");
}

const SOLANA_TRANSFER_FEE_BASE_UNITS = 5000n;

function mapWalletToAsset(wallet, fallbackCurrency = "") {
  const numericFiatValue =
    Number.parseFloat(
      wallet?.fiatValue ??
      wallet?.currentFiatValue ??
      wallet?.usdValue ??
      "0",
    ) || 0;

  return {
    id: wallet?.walletId || wallet?.id || wallet?.address || wallet?.asset || "wallet",
    walletId: wallet?.walletId || wallet?.id || "",
    name: wallet?.chainName || wallet?.asset || "Wallet",
    symbol: wallet?.asset || fallbackCurrency || "",
    balance: wallet?.balance || "0",
    availableBalance: wallet?.availableBalance || wallet?.balance || "0",
    onChainBalance: wallet?.onChainBalance || wallet?.balance || "0",
    fiatValue: numericFiatValue,
    iconUrl: wallet?.icon || null,
    wallet,
  };
}

function buildTransactionPayload({
  walletId,
  chain,
  asset,
  address,
  amount,
  supportsDestinationTag,
  destinationTag,
  sendMax,
}) {
  const trimmedDestinationTag = String(destinationTag || "").trim();

  return {
    walletId,
    chain,
    asset,
    destinationAddress: String(address || "").trim(),
    amount: String(amount || ""),
    sendMax: Boolean(sendMax),
    executionParams:
      supportsDestinationTag && trimmedDestinationTag
        ? { destinationTag: trimmedDestinationTag }
        : {},
  };
}

function normalizeChainCode(value = "") {
  return String(value || "").trim().toLowerCase();
}

function sanitizeAmountInput(value) {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  if (!normalized) {
    return "";
  }

  if (!/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }

  const [wholePartRaw = "", fractionPartRaw = ""] = normalized.split(".");
  const wholePart = (wholePartRaw || "0").slice(0, MAX_AMOUNT_WHOLE_DIGITS);
  const fractionPart = fractionPartRaw.slice(0, MAX_AMOUNT_DECIMALS);

  if (normalized.startsWith(".")) {
    return fractionPart ? `0.${fractionPart}` : "0.";
  }

  return fractionPartRaw !== undefined && normalized.includes(".")
    ? `${wholePart}.${fractionPart}`
    : wholePart;
}

function sanitizeDestinationTagInput(value) {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, 20);
}

function validateTransferForm({
  address,
  amount,
  destinationTag,
  supportsDestinationTag,
  sendMax,
}) {
  if (!String(address || "").trim()) {
    return "Recipient address is required";
  }

  if (!sendMax) {
    const normalizedAmount = String(amount || "").trim();

    if (!normalizedAmount) {
      return "Amount is required";
    }

    if (!POSITIVE_AMOUNT_PATTERN.test(normalizedAmount)) {
      return "Enter a valid positive amount with up to 18 decimals";
    }
  }

  const trimmedDestinationTag = String(destinationTag || "").trim();
  if (
    supportsDestinationTag &&
    trimmedDestinationTag &&
    !DESTINATION_TAG_PATTERN.test(trimmedDestinationTag)
  ) {
    return "Destination tag must contain only numbers";
  }

  return "";
}

export function SendFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = location;
  const assetContextId = state?.assetContextId;
  const {
    visibleAssets,
    fiatCurrency,
    validateDestination,
    previewTransaction,
    sendTransaction,
  } = useAppContext();

  const [step, setStep] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [destinationTag, setDestinationTag] = useState("");
  const [destinationState, setDestinationState] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sentTransaction, setSentTransaction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sendLocked, setSendLocked] = useState(false);
  const [isMax, setIsMax] = useState(false);
  const [isPreviewStale, setIsPreviewStale] = useState(false);
  const [refreshingPreview, setRefreshingPreview] = useState(false);

  const reviewRequestRef = useRef({ pending: false, key: "" });
  const sendRequestRef = useRef({ pending: false, key: "" });
  const lastPreviewPayloadRef = useRef("");
  const previousSelectedAssetIdRef = useRef("");
  const sendCommittedRef = useRef(false);
  const lastScannedPayloadRef = useRef("");

  const assets = useMemo(() => visibleAssets || [], [visibleAssets]);

  const selectedWallet = selectedAsset?.wallet || null;
  const selectedChainMeta = selectedAsset?.chainMeta || selectedWallet?.chainMeta || null;
  const selectedSupportsDestinationTag = Boolean(selectedChainMeta?.supportsDestinationTag);
  const selectedSpendableBalance = String(
    selectedAsset?.availableBalance || selectedAsset?.balance || "0",
  );
  const isSolanaWallet =
    String(selectedWallet?.chain || "").toLowerCase() === "solana";
  const scannedAddress = String(location.state?.scannedAddress || "").trim();
  const scannedChain = normalizeChainCode(location.state?.scannedChain);
  const scannedExecutionParams =
    location.state?.scannedExecutionParams &&
      typeof location.state.scannedExecutionParams === "object"
      ? location.state.scannedExecutionParams
      : {};
  const scannedDestinationTag =
    scannedExecutionParams.destinationTag === undefined ||
      scannedExecutionParams.destinationTag === null ||
      scannedExecutionParams.destinationTag === ""
      ? ""
      : String(scannedExecutionParams.destinationTag);

  useEffect(() => {
    if (sendLocked) {
      return;
    }

    if (!assets.length) {
      previousSelectedAssetIdRef.current = "";
      setSelectedAsset(null);
      return;
    }

    const nextSelected = assets[0];

    setSelectedAsset((current) => {
      if (!current) {
        if (assetContextId) {
          const matched = assets.find((a) => a.id === assetContextId || a.walletId === assetContextId);
          if (matched) return matched;
        }
        return nextSelected;
      }

      return assets.find((asset) => asset.id === current.id) || nextSelected;
    });
  }, [assets, sendLocked, assetContextId]);

  useEffect(() => {
    if (sendLocked) {
      return;
    }

    const nextSelectedAssetId = selectedAsset?.id || "";
    const previousSelectedAssetId = previousSelectedAssetIdRef.current;
    previousSelectedAssetIdRef.current = nextSelectedAssetId;

    if (!nextSelectedAssetId) {
      setPreview(null);
      setDestinationState(null);
      setSentTransaction(null);
      setError("");
      setAmount("");
      setAddress("");
      setDestinationTag("");
      setStep(1);
      return;
    }

    if (previousSelectedAssetId === nextSelectedAssetId) {
      return;
    }

    if (!previousSelectedAssetId && !assetContextId) {
      return;
    }

    reviewRequestRef.current = { pending: false, key: "" };
    sendRequestRef.current = { pending: false, key: "" };
    setPreview(null);
    setDestinationState(null);
    setSentTransaction(null);
    setError("");
    setAmount("");
    setAddress("");
    setDestinationTag("");
    setStep(2);
  }, [selectedAsset?.id, sendLocked, assetContextId]);

  useEffect(() => {
    if (selectedSupportsDestinationTag) {
      return;
    }

    setDestinationTag("");
  }, [selectedSupportsDestinationTag]);

  useEffect(() => {
    if (!scannedAddress) {
      return;
    }

    const scanRequestKey = JSON.stringify({
      address: scannedAddress,
      chain: scannedChain,
      destinationTag: scannedDestinationTag,
      locationKey: location.key,
    });

    if (lastScannedPayloadRef.current === scanRequestKey) {
      return;
    }

    lastScannedPayloadRef.current = scanRequestKey;

    const matchingAsset = assets.find(
      (asset) =>
        normalizeChainCode(asset?.chain || asset?.wallet?.chain) === scannedChain &&
        asset.assetType !== "token",
    ) || assets.find(
      (asset) => normalizeChainCode(asset?.chain || asset?.wallet?.chain) === scannedChain,
    );

    if (matchingAsset?.walletId) {
      setSelectedAsset(matchingAsset);
    }

    reviewRequestRef.current = { pending: false, key: "" };
    sendRequestRef.current = { pending: false, key: "" };
    setPreview(null);
    setDestinationState(null);
    setSentTransaction(null);
    setError("");
    setAddress(scannedAddress);
    setDestinationTag(scannedDestinationTag);
    setStep(2);
  }, [
    assets,
    location.key,
    scannedAddress,
    scannedChain,
    scannedDestinationTag,
  ]);

  const handleBack = () => {
    if (sendLocked) {
      return;
    }

    if (step > 1) {
      if (step === 3) {
        // Carry over any state needed?
      }
      setStep((current) => current - 1);
      return;
    }

    navigate(-1);
  };

  const handleSelectAsset = (asset) => {
    if (sendLocked) {
      return;
    }

    if (!asset?.walletId) {
      return;
    }

    const isSameSelectedAsset = asset.id === selectedAsset?.id;
    setSelectedAsset(asset);

    if (!isSameSelectedAsset) {
      reviewRequestRef.current = { pending: false, key: "" };
      sendRequestRef.current = { pending: false, key: "" };
      setPreview(null);
      setDestinationState(null);
      setSentTransaction(null);
      setError("");
      setAmount("");
      setAddress("");
      setDestinationTag("");
      setIsMax(false);
      setIsPreviewStale(false);
      lastPreviewPayloadRef.current = "";
    }

    setStep(2);
  };

  const handleMaxAmount = () => {
    setIsMax(true);
    setAmount("");
  };

  useEffect(() => {
    if (step !== 2 || sendLocked || !selectedAsset) {
      return undefined;
    }

    const payload = buildTransactionPayload({
      walletId: selectedAsset.walletId,
      chain: selectedWallet?.chain || selectedChainMeta?.code || "",
      asset: selectedAsset.asset || selectedAsset.symbol || "",
      address,
      amount: isMax ? "0" : amount,
      supportsDestinationTag: selectedSupportsDestinationTag,
      destinationTag,
      sendMax: isMax,
    });

    const requestKey = JSON.stringify(payload);

    if (lastPreviewPayloadRef.current === requestKey) {
      setIsPreviewStale(false);
      return undefined;
    }

    setIsPreviewStale(true);

    if (!address.trim() || (!amount && !isMax)) {
      return undefined;
    }

    const handler = setTimeout(async () => {
      setRefreshingPreview(true);
      try {
        const previewResponse = await previewTransaction(payload);
        setPreview(previewResponse);
        lastPreviewPayloadRef.current = requestKey;
        setIsPreviewStale(false);

        if (isMax && previewResponse?.amount) {
          setAmount(previewResponse.amount);
        }

        // Surface backend validation failures immediately (e.g. insufficient TRX for fees)
        // so the user sees the exact error while typing, without needing to click Review.
        if (previewResponse?.canSubmit === false) {
          const msg = previewResponse.validationErrors?.[0];
          if (msg) setError(msg);
        } else {
          // Clear any previous validation error once preview is valid
          setError("");
        }
      } catch (_err) {
        // Silently ignore network/server errors in background refresh.
        // handleValidateAndPreview will surface them explicitly on button click.
      } finally {
        setRefreshingPreview(false);
      }
    }, 800);

    return () => clearTimeout(handler);
  }, [
    address,
    amount,
    destinationTag,
    isMax,
    previewTransaction,
    selectedAsset,
    selectedChainMeta?.code,
    selectedSupportsDestinationTag,
    selectedWallet?.chain,
    sendLocked,
    step,
  ]);

  const handleValidateAndPreview = async () => {
    if (!selectedAsset?.walletId) {
      setError("Create or import a wallet first");
      return;
    }

    const formError = validateTransferForm({
      address,
      amount,
      destinationTag,
      supportsDestinationTag: selectedSupportsDestinationTag,
      sendMax: isMax,
    });
    if (formError) {
      setError(formError);
      return;
    }

    const payload = buildTransactionPayload({
      walletId: selectedAsset.walletId,
      chain: selectedWallet?.chain || selectedChainMeta?.code || "",
      asset: selectedAsset.asset || selectedAsset.symbol || "",
      address,
      amount: isMax ? "0" : amount,
      supportsDestinationTag: selectedSupportsDestinationTag,
      destinationTag,
      sendMax: isMax,
    });
    const requestKey = JSON.stringify(payload);

    setLoading(true);
    setError("");

    try {
      const validation = await validateDestination(payload);
      setDestinationState(validation);

      let currentPreview = preview;
      if (lastPreviewPayloadRef.current !== requestKey) {
        currentPreview = await previewTransaction(payload);
        setPreview(currentPreview);
        lastPreviewPayloadRef.current = requestKey;
        setIsPreviewStale(false);

        if (isMax && currentPreview?.amount) {
          setAmount(currentPreview.amount);
        }
      }

      if (!currentPreview) {
        throw new Error("Transaction preview unavailable");
      }

      if (currentPreview.canSubmit === false) {
        throw new Error(currentPreview.validationErrors?.[0] || "This transaction cannot be safely completed at this time.");
      }

      setStep(3);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to preview transfer"));
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!selectedAsset?.walletId) {
      return;
    }

    const formError = validateTransferForm({
      address,
      amount: isMax ? preview?.amount || amount : amount,
      destinationTag,
      supportsDestinationTag: selectedSupportsDestinationTag,
      sendMax: isMax,
    });
    if (formError) {
      setError(formError);
      return;
    }

    const payload = buildTransactionPayload({
      walletId: selectedAsset.walletId,
      chain: selectedWallet?.chain || selectedChainMeta?.code || "",
      asset: selectedAsset.asset || selectedAsset.symbol || "",
      address,
      amount: isMax ? preview?.amount || amount : amount,
      supportsDestinationTag: selectedSupportsDestinationTag,
      destinationTag,
      sendMax: isMax,
    });
    const requestKey = JSON.stringify(payload);

    if (sendRequestRef.current.pending && sendRequestRef.current.key === requestKey) {
      return;
    }

    sendRequestRef.current = { pending: true, key: requestKey };
    sendCommittedRef.current = false;
    setSendLocked(true);
    setLoading(true);
    setError("");

    try {
      const result = await sendTransaction(payload);

      sendCommittedRef.current = true;
      setSentTransaction(result);

      navigate(
        `/app/receipt/${result?.transactionId || result?.id || result?.txHash || result?.transactionHash || "success"
        }`,
        {
          state: {
            transaction: result,
            wallet: selectedAsset,
            preview,
            destinationAddress: address.trim(),
            destinationTag: destinationTag !== "" ? destinationTag : undefined,
          },
        },
      );
    } catch (requestError) {
      // CRITICAL: Even if the API returns an error, the transaction may have
      // been broadcast on-chain (money already moved). The server includes a
      // transactionId in the error payload when this happens. If we find one,
      // navigate to the receipt page so the user can see their transaction
      // instead of showing a misleading "Failed" error for a successful send.
      const errorPayload = requestError?.payload;
      const recoveredTransactionId =
        errorPayload?.errors?.transactionId ||
        errorPayload?.data?.transactionId ||
        errorPayload?.transactionId ||
        "";

      if (recoveredTransactionId) {
        sendCommittedRef.current = true;

        // Build a partial transaction for the receipt from what we know
        const partialTransaction = {
          transactionId: recoveredTransactionId,
          id: recoveredTransactionId,
          amount: preview?.amount || payload?.amount || "",
          symbol: selectedAsset?.symbol || selectedAsset?.asset || "",
          asset: selectedAsset?.asset || selectedAsset?.symbol || "",
          status: "pending",
          network: selectedAsset?.walletNetwork || selectedAsset?.chain || "",
          walletNetwork: selectedAsset?.walletNetwork || selectedAsset?.chain || "",
          fiatAmount: 0,
          date: new Date().toLocaleString(),
          chainTimestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };

        navigate(
          `/app/receipt/${recoveredTransactionId}`,
          {
            state: {
              transaction: partialTransaction,
              wallet: selectedAsset,
              preview,
              destinationAddress: address.trim(),
              destinationTag: destinationTag !== "" ? destinationTag : undefined,
            },
          },
        );
        return;
      }

      setSendLocked(false);
      setError(getErrorMessage(requestError, `Failed to send ${selectedAsset?.symbol || ""}`));
    } finally {
      sendRequestRef.current = { pending: false, key: "" };
      if (!sendCommittedRef.current) {
        setLoading(false);
      }
    }

  };

  if (!assets.length || !selectedAsset) {
    return (
      <div className="aura-container">
        <section className="send-header-section sticky top-0 z-50">
          <div className="send-header-inner aura-header">
            <button onClick={() => navigate(-1)} className="aura-header-button group">
              <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <h1 className="aura-header-title">Send</h1>
            <div className="w-10" />
          </div>
        </section>

        <div className="flex-1 px-5 mt-10">
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-center">
            <p className="text-sm font-semibold text-slate-400">
              No wallets are available for the current network.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="aura-container">
      <section className="send-header-section sticky top-0 z-50">
        <div className="send-header-inner aura-header">
          <button onClick={handleBack} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <h1 className="aura-header-title">
            {step === 1 ? "Select Asset" : step === 2 ? "Enter Details" : "Confirm"}
          </h1>
          <div className="w-10" />
        </div>
      </section>

      <div className="flex-1 px-5 mt-6 relative">
        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">{error}</p>
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="space-y-4"
            >
              <section className="send-assets-section">
                <div className="send-assets-inner">
                  <h2 className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    Available to Send
                  </h2>
                  <div className="space-y-3">
                    {assets.map((asset) => (
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={asset.id}
                        onClick={() => handleSelectAsset(asset)}
                        className={`bg-slate-900 p-4 rounded-3xl border flex items-center justify-between cursor-pointer transition-colors shadow-lg ${selectedAsset?.id === asset.id
                          ? "border-indigo-500 shadow-indigo-500/20 bg-indigo-500/10"
                          : "border-slate-800 hover:border-slate-700"
                          }`}
                      >
                        <div className="flex items-center space-x-4">
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
                          <div>
                            <h4 className="text-base font-bold text-white leading-tight">{asset.name}</h4>
                            <p className="text-sm font-medium text-slate-500">
                              {formatBalance(asset.availableBalance)} {asset.symbol}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-white leading-tight">
                            {fiatCurrency}
                            {Number(asset.fiatValue || 0).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="space-y-6"
            >
              <section className="send-details-section space-y-6 flex-1">
                <div className="send-details-inner space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      Recipient Address
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={selectedChainMeta?.addressLabel || `Enter ${selectedAsset.name} address`}
                        maxLength={MAX_ADDRESS_INPUT_LENGTH}
                        value={address}
                        onChange={(e) => {
                          setAddress(e.target.value);
                          setIsMax(false);
                          setIsPreviewStale(true);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 pr-14 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => navigate("/app/scanner")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-400 transition-colors"
                      >
                        <ScanLine size={24} />
                      </button>
                    </div>
                  </div>

                  {selectedSupportsDestinationTag ? (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                        Destination Tag
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Optional destination tag"
                        value={destinationTag}
                        onChange={(e) => {
                          const nextValue = sanitizeDestinationTagInput(e.target.value);
                          setDestinationTag(nextValue);
                          setIsMax(false);
                          setIsPreviewStale(true);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      Amount
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        maxLength={MAX_AMOUNT_INPUT_LENGTH}
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => {
                          const nextValue = sanitizeAmountInput(e.target.value);
                          if (nextValue === null) {
                            return;
                          }
                          setAmount(nextValue);
                          setIsMax(false);
                          setIsPreviewStale(true);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white text-3xl font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-center placeholder:text-slate-600"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-slate-800 px-3 py-1.5 rounded-xl text-sm font-bold text-white">
                        {selectedAsset.symbol}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1 mt-2">
                      <span className="text-slate-500 font-medium">
                        Available: {formatBalance(selectedSpendableBalance)}{" "}
                        {selectedAsset.symbol}
                      </span>
                      <button
                        onClick={handleMaxAmount}
                        className={`font-bold transition-colors ${isMax ? "text-indigo-600" : "text-indigo-400 hover:text-indigo-300"
                          }`}
                      >
                        {isMax ? "Max Applied" : "Max"}
                      </button>
                    </div>
                  </div>

                  <button
                    disabled={!address.trim() || (!amount && !isMax) || loading || (isPreviewStale && !refreshingPreview)}
                    onClick={handleValidateAndPreview}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 disabled:shadow-none mt-8 active:scale-[0.98] flex items-center justify-center space-x-2"
                  >
                    {(loading || refreshingPreview) ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        >
                          <RefreshCw size={20} />
                        </motion.div>
                        <span>{loading ? "Validating..." : "Updating Preview..."}</span>
                      </>
                    ) : (
                      "Review Transaction"
                    )}
                  </button>
                </div>
              </section>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="space-y-8 flex flex-col items-center"
            >
              <section className="send-confirm-section w-full">
                <div className="send-confirm-inner flex flex-col items-center space-y-8">
                  <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center border border-indigo-500/30 text-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                    <ArrowUpRight size={40} strokeWidth={2.5} />
                  </div>

                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold text-white tracking-tight">
                      {preview?.amount || amount || "0.00"} {preview?.currency || selectedAsset.symbol}
                    </h2>
                    <p className="text-lg font-medium text-slate-400">
                      {preview
                        ? destinationState?.isInternal
                          ? "Internal wallet transfer"
                          : `External ${selectedAsset.name} transfer`
                        : formatFiatValue(amount, selectedAsset, fiatCurrency)}
                    </p>
                  </div>

                  <div className="w-full bg-slate-900 rounded-3xl border border-slate-800 p-6 space-y-5 shadow-xl">
                    <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                      <span className="text-slate-400 font-medium text-sm">Available Balance</span>
                      <span className="text-white font-bold text-sm">
                        {formatBalance(preview?.availableBalance || selectedSpendableBalance)}{" "}
                        {preview?.currency || selectedAsset.symbol}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                      <span className="text-slate-400 font-medium text-sm">To</span>
                      <span className="text-white font-mono font-medium text-sm">
                        {preview?.toAddress
                          ? formatHash(preview.toAddress)
                          : address.length > 20
                            ? `${address.slice(0, 10)}...${address.slice(-6)}`
                            : address}
                      </span>
                    </div>

                    {selectedSupportsDestinationTag &&
                      (preview?.executionParams?.destinationTag !== undefined || destinationTag) ? (
                      <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                        <span className="text-slate-400 font-medium text-sm">Destination Tag</span>
                        <span className="text-white font-bold text-sm">
                          {preview?.executionParams?.destinationTag ?? destinationTag}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                      <span className="text-slate-400 font-medium text-sm">You Send</span>
                      <span className="text-white font-bold text-sm">
                        {preview?.amount || amount || "0.00"}{" "}
                        {preview?.currency || selectedAsset.symbol}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                      <span className="text-slate-400 font-medium text-sm">Recipient Gets</span>
                      <span className="text-white font-bold text-sm text-emerald-400">
                        {preview?.recipientGets || (preview?.amount || amount || "0.00")}{" "}
                        {preview?.currency || selectedAsset.symbol}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                      <span className="text-slate-400 font-medium text-sm">Network Fee</span>
                      <span className="text-white font-bold text-sm">
                        {preview?.networkFee ?? "0.0000"}{" "}
                        {preview?.networkFeeCurrency || preview?.feeCurrency || selectedChainMeta?.symbol || selectedAsset.symbol}
                      </span>
                    </div>

                    {preview?.applicationFee !== undefined && Number(preview.applicationFee) > 0 ? (
                      <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                        <span className="text-slate-400 font-medium text-sm">Application Fee</span>
                        <span className="text-white font-bold text-sm">
                          {preview.applicationFee} {preview?.currency || selectedAsset.symbol}
                        </span>
                      </div>
                    ) : (preview?.platformFee !== undefined && Number(preview.platformFee) > 0) ? (
                      <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                        <span className="text-slate-400 font-medium text-sm">Application Fee</span>
                        <span className="text-white font-bold text-sm">
                          {preview.platformFee} {preview?.currency || selectedAsset.symbol}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex justify-between items-center pb-5 border-b border-slate-800">
                      <span className="text-slate-300 font-bold text-sm">Total Deducted</span>
                      <span className="text-white font-bold text-sm">
                        {preview?.totalDeducted || preview?.totalDebit || amount || "0.00"}{" "}
                        {preview?.totalDeductedCurrency || preview?.totalDebitCurrency || preview?.currency || selectedAsset.symbol}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-medium text-sm">Remaining Balance</span>
                      <span className="text-white font-bold text-sm">
                        {formatBalance(preview?.remainingBalance || "0")}{" "}
                        {preview?.currency || selectedAsset.symbol}
                      </span>
                    </div>
                  </div>

                  <button
                    disabled={loading}
                    onClick={handleSend}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] flex items-center justify-center space-x-2"
                  >
                    {loading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      >
                        <RefreshCw size={24} />
                      </motion.div>
                    ) : (
                      <span>Confirm & Send</span>
                    )}
                  </button>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
