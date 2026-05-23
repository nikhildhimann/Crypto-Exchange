function readEnvNumber(name, fallback, min = 0) {
  const rawValue = import.meta?.env?.[name];
  const parsed = Number.parseInt(String(rawValue || "").trim(), 10);

  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

export const runtimeConfig = Object.freeze({
  balanceRefreshIntervalMs: readEnvNumber(
    "VITE_BALANCE_REFRESH_INTERVAL_MS",
    60_000,
    60_000,
  ),
  notificationRefreshIntervalMs: readEnvNumber(
    "VITE_NOTIFICATION_REFRESH_INTERVAL_MS",
    60_000,
    60_000,
  ),
  marketPriceRefreshIntervalMs: readEnvNumber(
    "VITE_MARKET_PRICE_REFRESH_INTERVAL_MS",
    180_000,
    120_000,
  ),
  nftSyncStatusPollIntervalMs: readEnvNumber(
    "VITE_NFT_SYNC_STATUS_POLL_INTERVAL_MS",
    15_000,
    15_000,
  ),
  pendingSwapRefreshIntervalMs: readEnvNumber(
    "VITE_PENDING_SWAP_REFRESH_INTERVAL_MS",
    30_000,
    30_000,
  ),
  swapStatusPollIntervalMs: readEnvNumber(
    "VITE_SWAP_STATUS_POLL_INTERVAL_MS",
    30_000,
    30_000,
  ),
  conversionPreviewDebounceMs: readEnvNumber(
    "VITE_CONVERSION_PREVIEW_DEBOUNCE_MS",
    600,
    300,
  ),
  socketReconnectAttempts: readEnvNumber(
    "VITE_SOCKET_RECONNECT_ATTEMPTS",
    3,
    0,
  ),
  socketReconnectDelayMs: readEnvNumber(
    "VITE_SOCKET_RECONNECT_DELAY_MS",
    10_000,
    5_000,
  ),
});
