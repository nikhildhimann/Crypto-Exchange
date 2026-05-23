const client = require("./client");
const transaction = require("./transaction");
const utxo = require("../utxo");
const wallet = require("./wallet");
const amount = require("./amount");

function buildCanonicalBalance({
  baseUnitBalance = "0",
  availableBaseUnits = "0",
  rentExemptMinimumBaseUnits = "0",
  exists = false,
  confirmed = false,
  raw = {},
} = {}) {
  return {
    baseUnitBalance: String(baseUnitBalance),
    availableBaseUnits: String(availableBaseUnits),
    rentExemptMinimumBaseUnits: String(rentExemptMinimumBaseUnits),
    exists: Boolean(exists),
    confirmed: Boolean(confirmed),
    raw: raw && typeof raw === "object" ? raw : {},
  };
}

async function aggregateManagedBalance({ adaClient, network, address, runtimeContext }) {
  return utxo.aggregateWalletBalance({
    chain: "ada",
    network,
    walletAddress: address,
    discoverManagedAddresses: async () => runtimeContext,
    fetchAddressState: async ({ addressEntry }) => {
      const [addressInfo, utxos] = await Promise.all([
        adaClient.fetchAddressInfo(addressEntry.address).catch(() => null),
        adaClient.fetchAddressUtxos(addressEntry.address).catch(() => []),
      ]);

      return {
        exists: Boolean(addressInfo),
        confirmed: true,
        baseUnitBalance: addressInfo
          ? amount.resolveLovelaceBalance(addressInfo.amount)
          : "0",
        availableBaseUnits: addressInfo
          ? amount.resolveLovelaceBalance(addressInfo.amount)
          : "0",
        rentExemptMinimumBaseUnits: "0",
        raw: {
          addressInfo,
          utxos: Array.isArray(utxos) ? utxos : [],
        },
      };
    },
    buildBalanceResult: ({
      settled,
      managedAddresses,
      totals,
    }) => {
      const existingAddresses = settled.filter(
        ({ state }) => state?.exists === true,
      );

      if (!existingAddresses.length) {
        return buildCanonicalBalance({
          baseUnitBalance: "0",
          availableBaseUnits: "0",
          rentExemptMinimumBaseUnits: "0",
          exists: false,
          confirmed: true,
          raw: {
            address,
            network,
            baseUrl: adaClient.baseUrl,
            addressInfo: null,
            managedAddressCount: managedAddresses.length,
            aggregatedAddresses: managedAddresses.map((entry) => ({
              address: entry.address,
              branch: Number(entry.branch || 0),
              addressIndex: Number(entry.addressIndex || 0),
              purpose: String(entry.purpose || "receive"),
              isChange: entry.isChange === true,
            })),
            utxoCount: 0,
          },
        });
      }

      return buildCanonicalBalance({
        baseUnitBalance: totals.baseUnitBalance,
        availableBaseUnits: totals.availableBaseUnits,
        rentExemptMinimumBaseUnits: totals.rentExemptMinimumBaseUnits,
        exists: totals.exists,
        confirmed: totals.confirmed,
        raw: {
          address,
          network,
          baseUrl: adaClient.baseUrl,
          managedAddressCount: managedAddresses.length,
          type: existingAddresses[0]?.state?.raw?.addressInfo?.type || null,
          stakeAddress:
            existingAddresses[0]?.state?.raw?.addressInfo?.stake_address || null,
          controlledAmount: totals.baseUnitBalance,
          utxoCount: settled.reduce(
            (sum, entry) => sum + entry.state.raw.utxos.length,
            0,
          ),
          aggregatedAddresses: settled.map(({ entry, state }) => ({
            address: entry.address,
            branch: Number(entry.branch || 0),
            addressIndex: Number(entry.addressIndex || 0),
            purpose: String(entry.purpose || "receive"),
            isChange: entry.isChange === true,
            exists: state.exists === true,
            baseUnitBalance: state.baseUnitBalance,
            amount: Array.isArray(state.raw.addressInfo?.amount)
              ? state.raw.addressInfo.amount
              : [],
            utxoCount: state.raw.utxos.length,
          })),
        },
      });
    },
  });
}

function shouldAttemptManagedAddressRecovery(runtimeContext, balanceResult) {
  const walletRecord = runtimeContext?.walletRecord || {};
  const derivation = walletRecord.metadata?.derivation || {};
  const hasAccountPublicKey = Boolean(String(derivation.accountPublicKeyBech32 || "").trim());
  const isImportedAdaWallet = walletRecord.isImported === true;
  const managedAddressCount = Number(runtimeContext?.managedAddresses?.length || 0);

  if (!hasAccountPublicKey) {
    return false;
  }

  if (walletRecord.metadata?.provisioning?.status === "pending_recovery") {
    return true;
  }

  const isZeroBalance = balanceResult?.exists === false || String(balanceResult?.baseUnitBalance || "0") === "0";
  const isShallow = managedAddressCount <= 3;
  const hasAccountAwareMetadata = Number.isFinite(Number(derivation.account));

  if (balanceResult?.exists === false) {
    return true;
  }

  if (isImportedAdaWallet && isZeroBalance) {
    return true;
  }

  if (isShallow) {
    return true;
  }

  if (hasAccountAwareMetadata && isShallow) {
    return true;
  }

  return false;
}
async function fetchBalance(input) {
  const network = client.normalizeNetwork(input.network);
  const address = String(input.address || "").trim();

  if (!address) {
    throw new Error("ADA address is required");
  }

  try {
    const adaClient = client.getClient(network);
    let runtimeContext = await transaction.ensureRuntimeWalletContext({
      network,
      fromAddress: address,
      persistChangeAddress: false,
    });

    let balanceResult = await aggregateManagedBalance({
      adaClient,
      network,
      address,
      runtimeContext,
    });

    let shouldRecover = false;
    const lastRecovery = runtimeContext.walletRecord?.metadata?.provisioning?.lastRecoveryAttemptAt;
    const cooldownMs = 5 * 60 * 1000;

    if (shouldAttemptManagedAddressRecovery(runtimeContext, balanceResult)) {
      if (!lastRecovery || (Date.now() - new Date(lastRecovery).getTime() >= cooldownMs)) {
        shouldRecover = true;
      }
    }

    if (shouldRecover) {
      await transaction.discoverManagedAddressesByGapLimit({
        network,
        fromAddress: address,
        walletRecord: runtimeContext.walletRecord,
        gapLimit: 20,
        maxReceiveScanCount: 128,
        maxChangeScanCount: 64,
      });

      runtimeContext = await transaction.ensureRuntimeWalletContext({
        network,
        fromAddress: address,
        walletRecord: runtimeContext.walletRecord,
        persistChangeAddress: false,
      });

      balanceResult = await aggregateManagedBalance({
        adaClient,
        network,
        address,
        runtimeContext,
      });

      const recoveryService = require("./recovery.service");
      await recoveryService.repairAdaWalletFromBalance(runtimeContext, balanceResult, network);
    }

    return balanceResult;
  } catch (error) {
    throw new Error(`Failed to fetch ADA balance: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
};
