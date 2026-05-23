import { format, formatDistanceToNowStrict } from "date-fns";
import { CHAIN_REGISTRY } from "../../../config/chains";
import { truncateMiddle, humanizeValue } from "../../utils/common";
export { truncateMiddle };
export const humanizeTransactionValue = humanizeValue;

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatTransactionCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numberFormatter.format(numericValue) : "--";
}
export function formatTransactionDisplayId(transaction = {}) {
  return truncateMiddle(transaction.txHash || transaction.id || "Unavailable", 12, 8);
}

export function formatTransactionAbsoluteTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : format(timestamp, "MMM d, h:mm a");
}

export function formatTransactionRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unavailable"
    : formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

export function formatTransactionAmount(amount, asset = "") {
  const normalizedAmount = String(amount || "").trim();
  const normalizedAsset = String(asset || "").trim();

  if (!normalizedAmount && !normalizedAsset) {
    return "Unavailable";
  }

  return [normalizedAmount || "0", normalizedAsset].filter(Boolean).join(" ");
}

export function getTransactionStatusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["success", "confirmed", "completed", "active"].includes(normalized)) {
    return "emerald";
  }

  if (["pending", "queued", "processing"].includes(normalized)) {
    return "amber";
  }

  if (["failed", "error", "rejected", "cancelled"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}

export function getTransactionDirectionTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["incoming", "credit", "received", "internal"].includes(normalized)) {
    return "cyan";
  }

  if (["outgoing", "debit", "sent"].includes(normalized)) {
    return "amber";
  }

  return "slate";
}

export function getTransactionTypeTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "internal") {
    return "cyan";
  }

  if (normalized === "external") {
    return "slate";
  }

  if (["transfer", "swap"].includes(normalized)) {
    return "emerald";
  }

  return "slate";
}

export function getTransactionChainTone(chain) {
  const normalized = String(chain || "").trim().toLowerCase();
  
  const meta = Object.values(CHAIN_REGISTRY).find(
    (c) => c.code === normalized || c.id === normalized || c.name.toLowerCase() === normalized
  );

  if (!meta) return "slate";

  switch (meta.code) {
    case "btc":
    case "ltc":
    case "doge":
    case "bnb":
      return "amber";
    case "eth":
    case "avax":
    case "polygon":
    case "tron":
      return "cyan";
    case "solana":
    case "sui":
    case "ton":
      return "emerald";
    case "ada":
    case "xrp":
    case "hbar":
      return "rose";
    default:
      return "slate";
  }
}

export function formatMetadataValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}...` : serialized;
  } catch (_error) {
    return "Complex value";
  }
}
