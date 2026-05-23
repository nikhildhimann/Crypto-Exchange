function resolveConfiguredApiBaseUrl() {
  const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();

  if (!configuredBaseUrl) {
    throw new Error("VITE_API_BASE_URL must be configured as an absolute URL");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(configuredBaseUrl);
  } catch (_error) {
    throw new Error("VITE_API_BASE_URL must be a valid absolute URL");
  }

  const isProductionBuild = Boolean(import.meta?.env?.PROD);

  if (isProductionBuild && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname.toLowerCase())) {
    throw new Error("VITE_API_BASE_URL cannot point to localhost in a production build");
  }

  return parsedUrl.toString().replace(/\/$/, "");
}

export const API_BASE_URL = resolveConfiguredApiBaseUrl();
const REQUEST_TIMEOUT_MS = 15000;

let authController = {
  getAccessToken: () => "",
  getRefreshToken: () => "",
  refreshSession: async () => null,
  logout: async () => null,
};
let refreshInFlightPromise = null;

function buildUrl(path, query) {
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  const url = new URL(normalizedPath, `${API_BASE_URL}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function configureApiClientSession(nextController = {}) {
  authController = {
    ...authController,
    ...nextController,
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Request timed out while contacting the API server");
      timeoutError.status = 0;
      timeoutError.code = "REQUEST_TIMEOUT";
      throw timeoutError;
    }

    if (error instanceof TypeError) {
      const networkError = new Error("Unable to reach the API server");
      networkError.status = 0;
      networkError.code = "NETWORK_ERROR";
      throw networkError;
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function performRequest(path, options = {}, accessTokenOverride) {
  const { method = "GET", token, body, query, headers = {} } = options;
  const authToken =
    accessTokenOverride || authController.getAccessToken?.() || token || "";
  const response = await fetchWithTimeout(buildUrl(path, query), {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    const message = payload?.message || "Request failed";
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function apiRequest(
  path,
  {
    method = "GET",
    token,
    body,
    query,
    headers,
    skipAuthRefresh = false,
    _retry = false,
  } = {},
) {
  try {
    return await performRequest(path, { method, token, body, query, headers });
  } catch (error) {
    const hasRefreshToken = Boolean(authController.getRefreshToken?.());
    const shouldAttemptRefresh =
      error?.status === 401 && !skipAuthRefresh && !_retry && hasRefreshToken;

    if (!shouldAttemptRefresh) {
      if (error?.status === 401 && !skipAuthRefresh) {
        await authController.logout?.({ reason: "unauthorized" }).catch(() => null);
      }

      throw error;
    }

    try {
      if (!refreshInFlightPromise) {
        refreshInFlightPromise = Promise.resolve(authController.refreshSession?.()).finally(() => {
          refreshInFlightPromise = null;
        });
      }

      await refreshInFlightPromise;
    } catch (refreshError) {
      await authController.logout?.({ reason: "refresh_failed" }).catch(() => null);
      throw refreshError;
    }

    return performRequest(
      path,
      { method, token, body, query, headers },
      authController.getAccessToken?.() || "",
    );
  }
}
