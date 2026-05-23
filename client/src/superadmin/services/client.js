import { API_BASE_URL } from "../../api/client";

const REQUEST_TIMEOUT_MS = 15000;

let sessionController = {
  getAccessToken: () => "",
  getRefreshToken: () => "",
  refreshSession: async () => null,
  logout: async () => null,
};
let refreshInFlightPromise = null;

function buildUrl(path, query) {
  const url = new URL(`${API_BASE_URL}${path}`);

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

export function configureSuperadminApiClientSession(nextController = {}) {
  sessionController = {
    ...sessionController,
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
  const { method = "GET", token, body, query } = options;
  const authToken =
    accessTokenOverride || sessionController.getAccessToken?.() || token || "";
  const response = await fetchWithTimeout(buildUrl(path, query), {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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

export async function superadminApiRequest(
  path,
  { method = "GET", token, body, query, skipAuthRefresh = false, _retry = false } = {},
) {
  try {
    return await performRequest(path, { method, token, body, query });
  } catch (error) {
    const hasRefreshToken = Boolean(sessionController.getRefreshToken?.());
    const shouldAttemptRefresh =
      error?.status === 401 && !skipAuthRefresh && !_retry && hasRefreshToken;

    if (!shouldAttemptRefresh) {
      if (error?.status === 401 && !skipAuthRefresh) {
        await sessionController.logout?.({ reason: "unauthorized" }).catch(() => null);
      }

      throw error;
    }

    try {
      if (!refreshInFlightPromise) {
        refreshInFlightPromise = Promise.resolve(sessionController.refreshSession?.()).finally(() => {
          refreshInFlightPromise = null;
        });
      }

      await refreshInFlightPromise;
    } catch (refreshError) {
      await sessionController.logout?.({ reason: "refresh_failed" }).catch(() => null);
      throw refreshError;
    }

    return performRequest(
      path,
      { method, token, body, query },
      sessionController.getAccessToken?.() || "",
    );
  }
}
