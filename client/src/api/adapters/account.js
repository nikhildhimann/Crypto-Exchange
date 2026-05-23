function normalizeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeNullableString(value) {
  const normalizedValue = normalizeString(value).trim();
  return normalizedValue || null;
}

function normalizeAccountSource(payload = {}) {
  if (payload && typeof payload === "object" && payload.account && typeof payload.account === "object") {
    return payload.account;
  }

  return payload && typeof payload === "object" ? payload : {};
}

export function normalizeAccount(payload = {}) {
  const account = normalizeAccountSource(payload);

  return {
    id: normalizeNullableString(account.id || account.accountId || account._id),
    name: normalizeString(account.name).trim(),
    type: normalizeNullableString(account.type)?.toLowerCase() || null,
    status: normalizeNullableString(account.status)?.toLowerCase() || null,
    userId: normalizeNullableString(account.userId || account.user?._id || account.user?.id),
    mnemonicFingerprint: normalizeNullableString(account.mnemonicFingerprint),
    createdAt: normalizeNullableString(account.createdAt),
    updatedAt: normalizeNullableString(account.updatedAt),
  };
}

export function normalizeAccountList(payload = []) {
  if (Array.isArray(payload)) {
    return payload.map((account) => normalizeAccount(account));
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.accounts)) {
      return payload.accounts.map((account) => normalizeAccount(account));
    }

    if (Array.isArray(payload.items)) {
      return payload.items.map((account) => normalizeAccount(account));
    }
  }

  return [];
}
