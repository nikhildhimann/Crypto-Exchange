async function aggregateWalletBalance({
  chain,
  network,
  walletAddress,
  discoverManagedAddresses,
  fetchAddressState,
  buildBalanceResult,
} = {}) {
  if (typeof discoverManagedAddresses !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} discovery is required`);
  }

  if (typeof fetchAddressState !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} balance fetcher is required`);
  }

  if (typeof buildBalanceResult !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} balance result builder is required`);
  }

  const discovery = await discoverManagedAddresses({
    chain,
    network,
    walletAddress,
  });
  const managedAddresses = Array.isArray(discovery?.managedAddresses)
    ? discovery.managedAddresses
    : [];
  const settled = await Promise.all(
    managedAddresses.map(async (entry) => ({
      entry,
      state: await fetchAddressState({
        chain,
        network,
        walletAddress,
        addressEntry: entry,
        discovery,
      }),
    })),
  );

  const totals = settled.reduce(
    (accumulator, { state }) => {
      const baseUnitBalance = BigInt(String(state?.baseUnitBalance || "0"));
      const availableBaseUnits = BigInt(String(state?.availableBaseUnits || "0"));
      const rentExemptMinimumBaseUnits = BigInt(
        String(state?.rentExemptMinimumBaseUnits || "0"),
      );

      accumulator.baseUnitBalance += baseUnitBalance;
      accumulator.availableBaseUnits += availableBaseUnits;
      accumulator.rentExemptMinimumBaseUnits += rentExemptMinimumBaseUnits;
      accumulator.exists = accumulator.exists || state?.exists === true;
      accumulator.confirmed = accumulator.confirmed && state?.confirmed !== false;
      return accumulator;
    },
    {
      baseUnitBalance: 0n,
      availableBaseUnits: 0n,
      rentExemptMinimumBaseUnits: 0n,
      exists: false,
      confirmed: true,
    },
  );

  return buildBalanceResult({
    chain,
    network,
    walletAddress,
    discovery,
    managedAddresses,
    settled,
    totals: {
      baseUnitBalance: totals.baseUnitBalance.toString(),
      availableBaseUnits: totals.availableBaseUnits.toString(),
      rentExemptMinimumBaseUnits: totals.rentExemptMinimumBaseUnits.toString(),
      exists: totals.exists,
      confirmed: totals.confirmed,
    },
  });
}

module.exports = {
  aggregateWalletBalance,
};
