import { apiRequest } from "./client";
import { normalizeSupportedChains } from "./adapters/chains";
import {
  normalizeReceivePayload,
  normalizeReceiveQr,
  normalizeWalletCreateInit,
  normalizeWalletDetails,
  normalizeWalletList,
  normalizeWalletProvisioningResult,
} from "./adapters/wallet";

const DEFAULT_WALLET_PAGE_SIZE = 100;

export async function listWallets(token, query) {
  const requestedQuery = query && typeof query === "object" ? { ...query } : {};
  const hasExplicitPagination =
    requestedQuery.page !== undefined || requestedQuery.limit !== undefined;

  const firstResponse = await apiRequest("/wallet", {
    token,
    query: hasExplicitPagination
      ? requestedQuery
      : {
          ...requestedQuery,
          page: 0,
          limit: DEFAULT_WALLET_PAGE_SIZE,
        },
  });

  if (hasExplicitPagination) {
    return normalizeWalletList(firstResponse.data);
  }

  const firstPageWallets = Array.isArray(firstResponse.data) ? firstResponse.data : [];
  const totalPages = Number(firstResponse.meta?.totalPages || 1);

  if (totalPages <= 1) {
    return normalizeWalletList(firstPageWallets);
  }

  const remainingPageResponses = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      apiRequest("/wallet", {
        token,
        query: {
          ...requestedQuery,
          page: index + 1,
          limit: DEFAULT_WALLET_PAGE_SIZE,
        },
      }),
    ),
  );

  const remainingWallets = remainingPageResponses.flatMap((response) =>
    Array.isArray(response.data) ? response.data : [],
  );

  return normalizeWalletList([...firstPageWallets, ...remainingWallets]);
}

export async function getWalletDetails(token, walletId) {
  const response = await apiRequest(`/wallet/${walletId}`, { token });
  return normalizeWalletDetails(response.data);
}

export async function getSupportedChains(token) {
  const response = await apiRequest("/wallet/supported-chains", { token });
  return normalizeSupportedChains(response.data);
}

export async function createWalletInit(token, body) {
  const response = await apiRequest("/wallet/create/init", {
    method: "POST",
    token,
    body,
  });

  return normalizeWalletCreateInit(response.data);
}

export async function confirmWalletCreate(token, body) {
  const response = await apiRequest("/wallet/create/confirm", {
    method: "POST",
    token,
    body,
  });

  return normalizeWalletProvisioningResult(response.data);
}

export async function importWallet(token, body) {
  const response = await apiRequest("/wallet/import", {
    method: "POST",
    token,
    body,
  });

  return normalizeWalletProvisioningResult(response.data);
}

export async function createHbarWalletOnDemand(token, body) {
  const response = await apiRequest("/wallet/hbar/on-demand", {
    method: "POST",
    token,
    body,
  });

  return normalizeWalletProvisioningResult(response.data);
}

export async function fetchReceivePayload(token, walletId, amount, query = {}) {
  const response = await apiRequest(`/wallet/${walletId}/receive`, {
    token,
    query: { amount, ...query },
  });

  return normalizeReceivePayload(response.data);
}

export async function fetchReceiveQr(token, walletId, amount, query = {}) {
  const response = await apiRequest(`/wallet/${walletId}/receive/qr`, {
    token,
    query: { amount, ...query },
  });

  return normalizeReceiveQr(response.data);
}
