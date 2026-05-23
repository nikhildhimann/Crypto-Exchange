/**
 * Superadmin module shared constants.
 * Centralises values that were previously hardcoded in individual hooks,
 * services, and components so there is a single source of truth for each.
 */

// ---------------------------------------------------------------------------
// Transaction / deposit / withdrawal statuses
// ---------------------------------------------------------------------------

export const TRANSACTION_STATUSES = Object.freeze([
  "created",
  "pending",
  "queued",
  "processing",
  "success",
  "confirmed",
  "completed",
  "failed",
]);

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Default page size used across all superadmin list views. */
export const DEFAULT_LIMIT = 25;

/** Number of items fetched for overview activity widgets. */
export const OVERVIEW_LIMIT = 5;

/** Number of items fetched for runtime compact list snapshots. */
export const RUNTIME_LIMIT = 6;

// ---------------------------------------------------------------------------
// Real-time socket
// ---------------------------------------------------------------------------

/**
 * Maximum number of transaction items kept in the real-time in-memory list
 * before the oldest entries are trimmed.
 */
export const MAX_REALTIME_ITEMS = 100;
