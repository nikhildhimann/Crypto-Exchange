import { format, formatDistanceToNowStrict } from "date-fns";

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatWalletCount(value) {
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

export function humanizeWalletValue(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatWalletDisplayId(wallet = {}) {
  return truncateMiddle(wallet.address || wallet.id || "Unavailable", 12, 6);
}

export function formatWalletAbsoluteTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : format(timestamp, "PPpp");
}

export function formatWalletRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unavailable"
    : formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

export function getWalletStateTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["enabled", "active", "primary", "default"].includes(normalized)) {
    return "emerald";
  }

  if (["hidden", "imported", "warning"].includes(normalized)) {
    return "amber";
  }

  if (["archived", "inactive", "disabled", "failed", "error"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}

export function getWalletChainTone(chain) {
  const normalized = String(chain || "").trim().toLowerCase();

  if (["btc", "bitcoin"].includes(normalized)) {
    return "amber";
  }

  if (["eth", "ethereum", "base", "arb", "arbitrum"].includes(normalized)) {
    return "cyan";
  }

  if (["sol", "solana"].includes(normalized)) {
    return "emerald";
  }

  if (["ada", "cardano"].includes(normalized)) {
    return "rose";
  }

  return "slate";
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
