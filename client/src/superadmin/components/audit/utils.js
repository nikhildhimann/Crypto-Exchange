import { format, formatDistanceToNowStrict } from "date-fns";

const numberFormatter = new Intl.NumberFormat("en-US");
const SENSITIVE_KEY_PATTERN = /(token|secret|password|passcode|pin|cookie|authorization|seed|mnemonic|private.?key|refresh.?token|access.?token)/i;
const HIGHLIGHT_KEY_PATTERN = /(request.?id|session.?id|entity.?id|resource.?id|target.?id|user.?agent|method|path|route|actor.?id)/i;

export function formatAuditCount(value) {
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

export function humanizeAuditValue(value) {
  return String(value || "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatAuditDisplayId(event = {}) {
  return truncateMiddle(event.id || "Unavailable", 12, 8);
}

export function formatAuditAbsoluteTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : format(timestamp, "PPpp");
}

export function formatAuditRelativeTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unavailable"
    : formatDistanceToNowStrict(timestamp, { addSuffix: true });
}

export function getAuditStatusTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["success", "completed", "allowed"].includes(normalized)) {
    return "emerald";
  }

  if (["warning", "pending"].includes(normalized)) {
    return "amber";
  }

  if (["failed", "error", "denied", "blocked"].includes(normalized)) {
    return "rose";
  }

  return "slate";
}

export function getAuditActionTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["login", "logout", "refresh", "verify", "approve"].some((token) => normalized.includes(token))) {
    return "cyan";
  }

  if (["create", "update", "change", "edit"].some((token) => normalized.includes(token))) {
    return "emerald";
  }

  if (["delete", "revoke", "deny", "reject", "fail"].some((token) => normalized.includes(token))) {
    return "rose";
  }

  return "slate";
}

export function sanitizeAuditMetadata(value, depth = 0) {
  if (depth > 4) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((entry) => sanitizeAuditMetadata(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).slice(0, 20);

    return Object.fromEntries(
      entries.map(([key, entryValue]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, "[Redacted]"];
        }

        return [key, sanitizeAuditMetadata(entryValue, depth + 1)];
      }),
    );
  }

  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 237)}...` : value;
  }

  return value;
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

export function extractAuditMetadataHighlights(metadata = {}) {
  const results = [];

  function visit(value, path = []) {
    if (results.length >= 8) {
      return;
    }

    if (Array.isArray(value)) {
      value.slice(0, 6).forEach((entry, index) => visit(entry, [...path, String(index)]));
      return;
    }

    if (value && typeof value === "object") {
      Object.entries(value).slice(0, 20).forEach(([key, entryValue]) => {
        if (results.length >= 8) {
          return;
        }

        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return;
        }

        if (
          HIGHLIGHT_KEY_PATTERN.test(key) &&
          (typeof entryValue === "string" || typeof entryValue === "number" || typeof entryValue === "boolean")
        ) {
          results.push({
            label: [...path, key].join("."),
            value: String(entryValue),
          });
          return;
        }

        visit(entryValue, [...path, key]);
      });
    }
  }

  visit(metadata);
  return results;
}
