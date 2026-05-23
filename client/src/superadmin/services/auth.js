import { normalizeSuperadminSession } from "./adapters";
import { superadminApiRequest } from "./client";

let loginRequestInFlight = null;
const refreshRequestInFlight = new Map();

async function requestSession(path, body = {}) {
  const response = await superadminApiRequest(path, {
    method: "POST",
    body,
    skipAuthRefresh: true,
  });

  return normalizeSuperadminSession(response.data);
}

export async function loginSuperadmin(body = {}) {
  if (loginRequestInFlight) {
    return loginRequestInFlight;
  }

  loginRequestInFlight = requestSession("/superadmin-auth/login", body).finally(() => {
    loginRequestInFlight = null;
  });

  return loginRequestInFlight;
}

export async function refreshSuperadminSession(body = {}) {
  const requestKey = String(body?.refreshToken || "");

  if (requestKey && refreshRequestInFlight.has(requestKey)) {
    return refreshRequestInFlight.get(requestKey);
  }

  const request = requestSession("/superadmin-auth/refresh", body).finally(() => {
    if (requestKey) {
      refreshRequestInFlight.delete(requestKey);
    }
  });

  if (requestKey) {
    refreshRequestInFlight.set(requestKey, request);
  }

  return request;
}

export async function logoutSuperadminSession(token, body = {}) {
  const response = await superadminApiRequest("/superadmin-auth/logout", {
    method: "POST",
    token,
    body,
    skipAuthRefresh: true,
  });

  return response.data;
}

export async function getCurrentSuperadmin(token) {
  const response = await superadminApiRequest("/superadmin-auth/me", {
    token,
    skipAuthRefresh: true,
  });

  return normalizeSuperadminSession({
    superadmin: response.data,
  }).superadmin;
}
