import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  ShieldCheck,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useAppContext } from "../../contexts/AppContext";
import { buildExplorerTransactionUrl } from "../../config/chains";

function getExplorerUrl(activeChainMeta, activeWallet, tx) {
  const txHash = tx?.transactionHash || tx?.txHash || "";
  const networkKey = String(
    tx?.walletNetwork ||
    tx?.network ||
    activeWallet?.network ||
    activeWallet?.selectedNetwork ||
    activeWallet?.networkCode ||
    "",
  ).toLowerCase();
  const transactionChainMeta = tx?.chainMeta || activeChainMeta || null;
  const transactionExplorerUrl = buildExplorerTransactionUrl(
    transactionChainMeta,
    networkKey,
    txHash,
  );

  if (transactionExplorerUrl) {
    return transactionExplorerUrl;
  }

  return "";
}

function getTransactionType(tx) {
  if (tx?.type) {
    return tx.type;
  }

  if (tx?.transactionType === "internal") {
    return "swapped";
  }

  if (tx?.isIncoming) {
    return "received";
  }

  return "sent";
}

function getStatusLabel(tx) {
  if (tx?.status === "success") {
    return "Success";
  }

  if (tx?.status === "completed") {
    return "Success";
  }

  if (tx?.status) {
    return tx.status.charAt(0).toUpperCase() + tx.status.slice(1);
  }

  return "Pending";
}

function truncateHash(value = "") {
  if (!value) {
    return "0x...";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function Explorer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { transactions, activeWallet, activeChainMeta } = useAppContext();

  const tx = transactions.find((t) => t.id === id);
  const txType = getTransactionType(tx);
  const txHash = tx?.transactionHash || tx?.txHash || "";
  const txSymbol = tx?.symbol || activeWallet?.asset || "";
  const networkLabel =
    activeWallet?.networkLabel ||
    activeWallet?.chainName ||
    activeWallet?.network ||
    "Network";
  const explorerUrl = getExplorerUrl(activeChainMeta, activeWallet, tx);

  const fromValue =
    tx?.fromAddress ||
    (txType === "sent"
      ? activeWallet?.address || activeWallet?.shortAddress || "0xYourWallet..."
      : tx?.address || "0x...");

  const toValue =
    tx?.toAddress ||
    (txType === "received"
      ? activeWallet?.address || activeWallet?.shortAddress || "0xYourWallet..."
      : tx?.address || "0x...");

  const handleOpenExplorer = () => {
    if (!explorerUrl) {
      return;
    }

    window.open(explorerUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="aura-container bg-slate-950"
    >
      <section className="explorer-header-section sticky top-0 z-50">
        <div className="explorer-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="aura-header-title flex items-center justify-center space-x-2">
            <Globe size={18} className="text-indigo-400" />
            <span>Crypto Wallet Explorer</span>
          </div>
          <div className="w-10" />
        </div>
      </section>

      <div className="flex-1 flex flex-col pt-6 px-4">
        <section className="explorer-content-section flex-1">
          <div className="explorer-content-inner bg-slate-100 rounded-3xl overflow-hidden flex flex-col h-full border border-slate-800 shadow-2xl">
              <div className="bg-slate-200 px-4 py-3 border-b border-slate-300 flex items-center space-x-3">
                <ShieldCheck size={16} className="text-emerald-600" />
                <div className="bg-white px-3 py-1.5 rounded-full text-xs text-slate-600 w-full truncate font-mono">
                  {explorerUrl || "Explorer unavailable"}
                </div>
              </div>

            <div className="flex-1 bg-white p-6 overflow-y-auto space-y-6">
              <div className="flex items-center space-x-3 pb-4 border-b border-slate-200">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h2 className="text-slate-800 font-bold">Transaction Details</h2>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {networkLabel}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div
                    className={`inline-flex items-center space-x-1 py-1 rounded text-xs px-2 font-bold ${
                      tx?.status === "success" || tx?.status === "completed"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {tx?.status === "success" || tx?.status === "completed" ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <XCircle size={12} />
                    )}
                    <span>{getStatusLabel(tx)}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase mb-1">Transaction Hash</p>
                  <p className="text-[11px] font-mono text-slate-800 break-all bg-slate-50 p-2 rounded border border-slate-100">
                    {txHash || "0x123..."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase mb-1">From</p>
                    <p className="text-xs font-mono text-blue-600 break-all whitespace-normal leading-relaxed bg-slate-50 p-2 rounded border border-slate-100">
                      {fromValue}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase mb-1">To</p>
                    <p className="text-xs font-mono text-blue-600 break-all whitespace-normal leading-relaxed bg-slate-50 p-2 rounded border border-slate-100">
                      {toValue}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase mb-1">Value</p>
                  <p className="text-sm font-bold text-slate-800">
                    {tx?.amount || "0"} {txSymbol}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="explorer-action-section mt-4 mb-6">
          <div className="explorer-action-inner">
            <button
              onClick={handleOpenExplorer}
              className="w-full bg-slate-900 border border-slate-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center space-x-2 active:scale-95 transition-transform"
            >
              <ExternalLink size={18} />
              <span>Open {networkLabel} explorer</span>
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
