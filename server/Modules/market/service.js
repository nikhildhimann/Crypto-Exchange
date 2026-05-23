const {
  BINANCE,
  COINGECKO,
  DEFAULT_MARKET_DATA,
  STATIC_FALLBACK_PRICES,
  getBinanceTickerSymbol,
  getMarketProviderId,
  resolveCanonicalMarketSymbol,
} = require("../../config/marketAssets");
const logger = require("../../common/utils/logger");
const stats = require("../../common/utils/stats");
const operationsConfig = require("../../config/operations");
const MarketPriceCache = require("./priceCache.model");

const CACHE_TTL_MS = operationsConfig.sync.marketPriceCacheTtlMs;
const CHART_CACHE_TTL = CACHE_TTL_MS * 10;
const STATS_CACHE_TTL = CACHE_TTL_MS;
const PROVIDER_TIMEOUT_MS = Object.freeze({
  primary: 3000,
  coingecko: 4000,
  binance: 2500,
});

const cache = new Map();
const marketFetchInFlight = new Map();

function buildMarketCacheKey(symbol, quote = COINGECKO.QUOTE_CURRENCY) {
  return `${String(symbol || "").trim().toUpperCase()}:${String(quote || "").trim().toLowerCase()}`;
}

function isValidQuoteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeProviderMessage(error, fallback = "Provider request failed") {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function buildMarketResult(symbol, payload = {}) {
  const now = Date.now();
  const updatedAt = payload.updatedAt || new Date(now).toISOString();

  return {
    priceUsd: Number(payload.priceUsd || 0),
    change24h: Number(payload.change24h || 0),
    updatedAt,
    provider: payload.provider || null,
    providerId: payload.providerId || null,
    sourceType: payload.sourceType || "live",
    fallbackPriceUsed: Boolean(payload.fallbackPriceUsed),
    stale: Boolean(payload.stale),
    symbol: String(symbol || "").trim().toUpperCase(),
    error: payload.error || null,
    metadata:
      payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
        ? payload.metadata
        : {},
  };
}

function buildUnavailableResult(symbol, error, metadata = {}) {
  return buildMarketResult(symbol, {
    ...DEFAULT_MARKET_DATA,
    provider: null,
    providerId: null,
    sourceType: "unavailable",
    fallbackPriceUsed: false,
    stale: false,
    error,
    metadata,
  });
}

function getMemoryCacheState(symbol, quote = COINGECKO.QUOTE_CURRENCY, now = Date.now()) {
  const cacheKey = buildMarketCacheKey(symbol, quote);
  const cached = cache.get(cacheKey);

  if (!cached) {
    return {
      cached: null,
      hit: false,
      expired: false,
      ageMs: null,
      cacheKey,
    };
  }

  const ageMs = now - cached.timestamp;
  const expired = ageMs > CACHE_TTL_MS;

  stats.trackCache("market_price", !expired);
  return {
    cached: cached.data,
    hit: true,
    expired,
    ageMs,
    cacheKey,
  };
}

function setMemoryCache(symbol, data, quote = COINGECKO.QUOTE_CURRENCY, now = Date.now()) {
  cache.set(buildMarketCacheKey(symbol, quote), {
    data,
    timestamp: now,
  });

  if (cache.size > 500) {
    const expiryThreshold = now - CACHE_TTL_MS * 10;
    for (const [cacheKey, entry] of cache.entries()) {
      if (entry.timestamp < expiryThreshold) {
        cache.delete(cacheKey);
      }
    }
  }
}

async function persistResolvedPrice(symbol, result) {
  if (!isValidQuoteNumber(result?.priceUsd)) {
    return;
  }

  try {
    await MarketPriceCache.updateOne(
      {
        symbol: String(symbol || "").trim().toUpperCase(),
        quoteCurrency: COINGECKO.QUOTE_CURRENCY,
      },
      {
        $set: {
          provider: result.provider || null,
          providerId: result.providerId || null,
          sourceType: result.sourceType || "live",
          priceUsd: Number(result.priceUsd),
          change24h: Number(result.change24h || 0),
          fallbackPriceUsed: Boolean(result.fallbackPriceUsed),
          metadata: result.metadata || {},
          updatedAt: result.updatedAt ? new Date(result.updatedAt) : new Date(),
        },
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    logger.warn("Failed to persist resolved market price", {
      symbol,
      error: normalizeProviderMessage(error),
    });
  }
}

async function getPersistedPrice(symbol) {
  try {
    const record = await MarketPriceCache.findOne({
      symbol: String(symbol || "").trim().toUpperCase(),
      quoteCurrency: COINGECKO.QUOTE_CURRENCY,
    }).lean();

    if (!record || !isValidQuoteNumber(Number(record.priceUsd))) {
      return null;
    }

    return buildMarketResult(symbol, {
      priceUsd: Number(record.priceUsd),
      change24h: Number(record.change24h || 0),
      updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
      provider: record.provider || null,
      providerId: record.providerId || null,
      sourceType: "cache",
      fallbackPriceUsed: true,
      stale: true,
      metadata: {
        persistedAt: record.updatedAt || record.createdAt || null,
        sourceType: record.sourceType || "live",
        ...(record.metadata || {}),
      },
    });
  } catch (error) {
    logger.warn("Failed to load persisted market price", {
      symbol,
      error: normalizeProviderMessage(error),
    });
    return null;
  }
}

async function fetchJson(url, timeoutMs) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchPrimaryProvider(symbol) {
  const providerId = getMarketProviderId(symbol);
  if (!providerId) {
    throw new Error(`Primary provider id is not configured for ${symbol}`);
  }

  const url = new URL(`${COINGECKO.BASE_URL}/simple/price`);
  url.searchParams.append("ids", providerId);
  url.searchParams.append("vs_currencies", COINGECKO.QUOTE_CURRENCY);
  url.searchParams.append("include_24hr_change", "true");

  stats.increment("market_provider_calls");
  const data = await fetchJson(url.toString(), PROVIDER_TIMEOUT_MS.primary);
  const quote = data?.[providerId];
  const priceUsd = Number(quote?.[COINGECKO.QUOTE_CURRENCY]);
  const change24h = Number(quote?.[`${COINGECKO.QUOTE_CURRENCY}_24h_change`] ?? 0);

  if (!isValidQuoteNumber(priceUsd)) {
    throw new Error(`Primary provider returned no usable price for ${symbol}`);
  }

  return buildMarketResult(symbol, {
    priceUsd,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    provider: "primary_coingecko_simple",
    providerId,
    sourceType: "live",
    fallbackPriceUsed: false,
    stale: false,
    metadata: {
      quoteCurrency: COINGECKO.QUOTE_CURRENCY,
    },
  });
}

async function fetchCoinGeckoFallback(symbol) {
  const providerId = getMarketProviderId(symbol);
  if (!providerId) {
    throw new Error(`CoinGecko fallback id is not configured for ${symbol}`);
  }

  const url = new URL(`${COINGECKO.BASE_URL}/coins/${providerId}`);
  url.searchParams.append("localization", "false");
  url.searchParams.append("tickers", "false");
  url.searchParams.append("market_data", "true");
  url.searchParams.append("community_data", "false");
  url.searchParams.append("developer_data", "false");
  url.searchParams.append("sparkline", "false");

  stats.increment("market_provider_calls");
  const data = await fetchJson(url.toString(), PROVIDER_TIMEOUT_MS.coingecko);
  const marketData = data?.market_data || {};
  const priceUsd = Number(marketData?.current_price?.[COINGECKO.QUOTE_CURRENCY]);
  const change24h = Number(marketData?.price_change_percentage_24h ?? 0);

  if (!isValidQuoteNumber(priceUsd)) {
    throw new Error(`CoinGecko fallback returned no usable price for ${symbol}`);
  }

  return buildMarketResult(symbol, {
    priceUsd,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    provider: "coingecko_free_coin",
    providerId,
    sourceType: "live",
    fallbackPriceUsed: true,
    stale: false,
    metadata: {
      quoteCurrency: COINGECKO.QUOTE_CURRENCY,
    },
  });
}

async function fetchBinanceFallback(symbol) {
  const providerId = getBinanceTickerSymbol(symbol);
  if (!providerId) {
    throw new Error(`Binance ticker is not configured for ${symbol}`);
  }

  const url = new URL(`${BINANCE.BASE_URL}/api/v3/ticker/24hr`);
  url.searchParams.append("symbol", providerId);

  stats.increment("market_provider_calls");
  const data = await fetchJson(url.toString(), PROVIDER_TIMEOUT_MS.binance);
  const priceUsd = Number(data?.lastPrice);
  const change24h = Number(data?.priceChangePercent ?? 0);

  if (!isValidQuoteNumber(priceUsd)) {
    throw new Error(`Binance fallback returned no usable price for ${symbol}`);
  }

  return buildMarketResult(symbol, {
    priceUsd,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    provider: "binance_public_ticker",
    providerId,
    sourceType: "live",
    fallbackPriceUsed: true,
    stale: false,
    metadata: {
      quoteCurrency: COINGECKO.QUOTE_CURRENCY,
    },
  });
}

function buildCacheFallback(symbol, cached, reason, providerErrors = []) {
  if (!cached || !isValidQuoteNumber(Number(cached.priceUsd))) {
    return null;
  }

  return buildMarketResult(symbol, {
    ...cached,
    sourceType: "cache",
    fallbackPriceUsed: true,
    stale: true,
    metadata: {
      ...(cached.metadata || {}),
      fallbackReason: reason,
      providerErrors,
    },
  });
}

function buildStaticFallback(symbol, providerErrors = []) {
  const staticPrice = Number(
    STATIC_FALLBACK_PRICES[resolveCanonicalMarketSymbol(symbol)] || 0,
  );

  if (!isValidQuoteNumber(staticPrice)) {
    return null;
  }

  return buildMarketResult(symbol, {
    priceUsd: staticPrice,
    change24h: 0,
    provider: "static_fallback",
    providerId: resolveCanonicalMarketSymbol(symbol),
    sourceType: "static",
    fallbackPriceUsed: true,
    stale: true,
    metadata: {
      fallbackReason: "configured_static_fallback",
      providerErrors,
    },
  });
}

async function resolveMarketPrice(symbol) {
  const canonicalSymbol = resolveCanonicalMarketSymbol(symbol);
  if (!canonicalSymbol) {
    return buildUnavailableResult(symbol, "Market symbol is missing");
  }

  const memoryState = getMemoryCacheState(canonicalSymbol);
  if (memoryState.cached && !memoryState.expired) {
    return memoryState.cached;
  }

  const inFlightKey = buildMarketCacheKey(canonicalSymbol);
  const existingRequest = marketFetchInFlight.get(inFlightKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const providerAttempts = [
      { name: "primary", fetcher: fetchPrimaryProvider },
      { name: "coingecko_fallback", fetcher: fetchCoinGeckoFallback },
      { name: "binance_fallback", fetcher: fetchBinanceFallback },
    ];
    const providerErrors = [];

    for (let index = 0; index < providerAttempts.length; index += 1) {
      const attempt = providerAttempts[index];

      try {
        const resolved = await attempt.fetcher(canonicalSymbol);
        const normalizedResult = buildMarketResult(canonicalSymbol, {
          ...resolved,
          fallbackPriceUsed: index > 0 || resolved.fallbackPriceUsed === true,
          stale: false,
          metadata: {
            ...(resolved.metadata || {}),
            providerPriority: index + 1,
            providerErrors,
          },
        });

        setMemoryCache(canonicalSymbol, normalizedResult);
        await persistResolvedPrice(canonicalSymbol, normalizedResult);
        return normalizedResult;
      } catch (error) {
        const message = normalizeProviderMessage(error);
        providerErrors.push(`${attempt.name}: ${message}`);
        logger.warn("Market provider attempt failed", {
          symbol: canonicalSymbol,
          provider: attempt.name,
          error: message,
        });
      }
    }

    const staleMemoryFallback = buildCacheFallback(
      canonicalSymbol,
      memoryState.cached,
      "memory_cache_last_known_good",
      providerErrors,
    );
    if (staleMemoryFallback) {
      setMemoryCache(canonicalSymbol, staleMemoryFallback);
      return staleMemoryFallback;
    }

    const persistedFallback = buildCacheFallback(
      canonicalSymbol,
      await getPersistedPrice(canonicalSymbol),
      "database_last_known_good",
      providerErrors,
    );
    if (persistedFallback) {
      setMemoryCache(canonicalSymbol, persistedFallback);
      return persistedFallback;
    }

    const staticFallback = buildStaticFallback(canonicalSymbol, providerErrors);
    if (staticFallback) {
      setMemoryCache(canonicalSymbol, staticFallback);
      return staticFallback;
    }

    return buildUnavailableResult(
      canonicalSymbol,
      `No live, cached, or static fallback price is available for ${canonicalSymbol}`,
      {
        providerErrors,
      },
    );
  })().finally(() => {
    marketFetchInFlight.delete(inFlightKey);
  });

  marketFetchInFlight.set(inFlightKey, request);
  return request;
}

async function getMarketData(symbols = []) {
  const requestedSymbols = Array.isArray(symbols) ? symbols : [];
  const results = {};

  await Promise.all(
    requestedSymbols.map(async (symbol) => {
      const response = await resolveMarketPrice(symbol);
      results[String(symbol || "").toUpperCase()] = response;
    }),
  );

  return results;
}

const RANGE_MAP = {
  "1H": "1",
  "1D": "1",
  "1W": "7",
  "1M": "30",
  "3M": "90",
  "1Y": "365",
  ALL: "max",
};

async function getMarketChart(symbol, range = "1D") {
  const providerId = getMarketProviderId(symbol);
  if (!providerId) {
    return [];
  }

  const days = RANGE_MAP[range] || "1";
  const cacheKey = `chart:${providerId}:${days}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && now - cached.timestamp < CHART_CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = new URL(`${COINGECKO.BASE_URL}/coins/${providerId}/market_chart`);
    url.searchParams.append("vs_currency", COINGECKO.QUOTE_CURRENCY);
    url.searchParams.append("days", days);

    const data = await fetchJson(url.toString(), 8000);
    const prices = (data?.prices || []).map(([timestamp, price]) => ({
      timestamp,
      price: Number(price || 0),
    }));

    cache.set(cacheKey, { data: prices, timestamp: now });
    return prices;
  } catch (error) {
    logger.error("Failed to fetch market chart", {
      symbol,
      range,
      error: normalizeProviderMessage(error),
    });
    return cached ? cached.data : [];
  }
}

async function getMarketStats(symbol) {
  const providerId = getMarketProviderId(symbol);
  if (!providerId) {
    return null;
  }

  const cacheKey = `stats:${providerId}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && now - cached.timestamp < STATS_CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = new URL(`${COINGECKO.BASE_URL}/coins/${providerId}`);
    url.searchParams.append("localization", "false");
    url.searchParams.append("tickers", "false");
    url.searchParams.append("market_data", "true");
    url.searchParams.append("community_data", "false");
    url.searchParams.append("developer_data", "false");
    url.searchParams.append("sparkline", "false");

    const data = await fetchJson(url.toString(), 8000);
    const marketData = data?.market_data || {};
    const statsPayload = {
      priceUsd: Number(marketData?.current_price?.[COINGECKO.QUOTE_CURRENCY] || 0),
      change24h: Number(marketData?.price_change_percentage_24h || 0),
      marketCap: Number(marketData?.market_cap?.[COINGECKO.QUOTE_CURRENCY] || 0),
      volume24h: Number(marketData?.total_volume?.[COINGECKO.QUOTE_CURRENCY] || 0),
      high24h: Number(marketData?.high_24h?.[COINGECKO.QUOTE_CURRENCY] || 0),
      low24h: Number(marketData?.low_24h?.[COINGECKO.QUOTE_CURRENCY] || 0),
      circulatingSupply: Number(marketData?.circulating_supply || 0),
      rank: Number(data?.market_cap_rank || 0),
      updatedAt: new Date(now).toISOString(),
    };

    cache.set(cacheKey, { data: statsPayload, timestamp: now });
    return statsPayload;
  } catch (error) {
    logger.error("Failed to fetch market stats", {
      symbol,
      error: normalizeProviderMessage(error),
    });
    return cached ? cached.data : null;
  }
}

module.exports = {
  getMarketData,
  getMarketChart,
  getMarketStats,
};
