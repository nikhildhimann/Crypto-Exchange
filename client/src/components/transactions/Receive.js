import { useEffect, useMemo, useState, useRef } from "react";
import QRCodeStyling from "qr-code-styling";
import { ArrowLeft, Copy, Share, CheckCircle2, ChevronDown } from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { useAppContext } from "../../contexts/AppContext";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

import { copyTextToClipboard } from "../../lib/clipboard";
import { getErrorMessage } from "../../lib/errorMessage";

function resolveDestinationTag(receiveData) {
  const resolved =
    receiveData?.destinationTag ??
    receiveData?.qrParams?.destinationTag ??
    receiveData?.executionParams?.destinationTag ??
    null;

  if (resolved === undefined || resolved === null || resolved === "") {
    return null;
  }

  return String(resolved);
}

function buildShareMessage({ asset, address, destinationTag }) {
  const lines = [
    `Receive ${asset?.symbol || asset?.name || "asset"} details`,
    `Address: ${address}`,
  ];

  if (destinationTag) {
    lines.push(`Destination Tag: ${destinationTag}`);
    lines.push("Include the destination tag when sending.");
  }

  return lines.join("\n");
}

export function Receive() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const assetContextId = state?.assetContextId;
  const {
    assets: allAssets,
    visibleWalletCards,
    activeWallet,
    fetchReceiveQr,
    selectWallet,
  } = useAppContext();
  const qrRef = useRef(null);
  const qrInstanceRef = useRef(null);
  const qrAnimationFrameRef = useRef(0);
  const qrReadyTimeoutRef = useRef(0);
  const qrRenderRequestRef = useRef(0);
  const receiveRequestRef = useRef(0);
  const [qrReady, setQrReady] = useState(false);
  const [useQrImageFallback, setUseQrImageFallback] = useState(false);

  const [selectedAsset, setSelectedAsset] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receiveData, setReceiveData] = useState(null);
  const [error, setError] = useState("");
  const [showAllModal, setShowAllModal] = useState(false);

  const INLINE_LIMIT = 4;

  const assets = useMemo(() => allAssets || [], [allAssets]);

  useEffect(() => {
    if (!assets.length) {
      setSelectedAsset(null);
      return;
    }

    const nextSelected =
      assets.find(
        (asset) =>
          asset.walletId === activeWallet?.walletId || asset.walletId === activeWallet?.id,
      ) || assets[0];

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
  }, [assets, activeWallet?.walletId, activeWallet?.id, assetContextId]);

  useEffect(() => {
    let isMounted = true;
    const requestId = receiveRequestRef.current + 1;

    receiveRequestRef.current = requestId;

    async function loadReceiveData() {
      if (!selectedAsset?.walletId) {
        if (isMounted && requestId === receiveRequestRef.current) {
          setLoading(false);
          setReceiveData(null);
        }
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await fetchReceiveQr(
          selectedAsset.walletId,
          undefined,
          selectedAsset?.assetType === "token"
            ? { asset: selectedAsset.asset || selectedAsset.symbol }
            : {},
        );

        if (isMounted && requestId === receiveRequestRef.current) {
          setReceiveData(response);
        }
      } catch (requestError) {
        if (isMounted && requestId === receiveRequestRef.current) {
          setReceiveData(null);
          setError(getErrorMessage(requestError, "Failed to load receive QR"));
        }
      } finally {
        if (isMounted && requestId === receiveRequestRef.current) {
          setLoading(false);
        }
      }
    }

    loadReceiveData();

    return () => {
      isMounted = false;
    };
  }, [selectedAsset?.id, selectedAsset?.walletId, fetchReceiveQr]);

  const chainCode = String(
    selectedAsset?.chain || selectedAsset?.wallet?.chain || activeWallet?.chain || "",
  ).toLowerCase();

  const destinationTag = resolveDestinationTag(receiveData);
  const displayAddress =
    receiveData?.address ||
    selectedAsset?.wallet?.address ||
    selectedAsset?.address ||
    "";
  const qrImage = receiveData?.qrCode?.dataUrl || "";

  const qrValue =
    receiveData?.qrCode?.value ||
    receiveData?.address ||
    selectedAsset?.wallet?.address ||
    selectedAsset?.address ||
    "";

  useEffect(() => {
    setUseQrImageFallback(false);
  }, [qrValue, qrImage, selectedAsset?.iconUrl]);

  useEffect(() => {
    if (!qrValue) return;

    const renderRequestId = qrRenderRequestRef.current + 1;

    qrRenderRequestRef.current = renderRequestId;
    setQrReady(false);

    if (qrAnimationFrameRef.current) {
      cancelAnimationFrame(qrAnimationFrameRef.current);
      qrAnimationFrameRef.current = 0;
    }

    if (qrReadyTimeoutRef.current) {
      clearTimeout(qrReadyTimeoutRef.current);
      qrReadyTimeoutRef.current = 0;
    }

    if (!qrRef.current) {
      if (qrImage) {
        setUseQrImageFallback(true);
        setQrReady(true);
      }
      return;
    }

    // Prevent layout thrash
    qrAnimationFrameRef.current = requestAnimationFrame(() => {
      if (qrRenderRequestRef.current !== renderRequestId) {
        return;
      }

      if (!qrRef.current) return;

      qrRef.current.innerHTML = "";

      const qr = new QRCodeStyling({
        width: 220,
        height: 220,
        data: qrValue,
        image: selectedAsset?.iconUrl || undefined,
        dotsOptions: {
          type: "rounded",
          color: "#000000",
        },
        backgroundOptions: {
          color: "#ffffff",
        },
        imageOptions: {
          crossOrigin: "anonymous",
          margin: 6,
          imageSize: 0.3,
        },
        cornersSquareOptions: {
          type: "extra-rounded",
        },
        cornersDotOptions: {
          type: "dot",
        },
      });

      try {
        qr.append(qrRef.current);
        qrInstanceRef.current = qr;
      } catch (_error) {
        if (qrRenderRequestRef.current !== renderRequestId) {
          return;
        }

        qrInstanceRef.current = null;
        if (qrImage) {
          setUseQrImageFallback(true);
          setQrReady(true);
          return;
        }
      }

      // Small delay ensures DOM paint stability
      qrReadyTimeoutRef.current = window.setTimeout(() => {
        if (qrRenderRequestRef.current === renderRequestId) {
          setQrReady(true);
        }
      }, 50);
    });

    return () => {
      if (qrAnimationFrameRef.current) {
        cancelAnimationFrame(qrAnimationFrameRef.current);
        qrAnimationFrameRef.current = 0;
      }

      if (qrReadyTimeoutRef.current) {
        clearTimeout(qrReadyTimeoutRef.current);
        qrReadyTimeoutRef.current = 0;
      }
    };
  }, [qrImage, qrValue, selectedAsset?.iconUrl]);
  const shouldShowDestinationTag =
    chainCode === "xrp"
      ? Boolean(receiveData?.supportsDestinationTag) && Boolean(destinationTag)
      : Boolean(destinationTag);

  const handleSelectAsset = (asset) => {
    setSelectedAsset(asset);
    setCopied(false);
    setReceiveData(null);
    setError("");

    if (asset?.walletId) {
      selectWallet(asset.walletId);
    }
  };

  const handleCopy = async () => {
    if (!displayAddress) {
      return;
    }

    try {
      await copyTextToClipboard(displayAddress);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      toast.error("Failed to copy address");
    }
  };

  const handleShare = async () => {
    if (!displayAddress || !selectedAsset) {
      return;
    }

    const shareText = buildShareMessage({
      asset: selectedAsset,
      address: displayAddress,
      destinationTag,
    });

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Receive ${selectedAsset.symbol || selectedAsset.name}`,
          text: shareText,
        });
        return;
      } catch {
        // fallback to copy
      }
    }

    try {
      await copyTextToClipboard(shareText);
      toast.success("Receive details copied");
    } catch {
      toast.error("Failed to share details");
    }
  };

  if (!assets.length || !selectedAsset) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="aura-container"
      >
        <section className="receive-header-section sticky top-0 z-50">
          <div className="receive-header-inner aura-header">
            <button onClick={() => navigate(-1)} className="aura-header-button group">
              <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <h1 className="aura-header-title">Receive</h1>
            <div className="w-10" />
          </div>
        </section>

        <div className="px-5 mt-10">
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-center">
            <p className="text-sm font-semibold text-slate-400">
              No wallets are available for the current network.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="aura-container"
    >
      <section className="receive-header-section sticky top-0 z-50">
        <div className="receive-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <h1 className="aura-header-title">Receive</h1>
          <div className="w-10" />
        </div>
      </section>

      <div className="px-5 mt-6 flex flex-col items-center space-y-8">
        {error ? (
          <div className="w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">{error}</p>
          </div>
        ) : null}

        <section className="receive-asset-section w-full">
          <div className="receive-asset-inner w-full">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                Select Asset to Receive
              </label>
              {assets.length > INLINE_LIMIT && (
                <button
                  onClick={() => setShowAllModal(true)}
                  className="text-xs font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-[0.15em] transition-colors"
                >
                  View All ({assets.length})
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              {assets.slice(0, INLINE_LIMIT).map((asset) => (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  key={asset.id}
                  onClick={() => handleSelectAsset(asset)}
                  className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl border transition-all ${selectedAsset.id === asset.id
                    ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-800"
                    }`}
                >
                  {asset.iconUrl ? (
                    <img
                      src={asset.iconUrl}
                      alt={asset.name}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center text-[9px] font-bold">
                      {(asset.symbol || asset.name || "A").charAt(0)}
                    </div>
                  )}
                  <span className="font-bold text-xs">{asset.symbol || asset.name}</span>
                </motion.button>
              ))}

              {assets.length > INLINE_LIMIT && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowAllModal(true)}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-400 transition-all"
                >
                  <div className="w-5 h-5 bg-slate-800 rounded-full flex items-center justify-center">
                    <ChevronDown size={12} />
                  </div>
                  <span className="font-bold text-xs">+{assets.length - INLINE_LIMIT} More</span>
                </motion.button>
              )}
            </div>
          </div>
        </section>

        <section className="receive-qr-section flex justify-center w-full">
          <div className="receive-qr-inner">
            <motion.div
              key={selectedAsset.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white p-6 rounded-[2rem] shadow-2xl shadow-white/5 w-64 h-64 flex items-center justify-center relative border-[8px] border-slate-800"
            >
              {loading ? (
                <div className="w-full h-full rounded-[1rem] bg-slate-200 animate-pulse" />
              ) : qrValue || qrImage ? (
                <div
                  className={`w-full h-full flex items-center justify-center transition-opacity duration-200 ${qrReady ? "opacity-100" : "opacity-0"
                    }`}
                >
                  {useQrImageFallback && qrImage ? (
                    <img
                      src={qrImage}
                      alt={`${selectedAsset.symbol || selectedAsset.name} QR`}
                      className="w-full h-full object-contain rounded-[1rem]"
                    />
                  ) : (
                    <div
                      ref={qrRef}
                      className="w-full h-full flex items-center justify-center overflow-hidden"
                      style={{
                        minWidth: "220px",
                        minHeight: "220px",
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="w-full h-full grid grid-cols-6 grid-rows-6 gap-1 p-2">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <div
                      key={i}
                      className={`bg-slate-950 rounded-sm ${Math.random() > 0.5 ? "opacity-100" : "opacity-0"
                        }`}
                    />
                  ))}
                  <div className="absolute inset-0 m-auto w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg p-1">
                    {selectedAsset.iconUrl ? (
                      <img
                        src={selectedAsset.iconUrl}
                        alt="logo"
                        className="w-full h-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-900 rounded-lg flex items-center justify-center font-bold text-white text-xs">
                        {selectedAsset.symbol || selectedAsset.name}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </section>

        <section className="receive-info-section w-full">
          <div className="receive-info-inner text-center space-y-2 flex flex-col items-center">
            <p className="text-sm font-semibold text-slate-400">
              Scan address to receive {selectedAsset.symbol || selectedAsset.name}
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-3xl font-mono text-sm text-slate-300 break-all w-full max-w-[280px] shadow-lg text-center">
              {displayAddress || "Waiting for address"}
            </div>

            {shouldShowDestinationTag ? (
              <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-3xl font-mono text-sm text-slate-300 break-all w-full max-w-[280px] shadow-lg text-center">
                Destination Tag: {destinationTag}
              </div>
            ) : null}
          </div>
        </section>

        <section className="receive-actions-section w-full flex justify-center mt-4">
          <div className="receive-actions-inner flex justify-center space-x-6 w-full max-w-[280px]">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="flex-1 flex flex-col items-center justify-center space-y-3 group"
            >
              <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/30 transition-all shadow-lg">
                {copied ? <CheckCircle2 size={24} className="text-emerald-400" /> : <Copy size={24} />}
              </div>
              <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-400 transition-colors">
                {copied ? "Copied" : "Copy"}
              </span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleShare}
              className="flex-1 flex flex-col items-center justify-center space-y-3 group"
            >
              <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/30 transition-all shadow-lg">
                <Share size={24} />
              </div>
              <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-400 transition-colors">
                Share
              </span>
            </motion.button>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {showAllModal && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAllModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-[320px] bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col z-[101]"
            >
              <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 bg-white/5">
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">
                  Select Wallet
                </h3>
                <button
                  onClick={() => setShowAllModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  {assets.map((asset) => {
                    const isActive = selectedAsset.id === asset.id;
                    return (
                      <motion.button
                        key={asset.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          handleSelectAsset(asset);
                          setShowAllModal(false);
                        }}
                        className={`w-full flex items-center justify-between p-4 rounded-3xl border transition-all text-left ${isActive
                            ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                            : "border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/10"
                          }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            {asset.iconUrl ? (
                              <img
                                src={asset.iconUrl}
                                alt=""
                                className="w-10 h-10 rounded-full object-cover border border-white/10"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-sm font-bold text-slate-300">
                                {(asset.symbol || asset.name || "A").charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-black uppercase tracking-tight truncate ${isActive ? "text-indigo-400" : "text-slate-200"
                              }`}>
                              {asset.symbol || asset.name}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 truncate mt-0.5 uppercase tracking-wider">
                              {asset.network || "Mainnet"}
                            </p>
                          </div>
                        </div>
                        {isActive && (
                          <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full" />
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
