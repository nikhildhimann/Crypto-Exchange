import { apiRequest } from "./client";

/**
 * Fetches historical market chart data for an asset
 * @param {string} asset - The asset symbol (e.g., SOL)
 * @param {string} range - The time range (1H, 1D, 1W, 1M, 1Y)
 */
export async function fetchMarketChart(asset, range = '1D') {
  const response = await apiRequest(`/market/chart/${asset}`, {
    query: { range }
  });
  return response.data || [];
}

/**
 * Fetches detailed market statistics for an asset
 */
export async function fetchMarketStats(asset) {
  const response = await apiRequest(`/market/stats/${asset}`);
  return response.data || null;
}

/**
 * Fetches current prices and 24h changes for multiple assets
 * @param {string[]} assets - Array of asset symbols (e.g., ['BTC', 'ETH'])
 */
export async function fetchMarketPrices(assets = []) {
  if (!assets.length) return {};
  const response = await apiRequest(`/market/prices`, {
    query: { assets: assets.join(',') }
  });
  return response.data || {};
}
