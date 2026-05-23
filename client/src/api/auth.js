import { apiRequest } from "./client";
import { normalizeAuthSession } from "./adapters/auth";

let createSessionInFlight = null;
const refreshSessionInFlight = new Map();

async function requestAuthSession(path, body = {}) {
  const response = await apiRequest(path, {
    method: "POST",
    body,
    skipAuthRefresh: true,
  });

  return normalizeAuthSession(response.data);
}

export async function createSession(body = {}) {
  if (createSessionInFlight) {
    return createSessionInFlight;
  }

  createSessionInFlight = requestAuthSession("/auth/session", body)
    .finally(() => {
      createSessionInFlight = null;
    });

  return createSessionInFlight;
}

export async function refreshSession(body = {}) {
  const requestKey = String(body?.refreshToken || "");

  if (requestKey && refreshSessionInFlight.has(requestKey)) {
    return refreshSessionInFlight.get(requestKey);
  }

  const request = requestAuthSession("/auth/refresh", body)
    .finally(() => {
      if (requestKey) {
        refreshSessionInFlight.delete(requestKey);
      }
    });

  if (requestKey) {
    refreshSessionInFlight.set(requestKey, request);
  }

  return request;
}

export async function logoutSession(token, body = {}) {
  const response = await apiRequest("/auth/logout", {
    method: "POST",
    token,
    body,
    skipAuthRefresh: true,
  });

  return response.data;
}

export async function listSessions(token) {
  const response = await apiRequest("/auth/sessions", {
    token,
  });

  return response.data;
}

export async function revokeSession(token, sessionId) {
  const response = await apiRequest(`/auth/sessions/${sessionId}/revoke`, {
    method: "POST",
    token,
  });

  return response.data;
}
