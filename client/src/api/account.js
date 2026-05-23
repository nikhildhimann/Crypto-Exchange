import { apiRequest } from "./client";
import { normalizeAccount, normalizeAccountList } from "./adapters/account";

function normalizeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function resolveTokenAndQuery(tokenOrParams, maybeParams) {
  if (maybeParams !== undefined) {
    return {
      token: tokenOrParams,
      query: maybeParams,
    };
  }

  if (tokenOrParams && typeof tokenOrParams === "object" && !Array.isArray(tokenOrParams)) {
    return {
      token: undefined,
      query: tokenOrParams,
    };
  }

  return {
    token: tokenOrParams,
    query: undefined,
  };
}

function resolveTokenAndBody(tokenOrBody, maybeBody) {
  if (maybeBody !== undefined) {
    return {
      token: tokenOrBody,
      body: maybeBody,
    };
  }

  return {
    token: undefined,
    body: tokenOrBody,
  };
}

function resolveTokenAndId(tokenOrAccountId, maybeAccountId) {
  if (maybeAccountId !== undefined) {
    return {
      token: tokenOrAccountId,
      accountId: maybeAccountId,
    };
  }

  return {
    token: undefined,
    accountId: tokenOrAccountId,
  };
}

function normalizeAccountMutationResponse(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};

  return {
    account: normalizeAccount(source.account || source),
    mnemonic: normalizeString(source.mnemonic).trim() || null,
  };
}

export async function fetchAccounts(tokenOrParams, maybeParams) {
  const { token, query } = resolveTokenAndQuery(tokenOrParams, maybeParams);
  const response = await apiRequest("/accounts", {
    token,
    query,
  });

  return normalizeAccountList(response.data);
}

export async function getAccountById(tokenOrAccountId, maybeAccountId) {
  const { token, accountId } = resolveTokenAndId(tokenOrAccountId, maybeAccountId);
  const response = await apiRequest(`/accounts/${accountId}`, {
    token,
  });

  return normalizeAccount(response.data);
}

export async function generateAccountMnemonic(token) {
  const response = await apiRequest("/accounts/mnemonic", { token });
  const mnemonic = response?.data?.mnemonic;
  if (typeof mnemonic !== "string" || !mnemonic.trim()) {
    throw new Error("Server returned an invalid mnemonic");
  }
  return mnemonic.trim();
}

export async function createAccount(tokenOrPayload, maybePayload) {
  const { token, body } = resolveTokenAndBody(tokenOrPayload, maybePayload);
  const response = await apiRequest("/accounts", {
    method: "POST",
    token,
    body,
  });

  return normalizeAccountMutationResponse(response.data);
}

export async function updateAccount(tokenOrAccountId, accountIdOrBody, maybeBody) {
  let token;
  let accountId;
  let body;

  if (maybeBody !== undefined) {
    token = tokenOrAccountId;
    accountId = accountIdOrBody;
    body = maybeBody;
  } else {
    token = undefined;
    accountId = tokenOrAccountId;
    body = accountIdOrBody;
  }

  const response = await apiRequest(`/accounts/${accountId}`, {
    method: "PATCH",
    token,
    body,
  });

  return normalizeAccount(response.data);
}

export async function importAccount(tokenOrPayload, maybePayload) {
  const { token, body } = resolveTokenAndBody(tokenOrPayload, maybePayload);
  const response = await apiRequest("/accounts/import", {
    method: "POST",
    token,
    body,
  });

  return normalizeAccountMutationResponse(response.data);
}

export async function archiveAccount(tokenOrAccountId, maybeAccountId) {
  const { token, accountId } = resolveTokenAndId(tokenOrAccountId, maybeAccountId);
  const response = await apiRequest(`/accounts/${accountId}`, {
    method: "DELETE",
    token,
  });

  return normalizeAccountMutationResponse(response.data);
}
export async function rollbackIncompleteAccount(tokenOrAccountId, maybeAccountId) {
  const { token, accountId } = resolveTokenAndId(tokenOrAccountId, maybeAccountId);
  const response = await apiRequest(`/accounts/${accountId}/incomplete`, {
    method: "DELETE",
    token,
  });

  return normalizeAccount(response.data);
}