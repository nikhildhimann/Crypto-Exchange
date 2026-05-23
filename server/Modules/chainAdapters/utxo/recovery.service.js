const Wallet = require("../../wallet/model");
const {
  upsertManagedAddress,
} = require("./addressDiscovery.service");

async function resolveWalletForRecovery({
  chain,
  walletRecord = null,
  walletId = "",
} = {}) {
  if (walletRecord?._id) {
    return walletRecord;
  }

  if (!walletId) {
    return null;
  }

  return Wallet.findOne({
    _id: walletId,
    chain,
  })
    .select("_id userId accountId chain network address label metadata")
    .lean();
}

function isAddressUsedByDefault(probeResult = null) {
  if (!probeResult || typeof probeResult !== "object") {
    return false;
  }

  if (probeResult.exists === true) {
    return true;
  }

  try {
    if (BigInt(String(probeResult.balance || "0")) > 0n) {
      return true;
    }
  } catch (_error) {
    // Ignore malformed probe balances and fall through.
  }

  return Number(probeResult.utxoCount || 0) > 0;
}

async function rebuildWalletState({
  chain,
  network,
  walletRecord = null,
  walletId = "",
  branchPlans = [],
  validateAddress = null,
  deriveManagedAddress,
  probeAddressState = null,
} = {}) {
  if (typeof deriveManagedAddress !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} rebuild derivation is required`);
  }

  const resolvedWallet = await resolveWalletForRecovery({
    chain,
    walletRecord,
    walletId,
  });
  if (!resolvedWallet?._id) {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} wallet not found for rebuild`);
  }

  const rows = [];
  let upsertedCount = 0;

  for (const plan of Array.isArray(branchPlans) ? branchPlans : []) {
    const startIndex = Number(plan.startIndex ?? 0);
    const endIndex = Number(plan.endIndex ?? startIndex);
    const gapLimit = Number(plan.gapLimit || 0);
    let consecutiveUnused = 0;

    for (let addressIndex = startIndex; addressIndex <= endIndex; addressIndex += 1) {
      const derived = await Promise.resolve(
        deriveManagedAddress({
          chain,
          network,
          walletRecord: resolvedWallet,
          branch: Number(plan.branch ?? 0),
          addressIndex,
          plan,
        }),
      );

      const address = String(
        derived?.address || derived?.managedAddress?.address || "",
      ).trim();
      if (!address) {
        continue;
      }

      if (typeof validateAddress === "function" && !validateAddress(address, network)) {
        throw new Error(
          `Derived invalid ${String(chain || "").toUpperCase()} address for branch=${Number(plan.branch ?? 0)} index=${addressIndex}`,
        );
      }

      const payload = await upsertManagedAddress({
        walletRecord: resolvedWallet,
        chain,
        network,
        managedAddress: {
          ...(derived?.managedAddress && typeof derived.managedAddress === "object"
            ? derived.managedAddress
            : {}),
          address,
          derivationPath:
            derived?.managedAddress?.derivationPath || derived?.derivationPath || "",
          branch: Number(plan.branch ?? 0),
          addressIndex,
          addressType:
            derived?.managedAddress?.addressType ||
            derived?.addressType ||
            String(plan.addressType || "").trim(),
          purpose: String(plan.purpose || derived?.purpose || "receive").trim(),
          isActive: true,
          isChange: plan.isChange === true || derived?.isChange === true,
          metadata:
            derived?.managedAddress?.metadata &&
            typeof derived.managedAddress.metadata === "object"
              ? derived.managedAddress.metadata
              : {},
          status: "active",
        },
      });
      if (payload) {
        upsertedCount += 1;
      }

      let chainState = null;
      if (typeof probeAddressState === "function") {
        chainState = await Promise.resolve(
          probeAddressState({
            chain,
            network,
            walletRecord: resolvedWallet,
            branch: Number(plan.branch ?? 0),
            addressIndex,
            address,
            plan,
          }),
        );
      }

      rows.push({
        address,
        branch: Number(plan.branch ?? 0),
        index: addressIndex,
        purpose: String(plan.purpose || derived?.purpose || "receive").trim(),
        isChange: plan.isChange === true || derived?.isChange === true,
        derivationPath:
          payload?.derivationPath ||
          derived?.managedAddress?.derivationPath ||
          derived?.derivationPath ||
          "",
        existsOnChain: chainState ? chainState.exists : null,
        balanceBaseUnits: chainState ? chainState.balance : null,
        utxoCount: chainState ? chainState.utxoCount : null,
      });

      if (gapLimit > 0) {
        const isAddressUsed =
          typeof plan.isAddressUsed === "function"
            ? await Promise.resolve(
                plan.isAddressUsed({
                  chainState,
                  walletRecord: resolvedWallet,
                  plan,
                  row: rows[rows.length - 1],
                }),
              )
            : isAddressUsedByDefault(chainState);

        consecutiveUnused = isAddressUsed ? 0 : consecutiveUnused + 1;
        if (consecutiveUnused >= gapLimit) {
          break;
        }
      }
    }
  }

  return {
    walletRecord: resolvedWallet,
    upsertedCount,
    rows,
  };
}

module.exports = {
  rebuildWalletState,
};
