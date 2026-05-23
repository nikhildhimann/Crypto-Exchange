/**
 * Safe Session Manager
 * Ensures tokens are never exposed in logs or unsafe storage
 */

const SESSION_KEY = '__superadmin_session__';
const TOKEN_KEY = '__superadmin_token__';
const REFRESH_TOKEN_KEY = '__superadmin_refresh_token__';

// Use only in-memory storage for sensitive tokens
let inMemorySession = {
  accessToken: '',
  refreshToken: '',
  sessionId: '',
  expiresAt: '',
};

/**
 * Safely store session tokens in memory only (not localStorage)
 * @param {object} session - Session data
 */
export function storeSessionSecurely(session) {
  if (!session) {
    inMemorySession = {
      accessToken: '',
      refreshToken: '',
      sessionId: '',
      expiresAt: '',
    };
    return;
  }

  // Store only in memory, never in localStorage for sensitive tokens
  inMemorySession = {
    accessToken: session.accessToken || session.token || '',
    refreshToken: session.refreshToken || '',
    sessionId: session.sessionId || '',
    expiresAt: session.expiresAt || session.accessTokenExpiresAt || '',
  };
}

/**
 * Retrieve stored session securely
 * @returns {object} Session data from memory
 */
export function getStoredSession() {
  return { ...inMemorySession };
}

/**
 * Get access token safely
 * @returns {string} Access token
 */
export function getAccessToken() {
  return inMemorySession.accessToken || '';
}

/**
 * Get refresh token safely
 * @returns {string} Refresh token
 */
export function getRefreshToken() {
  return inMemorySession.refreshToken || '';
}

/**
 * Check if session is expired
 * @returns {boolean}
 */
export function isSessionExpired() {
  if (!inMemorySession.expiresAt) {
    return true;
  }

  const expiresAt = new Date(inMemorySession.expiresAt).getTime();
  const now = Date.now();
  const bufferMs = 60 * 1000; // 1 minute buffer

  return now > (expiresAt - bufferMs);
}

/**
 * Clear session completely
 */
export function clearSessionSecurely() {
  inMemorySession = {
    accessToken: '',
    refreshToken: '',
    sessionId: '',
    expiresAt: '',
  };

  // Ensure no localStorage tokens exist
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // Ignore localStorage errors (in case private mode)
  }

  // Also clear sessionStorage if it was used
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // Ignore
  }
}

/**
 * Validate session is still active (not expired)
 * @returns {boolean}
 */
export function isSessionActive() {
  return Boolean(
    inMemorySession.accessToken &&
    inMemorySession.sessionId &&
    !isSessionExpired()
  );
}

/**
 * Sanitize any object for logging (remove sensitive fields)
 * @param {object} obj - Object to sanitize
 * @returns {object} Sanitized copy
 */
export function sanitizeForLogging(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = [
    'token',
    'accessToken',
    'refreshToken',
    'password',
    'passwordHash',
    'seedPhrase',
    'mnemonic',
    'privateKey',
    'secret',
  ];

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  const replacer = (key, value) => {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      return '[REDACTED]';
    }
    if (typeof value === 'object' && value !== null) {
      return sanitizeForLogging(value);
    }
    return value;
  };

  return JSON.parse(JSON.stringify(sanitized, replacer));
}

/**
 * Safe console logging that redacts tokens
 * @param {string} level - Log level (log, warn, error, info)
 * @param {string} message - Log message
 * @param {any} data - Data to log (will be sanitized)
 */
export function safeLog(level = 'log', message, data) {
  if (process.env.NODE_ENV === 'production') {
    return; // Disable verbose logging in production
  }

  const sanitized = data ? sanitizeForLogging(data) : undefined;
  const logFn = console[level] || console.log;

  if (sanitized) {
    logFn(`[Superadmin] ${message}`, sanitized);
  } else {
    logFn(`[Superadmin] ${message}`);
  }
}

export default {
  storeSessionSecurely,
  getStoredSession,
  getAccessToken,
  getRefreshToken,
  isSessionExpired,
  clearSessionSecurely,
  isSessionActive,
  sanitizeForLogging,
  safeLog,
};
