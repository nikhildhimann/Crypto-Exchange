/**
 * Superadmin module — shared utility functions.
 *
 * These were previously copy-pasted across multiple service files and hooks.
 * Import from here instead of duplicating.
 */

// ---------------------------------------------------------------------------
// Type normalizers (service / hook helpers)
// ---------------------------------------------------------------------------

/**
 * Returns `value` if it is a plain non-array object, otherwise `{}`.
 */
export function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Returns `value` if it is an array, otherwise `[]`.
 */
export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Coerces `value` to a string. Returns `""` for null/undefined.
 */
export function normalizeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/**
 * Coerces `value` to a finite number, falling back to `fallback` (default 0).
 */
export function normalizeNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

/**
 * Extracts the `data` property from a standard API response payload.
 * Returns `{}` when `payload.data` is not a plain object.
 */
export function getData(payload = {}) {
  return payload && typeof payload.data === "object" && payload.data ? payload.data : {};
}

// ---------------------------------------------------------------------------
// String formatting
// ---------------------------------------------------------------------------

/**
 * Truncates `value` in the middle, keeping `prefixLength` chars at the start
 * and `suffixLength` chars at the end, joined by `"..."`.
 * Returns `"Unavailable"` for empty values.
 */
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

/**
 * Converts a snake_case / kebab-case / space-separated string into Title Case.
 * e.g. "pending_withdrawal" → "Pending Withdrawal"
 */
export function humanizeValue(value) {
  return String(value || "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Hook helpers
// ---------------------------------------------------------------------------

/**
 * Returns the initial request state shape used by superadmin data hooks.
 */
export function createRequestState() {
  return {
    data: null,
    loading: true,
    error: "",
    lastUpdatedAt: "",
  };
}

/**
 * Extracts a meaningful error message from an Error instance, falling back to
 * `fallback` when the error has no message.
 *
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
export function getErrorMessage(error, fallback = "Something went wrong.") {
  return error instanceof Error && error.message ? error.message : fallback;
}
