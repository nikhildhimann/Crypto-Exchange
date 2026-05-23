/**
 * Utility for canonical asset and wallet normalization.
 * Consumes enriched market data from the backend and applies consistent fallback rules.
 */

/**
 * Normalizes an asset object with canonical market and balance fields.
 * 
 * Canonical Rules:
 * - priceUsd: market?.priceUsd || priceUsd || 0
 * - change24h: market?.change24h || change24h || priceChange24h || changePercentage || 0
 * - fiatValue: fiatValue || usdValue || (balance * priceUsd)
 * 
 * @param {Object} wallet - The wallet or asset object to normalize
 * @returns {Object} Normalized asset with canonical fields
 */
export const DEFAULT_WATCHLIST = [
  { symbol: "BTC", name: "Bitcoin", color: "#f7931a" },
  { symbol: "ADA", name: "Cardano", color: "#2a6cf6" },
  { symbol: "ETH", name: "Ethereum", color: "#627eea" },
  { symbol: "HBAR", name: "Hedera", color: "#0f172a" },
  { symbol: "XRP", name: "XRP", color: "#232920" },
  { symbol: "USDT", name: "Tether", color: "#26a17b" },
  { symbol: "SOL", name: "Solana", color: "#14f195" },
];

/**
 * Normalizes an asset object with canonical market and balance fields.
 */
export default function normalizeAssetMarketData(wallet) {
  if (!wallet) return null;

  const priceUsd = Number(
    wallet.market?.priceUsd ??
    wallet.priceUsd ??
    0
  );

  const change24h = Number(
    wallet.market?.change24h ??
    wallet.change24h ??
    wallet.priceChange24h ??
    wallet.changePercentage ??
    0
  );

  const balance = Number(wallet.balance || 0);

  const fiatValue = Number(
    wallet.fiatValue ??
    wallet.usdValue ??
    (balance * priceUsd)
  );

  return {
    ...wallet,
    id: wallet.id || wallet._id || wallet.symbol?.toLowerCase(),
    priceUsd,
    change: change24h,
    change24h,
    fiatValue,
    usdValue: fiatValue,
  };
}

/**
 * Normalizes a list of assets using the canonical rules.
 */
export function normalizeMarketList(list = []) {
  return list.map(normalizeAssetMarketData).filter(Boolean);
}

/**
 * Safely parses a numeric value for display
 */
export function safeNumber(value) {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}
