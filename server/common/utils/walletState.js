const DEFAULT_WALLET_STATE = Object.freeze({
  isPrimary: false,
  isDefaultForChain: false,
  hidden: false,
  archived: false,
});

function normalizeBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return Boolean(value);
}

function getWalletMetadata(walletOrMetadata = {}) {
  if (walletOrMetadata?.metadata && typeof walletOrMetadata.metadata === "object") {
    return walletOrMetadata.metadata;
  }

  return walletOrMetadata && typeof walletOrMetadata === "object" ? walletOrMetadata : {};
}

function getWalletState(walletOrMetadata = {}) {
  const metadata = getWalletMetadata(walletOrMetadata);
  const storedState =
    metadata.walletState && typeof metadata.walletState === "object"
      ? metadata.walletState
      : {};
  const isPrimaryFromProvisioning = Boolean(metadata.provisioning?.isPrimaryTarget);

  return {
    isPrimary: normalizeBoolean(storedState.isPrimary, isPrimaryFromProvisioning),
    isDefaultForChain: normalizeBoolean(
      storedState.isDefaultForChain,
      isPrimaryFromProvisioning,
    ),
    hidden: normalizeBoolean(storedState.hidden, false),
    archived: normalizeBoolean(storedState.archived, false),
  };
}

function mergeWalletState(metadata = {}, patch = {}) {
  const currentState = getWalletState(metadata);
  return {
    ...metadata,
    walletState: {
      ...DEFAULT_WALLET_STATE,
      ...currentState,
      ...patch,
    },
  };
}

function buildWalletVisibilityFilter({
  includeHidden = false,
  includeArchived = false,
} = {}) {
  const filter = {};

  if (!includeHidden) {
    filter["metadata.walletState.hidden"] = { $ne: true };
  }

  if (!includeArchived) {
    filter["metadata.walletState.archived"] = { $ne: true };
  }

  return filter;
}

function isWalletArchived(wallet) {
  return getWalletState(wallet).archived === true;
}

module.exports = {
  DEFAULT_WALLET_STATE,
  getWalletState,
  mergeWalletState,
  buildWalletVisibilityFilter,
  isWalletArchived,
};
