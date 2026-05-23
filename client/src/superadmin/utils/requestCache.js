/**
 * Request Cache & Deduplication Manager
 * Prevents duplicate requests and caches results for better performance
 */

class RequestCache {
  constructor(defaultTtlMs = 30000) {
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Generate cache key from URL and options
   * @param {string} url - Request URL
   * @param {object} options - Request options
   * @returns {string} Cache key
   */
  generateKey(url, options = {}) {
    const params = new URLSearchParams();
    
    if (options.method && options.method.toUpperCase() !== 'GET') {
      params.append('method', options.method);
    }
    
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        params.append(key, String(value));
      });
    }

    return `${url}?${params.toString()}`;
  }

  /**
   * Get cached value if exists and not expired
   * @param {string} key - Cache key
   * @returns {any} Cached value or null
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set cache value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, value, ttlMs = this.defaultTtlMs) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Get existing pending request or null
   * @param {string} key - Request key
   * @returns {Promise} Pending promise or null
   */
  getPending(key) {
    return this.pendingRequests.get(key) || null;
  }

  /**
   * Track a pending request
   * @param {string} key - Request key
   * @param {Promise} promise - Request promise
   */
  setPending(key, promise) {
    this.pendingRequests.set(key, promise);
    promise
      .finally(() => this.pendingRequests.delete(key))
      .catch(() => {}); // Ignore errors during cleanup
  }

  /**
   * Invalidate cache entry
   * @param {string} key - Cache key
   */
  invalidate(key) {
    this.cache.delete(key);
    this.pendingRequests.delete(key);
  }

  /**
   * Invalidate all cache entries matching pattern
   * @param {RegExp|string} pattern - Pattern to match keys against
   */
  invalidatePattern(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
    
    for (const key of this.pendingRequests.keys()) {
      if (regex.test(key)) {
        this.pendingRequests.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Get cache statistics
   * @returns {object}
   */
  getStats() {
    return {
      cachedItems: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      cacheEntries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        expiresIn: entry.expiresAt - Date.now(),
      })),
    };
  }
}

// Singleton instance
const requestCache = new RequestCache();

/**
 * Fetch with automatic caching and deduplication
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} cacheTtlMs - Cache TTL in milliseconds
 * @param {boolean} useCache - Whether to use cache
 * @returns {Promise<Response>}
 */
export async function cachedFetch(
  url,
  options = {},
  cacheTtlMs = 30000,
  useCache = true
) {
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = requestCache.generateKey(url, options);

  // Only cache GET requests
  if (useCache && method === 'GET') {
    // Check if result is already cached
    const cached = requestCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if request is already pending (deduplicate)
    const pending = requestCache.getPending(cacheKey);
    if (pending) {
      return pending;
    }
  }

  // Make the request
  const fetchPromise = fetch(url, options);
  
  if (useCache && method === 'GET') {
    requestCache.setPending(cacheKey, fetchPromise);
    
    // Cache successful responses
    const response = await fetchPromise;
    if (response.ok) {
      const cloned = response.clone();
      requestCache.set(cacheKey, response, cacheTtlMs);
    }
    
    return response;
  }

  return fetchPromise;
}

/**
 * Hook for managing request cache in components
 */
export function useRequestCache() {
  return {
    get: (key) => requestCache.get(key),
    set: (key, value, ttl) => requestCache.set(key, value, ttl),
    invalidate: (key) => requestCache.invalidate(key),
    invalidatePattern: (pattern) => requestCache.invalidatePattern(pattern),
    clear: () => requestCache.clear(),
    getStats: () => requestCache.getStats(),
  };
}

export { requestCache, RequestCache };
export default requestCache;
