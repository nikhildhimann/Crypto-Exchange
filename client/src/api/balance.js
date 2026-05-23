import { apiRequest } from "./client";

export async function listBalances(token, options = {}) {
  const query =
    options && typeof options === "object" && options.force === true
      ? { force: "true" }
      : undefined;
  return apiRequest("/balance", { token, query });
}

export async function getWalletBalance(token, walletId, options = {}) {
  const query =
    options && typeof options === "object" && options.force === true
      ? { force: "true" }
      : undefined;
  const response = await apiRequest(`/balance/${walletId}`, {
    token,
    query,
  });
  return response.data;
}
