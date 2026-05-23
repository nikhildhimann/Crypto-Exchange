function normalizeSyncLimit(limit, defaultLimit = 50, maxLimit = 100) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}

async function syncWalletHistory({
  chain,
  network,
  walletAddress,
  limit,
  defaultLimit = 50,
  maxLimit = 100,
  discoverManagedAddresses,
  fetchAddressReferences,
  buildReferenceIdentity,
  fetchDetailedHistoryEntry,
  sortEntries = null,
} = {}) {
  if (typeof discoverManagedAddresses !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} discovery is required`);
  }

  if (typeof fetchAddressReferences !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} history reference fetcher is required`);
  }

  if (typeof buildReferenceIdentity !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} history identity builder is required`);
  }

  if (typeof fetchDetailedHistoryEntry !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} history detail fetcher is required`);
  }

  const normalizedLimit = normalizeSyncLimit(limit, defaultLimit, maxLimit);
  const discovery = await discoverManagedAddresses({
    chain,
    network,
    walletAddress,
  });
  const managedAddresses = Array.isArray(discovery?.managedAddresses)
    ? discovery.managedAddresses
    : [];
  const settledReferences = await Promise.all(
    managedAddresses.map(async (entry) => ({
      entry,
      references: await fetchAddressReferences({
        chain,
        network,
        walletAddress,
        addressEntry: entry,
        limit: normalizedLimit,
        discovery,
      }),
    })),
  );
  const uniqueReferences = new Map();

  for (const { entry, references } of settledReferences) {
    for (const reference of Array.isArray(references) ? references : []) {
      const referenceIdentity = buildReferenceIdentity({
        chain,
        network,
        walletAddress,
        addressEntry: entry,
        reference,
        discovery,
      });
      if (!referenceIdentity || uniqueReferences.has(referenceIdentity)) {
        continue;
      }

      uniqueReferences.set(referenceIdentity, {
        addressEntry: entry,
        reference,
      });
    }
  }

  const entries = await Promise.all(
    Array.from(uniqueReferences.entries())
      .slice(0, normalizedLimit)
      .map(async ([referenceIdentity, referenceEntry]) =>
        fetchDetailedHistoryEntry({
          chain,
          network,
          walletAddress,
          discovery,
          referenceIdentity,
          referenceEntry,
          limit: normalizedLimit,
        }),
      ),
  );
  const filteredEntries = entries.filter(Boolean);

  return typeof sortEntries === "function"
    ? filteredEntries.sort(sortEntries)
    : filteredEntries;
}

module.exports = {
  normalizeSyncLimit,
  syncWalletHistory,
};
