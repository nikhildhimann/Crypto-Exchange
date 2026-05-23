const SETUP_INTENT_KEY = "aura_account_setup_intent";
const PENDING_SETUP_KEY = "aura_pending_account_setup";
const SETUP_STATE_TTL_MS = 30 * 60 * 1000;

function canUseBrowserStorage() {
  return typeof window !== "undefined" && Boolean(window.sessionStorage);
}

function normalizeMode(value) {
  return value === "create" || value === "restore" ? value : "";
}

function isFreshTimestamp(value) {
  const timestamp = Number(value);

  return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp <= SETUP_STATE_TTL_MS;
}

function readJson(key) {
  if (!canUseBrowserStorage()) {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(key);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === "object" ? parsedValue : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    if (!value) {
      window.sessionStorage.removeItem(key);
      return;
    }

    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore browser storage failures and let the flow continue in memory.
  }
}

export function clearSetupIntent() {
  writeJson(SETUP_INTENT_KEY, null);
}

export function readSetupIntent() {
  const storedValue = readJson(SETUP_INTENT_KEY);
  const mode = normalizeMode(storedValue?.mode);

  if (!mode || !isFreshTimestamp(storedValue?.createdAt)) {
    clearSetupIntent();
    return null;
  }

  return {
    mode,
    chain: typeof storedValue?.chain === "string" ? storedValue.chain : "",
    network: typeof storedValue?.network === "string" ? storedValue.network : "",
    createdAt: Number(storedValue.createdAt),
  };
}

export function beginSetupIntent(mode, { resetPending = false, chain = "", network = "" } = {}) {
  const normalizedMode = normalizeMode(mode);
  if (!normalizedMode) {
    clearSetupIntent();
    return null;
  }

  if (resetPending) {
    clearPendingAccountSetup();
  }

  const nextIntent = {
    mode: normalizedMode,
    chain: typeof chain === "string" ? chain.trim().toLowerCase() : "",
    network: typeof network === "string" ? network.trim().toLowerCase() : "",
    createdAt: Date.now(),
  };

  writeJson(SETUP_INTENT_KEY, nextIntent);
  return nextIntent;
}

export function clearPendingAccountSetup() {
  writeJson(PENDING_SETUP_KEY, null);
}

export function readPendingAccountSetup() {
  const storedValue = readJson(PENDING_SETUP_KEY);
  const mode = normalizeMode(storedValue?.mode);
  const mnemonic = typeof storedValue?.mnemonic === "string" ? storedValue.mnemonic.trim() : "";

  // TTL and mnemonic are always required
  if (!mode || !mnemonic || !isFreshTimestamp(storedValue?.createdAt)) {
    clearPendingAccountSetup();
    return null;
  }

  const accountId = typeof storedValue?.accountId === "string" ? storedValue.accountId.trim() : "";

  // restore mode always requires accountId (backend flow hasn't changed)
  if (mode === "restore" && !accountId) {
    clearPendingAccountSetup();
    return null;
  }

  // create mode: accountId is optional here — it will be populated at confirm step
  return {
    ...storedValue,
    mode,
    accountId,
    mnemonic,
    label: typeof storedValue?.label === "string" ? storedValue.label : "",
    chain: typeof storedValue?.chain === "string" ? storedValue.chain : "",
    network: typeof storedValue?.network === "string" ? storedValue.network : "",
    createdAt: Number(storedValue.createdAt),
  };
}

export function writePendingAccountSetup(value) {
  if (!value) {
    clearPendingAccountSetup();
    return null;
  }

  const mode = normalizeMode(value.mode);
  const mnemonic = String(value.mnemonic || value.recoveryPhrase || "").trim();

  if (!mode || !mnemonic) {
    clearPendingAccountSetup();
    return null;
  }

  // accountId is optional for create mode (populated at confirm); required for restore
  const accountId = String(value.accountId || value.account?.id || value.account?.accountId || "").trim();

  if (mode === "restore" && !accountId) {
    clearPendingAccountSetup();
    return null;
  }

  const nextValue = {
    ...value,
    mode,
    accountId,
    mnemonic,
    createdAt: Date.now(),
  };

  writeJson(PENDING_SETUP_KEY, nextValue);
  return nextValue;
}
