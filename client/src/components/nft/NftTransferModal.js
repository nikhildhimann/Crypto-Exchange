import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useDispatch } from "react-redux";
import {
  ChevronLeft,
  X,
  ShieldCheck,
  Send,
  LoaderCircle,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { useAppContext } from "../../contexts/AppContext";
import { getErrorMessage } from "../../lib/errorMessage";
import { setSyncStatus } from "../../store/nftSlice";
import { areAddressesEqual, isLikelyEvmAddress } from "../../lib/address";
import {
  getNftQuantityLabel,
  getNftQuantityValue,
  getNftStandardLabel,
  getNftTransferSupportMessage,
  isErc1155Nft,
  isNftTransferSupportedInUi,
} from "./display";

function truncateTokenId(id, start = 8, end = 6) {
  const str = String(id || "");
  if (str.length <= start + end + 2) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

function resolveNftTitle(nft) {
  if (!nft) return "NFT";
  if (nft.name) return nft.name;
  if (nft.tokenId) {
    return `Token #${truncateTokenId(nft.tokenId)}`;
  }
  return "NFT";
}

function safeBigInt(value) {
  const normalized = String(value || "0")
    .trim()
    .split(".")[0];
  if (!normalized || normalized === "-" || isNaN(Number(normalized))) return 0n;
  try {
    return BigInt(normalized);
  } catch {
    return 0n;
  }
}

function getTransferValidationError({ nft, toAddress, amount }) {
  const walletId = String(nft?.walletId || "").trim();
  const nftId = String(nft?.id || nft?._id || "").trim();
  const recipientAddress = String(toAddress || "").trim();
  const ownerAddress = String(nft?.ownerAddress || "").trim();
  const isERC1155 = isErc1155Nft(nft);

  if (!walletId || !nftId) return "NFT transfer is not ready yet";
  if (!recipientAddress) return "Recipient address is required";
  if (!isLikelyEvmAddress(recipientAddress)) return "Enter a valid Polygon wallet address";
  if (ownerAddress && areAddressesEqual(recipientAddress, ownerAddress)) {
    return "Recipient address must be different from the sender wallet";
  }

  if (isERC1155) {
    if (!amount || String(amount).trim() === "") return "Amount is required";
    const amountStr = String(amount).trim();
    const balanceStr = String(getNftQuantityValue(nft) || "0").trim();

    try {
      const isDecimal = amountStr.includes(".") || balanceStr.includes(".");
      if (isDecimal) {
        const amt = parseFloat(amountStr);
        const bal = parseFloat(balanceStr);
        if (isNaN(amt) || amt <= 0) return "Amount must be greater than 0";
        if (amt > bal) return `Amount exceeds available balance (${balanceStr})`;
      } else {
        const amt = BigInt(amountStr);
        const bal = safeBigInt(balanceStr);
        if (amt <= 0n) return "Amount must be greater than 0";
        if (amt > bal) return `Amount exceeds available balance (${bal.toString()})`;
      }
    } catch {
      return "Invalid amount format";
    }
  }
  return "";
}

export function NftTransferModal({ open, nft, onClose, onCompleted }) {
  const {
    estimateNftTransferFee,
    clearNftFeeEstimateState,
    transferNft,
    clearNftTransferState,
    nftFeeEstimateByNftId,
    nftTransferLoadingByNftId,
    nftTransferErrorByNftId,
    lastNftTransferResultByNftId,
    requestWalletNftRefresh,
  } = useAppContext();
  const dispatch = useDispatch();

  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("1");
  const [clientError, setClientError] = useState("");
  const [displayNft, setDisplayNft] = useState(nft || null);

  const nftId = String(displayNft?.id || displayNft?._id || "");
  const backendNftId = String(
    displayNft?.backendId || displayNft?._id || displayNft?.raw?._id || "",
  ).trim();

  const transferLoading = Boolean(nftTransferLoadingByNftId?.[nftId]);
  const transferError = nftTransferErrorByNftId?.[nftId] || "";
  const transferResult = lastNftTransferResultByNftId?.[nftId] || null;

  const feeEstimateState = backendNftId ? nftFeeEstimateByNftId?.[backendNftId] || null : null;
  const feeEstimateLoading = Boolean(feeEstimateState?.loading);
  const feeEstimate = feeEstimateState?.estimate || null;

  const title = resolveNftTitle(displayNft);
  const transferSupported = isNftTransferSupportedInUi(displayNft);
  
  const validationError = useMemo(() => 
    getTransferValidationError({ nft: displayNft, toAddress: recipientAddress, amount }),
    [displayNft, recipientAddress, amount]
  );

  const errorMessage = clientError || transferError?.message || transferError || "";

  useEffect(() => {
    if (open && nft) {
      setDisplayNft(nft);
      setAmount(isErc1155Nft(nft) ? "1" : "1");
    }
    if (!open) {
      setRecipientAddress("");
      setClientError("");
    }
  }, [open, nft]);

  useEffect(() => {
    if (
      !open ||
      !backendNftId ||
      !displayNft?.walletId ||
      transferResult ||
      !transferSupported ||
      validationError
    ) {
      if (backendNftId) clearNftFeeEstimateState(backendNftId);
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      estimateNftTransferFee({
        walletId: displayNft.walletId,
        nftId: backendNftId,
        toAddress: recipientAddress.trim(),
        amount: isErc1155Nft(displayNft) ? amount.trim() : "1",
      }).catch(() => null);
    }, 450);

    return () => window.clearTimeout(timerId);
  }, [backendNftId, displayNft, estimateNftTransferFee, open, recipientAddress, amount, transferSupported, transferResult, validationError, clearNftFeeEstimateState]);

  const handleClose = () => {
    if (transferLoading) return;
    if (nftId) clearNftTransferState(nftId);
    if (backendNftId) clearNftFeeEstimateState(backendNftId);
    setClientError("");
    setRecipientAddress("");
    setAmount("1");
    onClose?.();
  };

  const handleDone = () => {
    onCompleted?.(transferResult);
    handleClose();
  };

  async function handleSubmit() {
    if (validationError) {
      setClientError(validationError);
      return;
    }

    try {
      await transferNft({
        walletId: displayNft.walletId,
        nftId: backendNftId,
        uiNftId: nftId,
        toAddress: recipientAddress.trim(),
        amount: isErc1155Nft(displayNft) ? amount.trim() : "1",
      });

      // Trigger immediate background sync request
      await requestWalletNftRefresh({
        walletId: displayNft.walletId,
        chain: displayNft.chain || "polygon",
      }).catch(() => null);

      // Mark state as stale so polling picks up the refresh
      dispatch(
        setSyncStatus({
          status: "stale",
          needsRefresh: true,
          inProgress: false,
        }),
      );

      toast.success("NFT transfer submitted");
    } catch (error) {
      setClientError(getErrorMessage(error, "Failed to submit NFT transfer"));
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className="relative z-10 w-full max-w-md rounded-t-[2.5rem] border border-white/5 bg-slate-950 shadow-2xl sm:mb-6 sm:rounded-[2.5rem] overflow-hidden"
          >
            {/* MetaMask Style Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <button onClick={handleClose} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
                <ChevronLeft size={24} />
              </button>
              <h2 className="text-lg font-bold text-white tracking-tight">Send</h2>
              <button onClick={handleClose} className="p-2 -mr-2 text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-6 py-8 no-scrollbar">
              {/* Transfer Status View */}
              {transferResult ? (
                <div className="text-center py-6 space-y-6">
                  <div className="mx-auto w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                    <CheckCircle2 size={40} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Submitted</h3>
                    <p className="text-slate-400 mt-2">Your transaction is being processed on the network.</p>
                  </div>
                  {transferResult.txHash && (
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-left">
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Transaction Hash</p>
                       <p className="text-xs font-mono text-white break-all">{transferResult.txHash}</p>
                    </div>
                  )}
                  <div className="flex gap-4 pt-4">
                     <button onClick={handleDone} className="flex-1 bg-white text-slate-950 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-colors">
                       Done
                     </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  {/* Asset Branding */}
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <div className="w-28 h-28 rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 mb-6 bg-slate-900 group">
                          {displayNft.imageUrl || displayNft.image ? (
                            <img src={displayNft.imageUrl || displayNft.image} alt={title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-700"><ImageOff size={32} /></div>
                          )}
                        </div>
                        {isErc1155Nft(displayNft) && (
                          <div className="absolute -bottom-1 -right-1 bg-indigo-600 px-3 py-1 rounded-full text-[10px] font-black text-white border-2 border-slate-950 shadow-xl tracking-tighter">
                            ERC-1155
                          </div>
                        )}
                      </div>
                      <h3 className="text-2xl font-black text-white text-center leading-tight tracking-tight px-4 truncate max-w-full">{title}</h3>
                      <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-[0.3em]">{displayNft.collectionName || "Polygon Network"}</p>
                    </div>

                  {/* Form Fields */}
                  <div className="space-y-8">
                    {/* Recipient */}
                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-400 ml-1">To</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={recipientAddress}
                          onChange={(e) => setRecipientAddress(e.target.value)}
                          placeholder="Public address (0x) or ENS"
                          className="w-full bg-white/5 border border-white/10 rounded-[1.25rem] px-5 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-600 transition-all font-medium"
                        />
                      </div>
                    </div>

                    {/* Amount */}
                    {isErc1155Nft(displayNft) && (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Amount to Send</label>
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] font-medium text-slate-500">Available:</span>
                             <span className="text-[10px] font-bold text-white bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                               {getNftQuantityValue(displayNft) || "0"}
                             </span>
                          </div>
                        </div>
                        <div className="relative group">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => {
                              const val = e.target.value.replace(/,/g, ".");
                              if (val === "" || /^\d*\.?\d*$/.test(val)) {
                                setAmount(val);
                              }
                            }}
                            onBlur={() => {
                              if (amount.startsWith(".")) setAmount("0" + amount);
                              if (amount === "" || isNaN(parseFloat(amount))) setAmount("1");
                            }}
                            placeholder="0.00"
                            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-5 py-5 text-white text-3xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all placeholder:text-slate-800"
                          />
                          <button
                            onClick={() => setAmount(String(getNftQuantityValue(displayNft) || "1"))}
                            className="absolute right-4 top-1/2 -translate-y-1/2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[10px] font-black px-3 py-1.5 rounded-lg border border-indigo-500/20 uppercase tracking-tighter transition-all active:scale-95"
                          >
                            Max
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Feedback & Errors */}
                    <div className="space-y-4">
                      <AnimatePresence mode="wait">
                        {errorMessage ? (
                          <motion.div
                            key="error"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3"
                          >
                            <AlertCircle size={18} className="text-rose-400 mt-0.5 shrink-0" />
                            <p className="text-xs font-bold text-rose-300 leading-relaxed">{errorMessage}</p>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="fee"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden"
                          >
                            <div className="flex items-center justify-between p-4 border-b border-white/5">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Network Fee</span>
                              <div className="flex flex-col items-end">
                                {feeEstimateLoading ? (
                                  <div className="h-4 w-20 bg-white/5 animate-pulse rounded" />
                                ) : (
                                  <>
                                    <span className="text-sm font-bold text-white">
                                      {feeEstimate?.displayValue || "0.00"}
                                    </span >
                                    {feeEstimate?.fiatValue && (
                                      <span className="text-[10px] font-medium text-slate-500">
                                        ≈ {feeEstimate.fiatValue}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="p-4 flex items-center justify-between text-[10px] font-medium">
                               <span className="text-slate-500 uppercase tracking-tighter">Chain Confirmation</span>
                               <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">Instant</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>

                  {/* Submission Action */}
                  <div className="pt-4">
                    <button
                      disabled={transferLoading || !!getTransferValidationError({ nft: displayNft, toAddress: recipientAddress, amount })}
                      onClick={handleSubmit}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-5 rounded-[1.5rem] transition-all shadow-[0_12px_24px_-8px_rgba(79,70,229,0.5)] disabled:shadow-none active:scale-[0.98] flex items-center justify-center gap-3"
                    >
                      {transferLoading ? (
                        <>
                          <LoaderCircle size={20} className="animate-spin" />
                          <span>Sending Token...</span>
                        </>
                      ) : (
                        <span>Continue</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Safety Hint */}
            {!transferResult && (
              <div className="p-6 bg-slate-900/30 border-t border-white/5 flex items-center justify-center gap-2">
                <ShieldCheck size={14} className="text-indigo-400" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Secured Transaction</p>
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export default NftTransferModal;
