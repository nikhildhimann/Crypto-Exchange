import { format, formatDistanceToNowStrict } from "date-fns";

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatSessionCount(value) {
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

export function humanizeSessionValue(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatSessionDisplayId(session = {}) {
  return truncateMiddle(session.sessionId || session.id || "Unavailable", 12, 8);
}

export function formatSessionAbsoluteTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : format(timestamp, "PPpp");
}

export function formatSessionRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unavailable"
    : formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

export function getSessionStatusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "active") {
    return "emerald";
  }

  if (normalized === "expired") {
    return "amber";
  }

  if (normalized === "revoked") {
    return "rose";
  }

  return "slate";
}

export function getSessionScopeTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "user") {
    return "cyan";
  }

  if (normalized === "superadmin") {
    return "rose";
  }

  return "slate";
}

export function getSessionPlatformTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["ios", "android", "mobile"].includes(normalized)) {
    return "cyan";
  }

  if (["web", "browser"].includes(normalized)) {
    return "emerald";
  }

  if (["desktop", "windows", "macos", "linux"].includes(normalized)) {
    return "amber";
  }

  return "slate";
}

export function getSessionActorLabel(actor = {}, scope = "") {
  if (scope === "superadmin") {
    return actor.email || actor.id || "Unavailable";
  }

  return actor.publicAddress || actor.id || "Unavailable";
}
