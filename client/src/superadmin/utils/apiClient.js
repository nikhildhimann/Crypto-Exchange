/**
 * Safe Superadmin API Client
 * Wraps all API calls with security, caching, and error handling
 */

import { requestAbortManager, safeFetch } from './requestAbort';
import { requestCache, cachedFetch } from './requestCache';
import { getAccessToken, isSessionActive, safeLog } from './sessionManager';

function isLoopbackHost(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

function resolveConfiguredApiBaseUrl() {
  const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim();

  if (!configuredBaseUrl) {
    throw new Error('VITE_API_BASE_URL must be configured as an absolute URL');
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(configuredBaseUrl);
  } catch (_error) {
    throw new Error('VITE_API_BASE_URL must be a valid absolute URL');
  }

  if (Boolean(import.meta?.env?.PROD) && isLoopbackHost(parsedUrl.hostname)) {
    throw new Error('VITE_API_BASE_URL cannot point to localhost in a production build');
  }

  return parsedUrl.toString().replace(/\/$/, '');
}

const API_BASE_URL = resolveConfiguredApiBaseUrl();
const SUPERADMIN_API_PATH = 'superadmin';
const REQUEST_TIMEOUT_MS = 30000;

class SuperadminAPIClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get full URL for endpoint
   * @param {string} path - Relative path
   * @returns {string} Full URL
   */
  getUrl(path) {
    const normalizedPath = String(path || '').replace(/^\/+/, '');
    const relativePath = normalizedPath
      ? `${SUPERADMIN_API_PATH}/${normalizedPath}`
      : SUPERADMIN_API_PATH;

    return new URL(relativePath, `${this.baseUrl}/`).toString();
  }

  /**
   * Get headers with auth token
   * @returns {object} Headers object
   */
  getHeaders() {
    const headers = { ...this.defaultHeaders };
    const token = getAccessToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Build fetch options
   * @param {object} options - Custom options
   * @returns {object} Fetch options
   */
  buildOptions(options = {}) {
    return {
      headers: this.getHeaders(),
      credentials: 'include',
      ...options,
    };
  }

  /**
   * Make API request with timeout
   * @param {string} url - Full URL
   * @param {object} options - Fetch options
   * @param {string} abortKey - Abort controller key
   * @param {boolean} useCache - Use request cache
   * @returns {Promise<Response>}
   */
  async request(url, options = {}, abortKey, useCache = false) {
    if (!isSessionActive()) {
      throw new Error('Session is not active');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      let response;
      
      if (useCache) {
        response = await cachedFetch(url, {
          ...options,
          signal: controller.signal,
        });
      } else {
        response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
      if (abortKey) {
        requestAbortManager.cancel(abortKey);
      }
    }
  }

  /**
   * GET request
   * @param {string} path - Endpoint path
   * @param {object} params - Query parameters
   * @param {object} options - Request options
   * @returns {Promise<any>}
   */
  async get(path, params = {}, options = {}) {
    const url = new URL(this.getUrl(path));
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });

    const abortKey = `GET_${path}_${JSON.stringify(params)}`;

    try {
      const response = await this.request(
        url.toString(),
        this.buildOptions({ method: 'GET', ...options }),
        abortKey,
        true // Use cache for GET requests
      );

      return response.json();
    } catch (error) {
      safeLog('error', `GET ${path} failed`, error);
      throw error;
    }
  }

  /**
   * POST request
   * @param {string} path - Endpoint path
   * @param {object} data - Request body
   * @param {object} options - Request options
   * @returns {Promise<any>}
   */
  async post(path, data = {}, options = {}) {
    const abortKey = `POST_${path}`;

    try {
      const response = await this.request(
        this.getUrl(path),
        this.buildOptions({
          method: 'POST',
          body: JSON.stringify(data),
          ...options,
        }),
        abortKey,
        false // Never cache POST
      );

      return response.json();
    } catch (error) {
      safeLog('error', `POST ${path} failed`, error);
      throw error;
    }
  }

  /**
   * PUT request
   * @param {string} path - Endpoint path
   * @param {object} data - Request body
   * @param {object} options - Request options
   * @returns {Promise<any>}
   */
  async put(path, data = {}, options = {}) {
    const abortKey = `PUT_${path}`;

    try {
      const response = await this.request(
        this.getUrl(path),
        this.buildOptions({
          method: 'PUT',
          body: JSON.stringify(data),
          ...options,
        }),
        abortKey,
        false
      );

      return response.json();
    } catch (error) {
      safeLog('error', `PUT ${path} failed`, error);
      throw error;
    }
  }

  /**
   * DELETE request
   * @param {string} path - Endpoint path
   * @param {object} options - Request options
   * @returns {Promise<any>}
   */
  async delete(path, options = {}) {
    const abortKey = `DELETE_${path}`;

    try {
      const response = await this.request(
        this.getUrl(path),
        this.buildOptions({
          method: 'DELETE',
          ...options,
        }),
        abortKey,
        false
      );

      return response.json();
    } catch (error) {
      safeLog('error', `DELETE ${path} failed`, error);
      throw error;
    }
  }

  /**
   * Cancel all pending requests
   */
  cancelAll() {
    requestAbortManager.cancelAll();
    requestCache.clear();
  }

  /**
   * Invalidate cache for a pattern
   * @param {RegExp|string} pattern
   */
  invalidateCache(pattern) {
    requestCache.invalidatePattern(pattern);
  }
}

// Singleton instance
const superadminAPIClient = new SuperadminAPIClient();

export { SuperadminAPIClient, superadminAPIClient };
export default superadminAPIClient;
