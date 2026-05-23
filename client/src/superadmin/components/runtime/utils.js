import { format, formatDistanceToNowStrict } from "date-fns";
import { CHAIN_REGISTRY } from "../../../config/chains";
import { truncateMiddle, humanizeValue } from "../../utils/common";
export { truncateMiddle };
export const humanizeRuntimeValue = humanizeValue;

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatRuntimeCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numberFormatter.format(numericValue) : "--";
}
export function formatRuntimeAbsoluteTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : format(timestamp, "PPpp");
}

export function formatRuntimeRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unavailable"
    : formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

export function formatBooleanState(value, truthyLabel = "Enabled", falsyLabel = "Disabled") {
  if (value === null || value === undefined || value === "") {
    return "Unavailable";
  }

  return value ? truthyLabel : falsyLabel;
}

export function formatIntervalMs(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "Unavailable";
  }

  if (numericValue < 1000) {
    return `${numericValue} ms`;
  }

  const seconds = numericValue / 1000;
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = seconds / 60;
  if (minutes < 60) {
    return Number.isInteger(minutes) ? `${minutes} min` : `${minutes.toFixed(1)} min`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return Number.isInteger(hours) ? `${hours} hr` : `${hours.toFixed(1)} hr`;
  }

  const days = hours / 24;
  return Number.isInteger(days) ? `${days} d` : `${days.toFixed(1)} d`;
}

export function formatRuntimeBalance(value, asset = "") {
  const normalizedValue = String(value || "").trim();
  const normalizedAsset = String(asset || "").trim().toUpperCase();

  if (!normalizedValue && !normalizedAsset) {
    return "Unavailable";
  }

  return [normalizedValue || "0", normalizedAsset].filter(Boolean).join(" ");
}

export function getRuntimeStatusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["ok", "active", "enabled", "healthy", "scheduled", "running", "success"].includes(normalized)) {
    return "emerald";
  }

  if (["idle", "info"].includes(normalized)) {
    return "cyan";
  }

  if (["warning", "pending", "degraded", "maintenance", "warm"].includes(normalized)) {
    return "amber";
  }

  if (["disabled", "failed", "error", "inactive", "stopped", "cold"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}

export function getRuntimeChainTone(value) {
  const normalized = String(value || "").trim().toLowerCase();
  
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

export function formatRuntimeMetadataValue(value) {
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
