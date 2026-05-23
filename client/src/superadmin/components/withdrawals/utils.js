import { format, formatDistanceToNowStrict } from "date-fns";

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatWithdrawalCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numberFormatter.format(numericValue) : "--";
}

export function truncateMiddle(value, prefixLength = 10, suffixLength = 4) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "Unavailable";
  }

  if (normalized.length <= prefixLength + suffixLength + 3) {
    return normalized;
  }

  return `${normalized.slice(0, prefixLength)}...${normalized.slice(-suffixLength)}`;
}

export function humanizeWithdrawalValue(value) {
  return String(value || "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatWithdrawalDisplayId(withdrawal = {}) {
  return truncateMiddle(withdrawal.txHash || withdrawal.reference || withdrawal.id || "Unavailable", 12, 8);
}

export function formatWithdrawalAbsoluteTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : format(timestamp, "PPpp");
}

export function formatWithdrawalRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unavailable"
    : formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

export function formatWithdrawalAmount(amount, asset = "") {
  const normalizedAmount = String(amount || "").trim();
  const normalizedAsset = String(asset || "").trim();

  if (!normalizedAmount && !normalizedAsset) {
    return "Unavailable";
  }

  return [normalizedAmount || "0", normalizedAsset].filter(Boolean).join(" ");
}

export function getWithdrawalStatusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["success", "completed", "active"].includes(normalized)) {
    return "emerald";
  }

  if (["pending", "queued", "processing", "created"].includes(normalized)) {
    return "amber";
  }

  if (["failed", "error", "rejected", "cancelled"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}

export function getWithdrawalChainTone(chain) {
  const normalized = String(chain || "").trim().toLowerCase();

  if (["btc", "bitcoin", "ltc", "litecoin", "doge", "dogecoin"].includes(normalized)) {
    return "amber";
  }

  if (["eth", "ethereum", "base", "arb", "arbitrum", "bnb", "avax", "polygon", "tron"].includes(normalized)) {
    return "cyan";
  }

  if (["sol", "solana", "sui", "ton"].includes(normalized)) {
    return "emerald";
  }

  if (["xrp", "ada", "cardano", "hbar"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}
