import { format, formatDistanceToNowStrict } from "date-fns";

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatAccountCount(value) {
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

export function humanizeAccountValue(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatAccountDisplayId(account = {}) {
  return truncateMiddle(account.id || "Unavailable", 12, 6);
}

export function formatAccountAbsoluteTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : format(timestamp, "PPpp");
}

export function formatAccountRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unavailable"
    : formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

export function getAccountStatusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["active", "success", "enabled"].includes(normalized)) {
    return "emerald";
  }

  if (["pending", "warning"].includes(normalized)) {
    return "amber";
  }

  if (["archived", "inactive", "failed", "error"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}

export function getAccountTypeTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "trading") {
    return "rose";
  }

  if (normalized === "business") {
    return "amber";
  }

  if (normalized === "personal") {
    return "cyan";
  }

  if (normalized === "custom") {
    return "emerald";
  }

  return "slate";
}
