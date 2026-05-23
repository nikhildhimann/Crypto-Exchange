import { apiRequest } from "./client";
import {
  buildCanonicalTransactionRequest,
  normalizeDestinationValidation,
  normalizeTransactionPreview,
  normalizeTransactionRecord,
} from "./adapters/transaction";

export async function listWalletTransactions(token, walletId, query) {
  return apiRequest(`/transaction/wallet/${walletId}`, {
    token,
    query,
  });
}

export async function listUserTransactions(token, query) {
  return apiRequest("/transaction", {
    token,
    query,
  });
}

export async function syncWalletTransactions(token, walletId) {
  const response = await apiRequest(`/transaction/wallet/${walletId}/sync`, {
    method: "POST",
    token,
  });

  return response.data;
}

export async function getTransactionById(token, transactionId) {
  const response = await apiRequest(`/transaction/${transactionId}`, {
    token,
  });

  return response.data;
}

export async function validateDestination(token, body) {
  const requestBody = buildCanonicalTransactionRequest(body);
  const response = await apiRequest("/transaction/validate-destination", {
    method: "POST",
    token,
    body: requestBody,
  });

  return normalizeDestinationValidation(response.data);
}

export async function previewTransaction(token, body) {
  const requestBody = buildCanonicalTransactionRequest(body);
  const response = await apiRequest("/transaction/preview", {
    method: "POST",
    token,
    body: requestBody,
  });

  return normalizeTransactionPreview(response.data);
}

export async function sendTransaction(token, body) {
  const requestBody = buildCanonicalTransactionRequest(body);
  let response;

  try {
    response = await apiRequest("/transaction/send", {
      method: "POST",
      token,
      body: requestBody,
    });
  } catch (error) {
    const recoverableTransaction =
      error?.payload?.data ||
      error?.payload?.errors?.transaction ||
      error?.payload?.errors?.data ||
      null;

    if (recoverableTransaction) {
      const normalizedRecoverableTransaction = normalizeTransactionRecord(
        recoverableTransaction,
      );

      if (normalizedRecoverableTransaction?.txHash) {
        return normalizedRecoverableTransaction;
      }
    }

    throw error;
  }

  return normalizeTransactionRecord(response.data);
}
