/**
 * Market Asset Configuration
 * Maps internal asset symbols to CoinGecko IDs for market data retrieval.
 */
const SYMBOL_MAP = Object.freeze({
  XRP: "ripple",
  BNB: "binancecoin",
  SOL: "solana",
  AVAX: "avalanche-2",
  POL: "polygon-ecosystem-token",
  BTC: "bitcoin",
  LTC: "litecoin",
  ADA: "cardano",
  HBAR: "hedera",
  ETH: "ethereum",
  SUI: "sui",
  APT: "aptos",
  TON: "the-open-network",
  XTZ: "tezos",
  USDT: "tether",
  USDC: "usd-coin",
  TRX: "tron",
  MATIC: "matic-network",
  POL: "polygon-ecosystem-token",
  DOGE: "dogecoin",
});

const SYMBOL_ALIASES = Object.freeze({
  POL: "POL",
  XRPL: "XRP",
  XRPLEDGER: "XRP",
  SOLANA: "SOL",
  CARDANO: "ADA",
  HEDERA: "HBAR",
  HBAR: "HBAR",
  AVALANCHE: "AVAX",
  AVALANCHECCHAIN: "AVAX",
  AVAXC: "AVAX",
  POLYGON: "POL",
  POLYGONPOS: "POL",
  POLYGONECOSYSTEMTOKEN: "POL",
  MATIC: "POL",
  XTZ: "XTZ",
  TEZOS: "XTZ",
  LTC: "LTC",
  SUI: "SUI",
  APT: "APT",
  TON: "TON",
  DOGE: "DOGE",
  BSC: "BNB",
  BNBCHAIN: "BNB",
  BNBSMARTCHAIN: "BNB",
  BINANCECOIN: "BNB",
  BINANCESMARTCHAIN: "BNB",
  ETHEREUM: "ETH",
  EVM: "ETH",
  LITECOIN: "LTC",
  APTOS: "APT",
  TONCOIN: "TON",
  THEOPENNETWORK: "TON",
  TRON: "TRX",
  BITCOIN: "BTC",
  DOGECOIN: "DOGE",
  TETHER: "USDT",
  USDCOIN: "USDC",
  POLYGON: "POL",
  POLYGONPOS: "POL",
});

function normalizeMarketSymbolKey(symbol = "") {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
}

function resolveCanonicalMarketSymbol(symbol = "") {
  const normalizedSymbol = normalizeMarketSymbolKey(symbol);
  return SYMBOL_ALIASES[normalizedSymbol] || normalizedSymbol;
}

function getMarketProviderId(symbol = "") {
  const canonicalSymbol = resolveCanonicalMarketSymbol(symbol);
  return SYMBOL_MAP[canonicalSymbol] || null;
}

const BINANCE_SYMBOL_MAP = Object.freeze({
  XRP: "XRPUSDT",
  BNB: "BNBUSDT",
  SOL: "SOLUSDT",
  AVAX: "AVAXUSDT",
  POL: "POLUSDT",
  BTC: "BTCUSDT",
  LTC: "LTCUSDT",
  ADA: "ADAUSDT",
  HBAR: "HBARUSDT",
  ETH: "ETHUSDT",
  SUI: "SUIUSDT",
  APT: "APTUSDT",
  TON: "TONUSDT",
  XTZ: "XTZUSDT",
  USDC: "USDCUSDT",
  TRX: "TRXUSDT",
  DOGE: "DOGEUSDT",
});

function getBinanceTickerSymbol(symbol = "") {
  const canonicalSymbol = resolveCanonicalMarketSymbol(symbol);
  return BINANCE_SYMBOL_MAP[canonicalSymbol] || null;
}

function parseStaticFallbackPrices() {
  const rawValue = String(process.env.MARKET_STATIC_FALLBACK_PRICES || "").trim();
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([symbol, value]) => {
          const canonicalSymbol = resolveCanonicalMarketSymbol(symbol);
          const numericValue = Number(value);

          if (!canonicalSymbol || !Number.isFinite(numericValue) || numericValue <= 0) {
            return null;
          }

          return [canonicalSymbol, numericValue];
        })
        .filter(Boolean),
    );
  } catch (_error) {
    return {};
  }
}

module.exports = {
  // Mapping of internal symbols to CoinGecko IDs
  SYMBOL_MAP,
  SYMBOL_ALIASES,
  normalizeMarketSymbolKey,
  resolveCanonicalMarketSymbol,
  getMarketProviderId,
  getBinanceTickerSymbol,
  STATIC_FALLBACK_PRICES: parseStaticFallbackPrices(),

  // Default market data when provider is unavailable or asset unsuporrted
  DEFAULT_MARKET_DATA: {
    priceUsd: 0,
    change24h: 0,
  },

  // CoinGecko API Configuration
  COINGECKO: {
    BASE_URL: 'https://api.coingecko.com/api/v3',
    QUOTE_CURRENCY: 'usd',
  },
  BINANCE: {
    BASE_URL: "https://api.binance.com",
    QUOTE_CURRENCY: "USDT",
  },
};
