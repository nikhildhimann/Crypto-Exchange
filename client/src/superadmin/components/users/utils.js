import { format, formatDistanceToNowStrict } from "date-fns";

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatUserCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numberFormatter.format(numericValue) : "--";
}

export function formatUserDisplayId(user = {}) {
  const value = user.publicAddress || user.publicKey || user.id;
  return value ? truncateMiddle(value, 12, 6) : "No ID";
}

export function formatUserAbsoluteTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : format(timestamp, "PPpp");
}

export function formatUserRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unavailable"
    : formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

export function humanizeUserValue(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
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

export function getUserStatusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["active", "success", "enabled"].includes(normalized)) {
    return "emerald";
  }

  if (["pending", "warning"].includes(normalized)) {
    return "amber";
  }

  if (["locked", "inactive", "failed", "error"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}

export function getUserRoleTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "superadmin") {
    return "rose";
  }

  if (normalized === "admin") {
    return "amber";
  }

  if (normalized === "user") {
    return "cyan";
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
