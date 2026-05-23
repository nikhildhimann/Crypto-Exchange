/**
 * Request Abort Manager
 * Handles AbortController for preventing memory leaks and stale requests
 */

class RequestAbortManager {
  constructor() {
    this.controllers = new Map();
    this.requestTimestamps = new Map();
  }

  /**
   * Create or reuse an AbortController for a given key
   * @param {string} key - Unique identifier for the request
   * @param {boolean} force - Force create new even if exists
   * @returns {AbortController}
   */
  getController(key, force = false) {
    if (force) {
      // Cancel previous request if exists
      this.cancel(key);
    }

    if (!this.controllers.has(key)) {
      this.controllers.set(key, new AbortController());
      this.requestTimestamps.set(key, Date.now());
    }

    return this.controllers.get(key);
  }

  /**
   * Cancel a specific request
   * @param {string} key - Request identifier
   */
  cancel(key) {
    const controller = this.controllers.get(key);
    if (controller) {
      controller.abort();
      this.controllers.delete(key);
      this.requestTimestamps.delete(key);
    }
  }

  /**
   * Cancel all requests
   */
  cancelAll() {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
    this.requestTimestamps.clear();
  }

  /**
   * Check if a request is still active
   * @param {string} key - Request identifier
   * @returns {boolean}
   */
  isActive(key) {
    const controller = this.controllers.get(key);
    return controller && !controller.signal.aborted;
  }

  /**
   * Get signal for fetch/axios
   * @param {string} key - Request identifier
   * @returns {AbortSignal}
   */
  getSignal(key) {
    return this.getController(key).signal;
  }

  /**
   * Clean up old requests (older than specified time)
   * @param {number} maxAgeMs - Maximum age in milliseconds
   */
  cleanup(maxAgeMs = 5 * 60 * 1000) {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, timestamp] of this.requestTimestamps.entries()) {
      if (now - timestamp > maxAgeMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cancel(key);
    }
  }

  /**
   * Get statistics for monitoring
   * @returns {object}
   */
  getStats() {
    return {
      activeRequests: this.controllers.size,
      requestTimestamps: Array.from(this.requestTimestamps.entries()).map(([key, ts]) => ({
        key,
        ageMs: Date.now() - ts,
      })),
    };
  }
}

// Singleton instance
export const requestAbortManager = new RequestAbortManager();

/**
 * Hook for managing request abort signals in React components
 * @param {string} requestKey - Unique key for this request
 * @returns {AbortSignal}
 */
export function useRequestAbort(requestKey) {
  return requestAbortManager.getSignal(requestKey);
}

/**
 * Safe fetch wrapper with abort support
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {string} abortKey - Key for abort controller
 * @returns {Promise}
 */
export async function safeFetch(url, options = {}, abortKey) {
  const controller = requestAbortManager.getController(abortKey, true);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      // Request was cancelled, this is normal
      return null;
    }
    throw error;
  } finally {
    // Clean up controller reference
    requestAbortManager.cancel(abortKey);
  }
}

export default requestAbortManager;
