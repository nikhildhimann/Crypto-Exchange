const mongoose = require("mongoose");

const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");

function isDatabaseAvailable() {
  return mongoose.connection.readyState === 1;
}

async function resolveWalletRecord({
  chain,
  network,
  walletAddress,
  select = "_id userId accountId chain network address metadata",
} = {}) {
  if (!isDatabaseAvailable() || !chain || !network || !walletAddress) {
    return null;
  }

  return Wallet.findOne({
    chain,
    network,
    address: String(walletAddress).trim(),
  })
    .select(select)
    .lean();
}

function normalizeManagedAddressEntry(managedAddress = {}, defaults = {}) {
  const metadata =
    managedAddress?.metadata && typeof managedAddress.metadata === "object"
      ? managedAddress.metadata
      : defaults.metadata && typeof defaults.metadata === "object"
        ? defaults.metadata
        : {};
  const isActive =
    managedAddress.isActive === undefined
      ? defaults.isActive !== false
      : managedAddress.isActive !== false;
  const isChange =
    managedAddress.isChange === undefined
      ? defaults.isChange === true
      : managedAddress.isChange === true;

  return {
    address: String(managedAddress.address || defaults.address || "").trim(),
    derivationPath: String(
      managedAddress.derivationPath || defaults.derivationPath || "",
    ).trim(),
    branch: Number.isFinite(Number(managedAddress.branch))
      ? Number(managedAddress.branch)
      : Number.isFinite(Number(defaults.branch))
        ? Number(defaults.branch)
        : 0,
    addressIndex: Number.isFinite(Number(managedAddress.addressIndex))
      ? Number(managedAddress.addressIndex)
      : Number.isFinite(Number(defaults.addressIndex))
        ? Number(defaults.addressIndex)
        : 0,
    addressType: String(
      managedAddress.addressType || defaults.addressType || "",
    ).trim(),
    purpose: String(
      managedAddress.purpose || defaults.purpose || "receive",
    ).trim(),
    isActive,
    isChange,
    metadata,
    status:
      String(managedAddress.status || defaults.status || "").trim() ||
      (isActive ? "active" : "inactive"),
  };
}

function buildManagedAddressPayload({
  walletRecord,
  chain,
  network,
  managedAddress,
  defaults = {},
} = {}) {
  const normalized = normalizeManagedAddressEntry(managedAddress, defaults);
  if (!walletRecord?._id || !normalized.address) {
    return null;
  }

  return {
    walletId: walletRecord._id,
    userId: walletRecord.userId,
    chain,
    network,
    address: normalized.address,
    memo: "",
    derivationPath: normalized.derivationPath,
    branch: normalized.branch,
    addressIndex: normalized.addressIndex,
    addressType: normalized.addressType,
    purpose: normalized.purpose,
    isActive: normalized.isActive,
    isChange: normalized.isChange,
    metadata: normalized.metadata,
    status: normalized.status,
  };
}

async function upsertManagedAddress({
  walletRecord,
  chain,
  network,
  managedAddress,
  defaults = {},
} = {}) {
  if (!walletRecord?._id || !isDatabaseAvailable()) {
    return null;
  }

  const payload = buildManagedAddressPayload({
    walletRecord,
    chain,
    network,
    managedAddress,
    defaults,
  });
  if (!payload) {
    return null;
  }

  await WalletAddress.updateOne(
    {
      walletId: walletRecord._id,
      address: payload.address,
    },
    { $set: payload },
    { upsert: true },
  );

  return payload;
}

function hasManagedAddressChanged(existing = {}, payload = {}) {
  const comparableFields = [
    "derivationPath",
    "branch",
    "addressIndex",
    "addressType",
    "purpose",
    "isActive",
    "isChange",
    "status",
  ];

  for (const field of comparableFields) {
    if (JSON.stringify(existing?.[field]) !== JSON.stringify(payload?.[field])) {
      return true;
    }
  }

  return JSON.stringify(existing?.metadata || {}) !== JSON.stringify(payload?.metadata || {});
}

function isAcceptedAddressType(entry = {}, acceptedAddressTypes = null) {
  if (!acceptedAddressTypes) {
    return true;
  }

  const addressType = String(entry.addressType || "").trim();
  if (typeof acceptedAddressTypes === "function") {
    return acceptedAddressTypes(addressType, entry);
  }

  if (acceptedAddressTypes instanceof Set) {
    return acceptedAddressTypes.has(addressType);
  }

  if (Array.isArray(acceptedAddressTypes)) {
    return acceptedAddressTypes.includes(addressType);
  }

  return true;
}

async function ensureWalletIndexed({
  chain,
  network,
  walletAddress,
  walletRecord = null,
  validateAddress = null,
  deriveManagedAddresses = null,
} = {}) {
  const resolvedWallet =
    walletRecord ||
    (await resolveWalletRecord({
      chain,
      network,
      walletAddress,
    }));
  if (!resolvedWallet?._id || typeof deriveManagedAddresses !== "function") {
    return {
      walletRecord: resolvedWallet,
      persistedAddresses: [],
      databaseAvailable: isDatabaseAvailable(),
    };
  }

  const derivedEntries = await Promise.resolve(
    deriveManagedAddresses({
      chain,
      network,
      walletAddress: String(walletAddress || "").trim(),
      walletRecord: resolvedWallet,
    }),
  );
  const persistedAddresses = [];
  const existingAddresses = await WalletAddress.find({
    walletId: resolvedWallet._id,
    chain,
    network,
  })
    .select(
      "address derivationPath branch addressIndex addressType purpose isActive isChange metadata status",
    )
    .lean();
  const existingByAddress = new Map(
    existingAddresses.map((entry) => [String(entry.address || "").trim(), entry]),
  );

  for (const entry of Array.isArray(derivedEntries) ? derivedEntries : []) {
    const normalized = normalizeManagedAddressEntry(entry);
    if (!normalized.address) {
      continue;
    }

    if (
      typeof validateAddress === "function" &&
      !validateAddress(normalized.address, network)
    ) {
      continue;
    }

    const payload = buildManagedAddressPayload({
      walletRecord: resolvedWallet,
      chain,
      network,
      managedAddress: normalized,
    });
    if (!payload) {
      continue;
    }

    const existing = existingByAddress.get(payload.address);
    if (!existing || hasManagedAddressChanged(existing, payload)) {
      await WalletAddress.updateOne(
        {
          walletId: resolvedWallet._id,
          address: payload.address,
        },
        { $set: payload },
        { upsert: true },
      );
      existingByAddress.set(payload.address, payload);
    }

    persistedAddresses.push(payload);
  }

  return {
    walletRecord: resolvedWallet,
    persistedAddresses,
    databaseAvailable: isDatabaseAvailable(),
  };
}

async function getManagedAddresses({
  chain,
  network,
  walletAddress,
  walletRecord = null,
  includePurposes = ["receive", "change"],
  validateAddress = null,
  acceptedAddressTypes = null,
  defaultManagedAddresses = [],
  ensureIndexed = null,
} = {}) {
  let resolvedWallet =
    walletRecord ||
    (await resolveWalletRecord({
      chain,
      network,
      walletAddress,
    }));
  const addressMap = new Map();

  const addManagedAddress = (entry = {}) => {
    const normalized = normalizeManagedAddressEntry(entry);
    if (!normalized.address) {
      return;
    }

    if (
      typeof validateAddress === "function" &&
      !validateAddress(normalized.address, network)
    ) {
      return;
    }

    if (!isAcceptedAddressType(normalized, acceptedAddressTypes)) {
      return;
    }

    addressMap.set(normalized.address, normalized);
  };

  for (const entry of Array.isArray(defaultManagedAddresses)
    ? defaultManagedAddresses
    : []) {
    addManagedAddress(entry);
  }

  if (typeof ensureIndexed === "function") {
    const ensuredResult = await ensureIndexed({
      chain,
      network,
      walletAddress: String(walletAddress || "").trim(),
      walletRecord: resolvedWallet,
    });
    resolvedWallet = ensuredResult?.walletRecord || resolvedWallet;

    for (const entry of Array.isArray(ensuredResult?.persistedAddresses)
      ? ensuredResult.persistedAddresses
      : []) {
      addManagedAddress(entry);
    }
  }

  if (isDatabaseAvailable() && resolvedWallet?._id) {
    const query = {
      walletId: resolvedWallet._id,
      chain,
      network,
      isActive: true,
    };

    if (Array.isArray(includePurposes) && includePurposes.length) {
      query.purpose = { $in: includePurposes };
    }

    const managedAddresses = await WalletAddress.find(query)
      .select(
        "address derivationPath branch addressIndex addressType purpose isActive isChange metadata status",
      )
      .lean();

    for (const entry of managedAddresses) {
      addManagedAddress(entry);
    }
  }

  return {
    walletRecord: resolvedWallet,
    managedAddresses: Array.from(addressMap.values()),
    walletResolved: Boolean(resolvedWallet?._id),
    databaseAvailable: isDatabaseAvailable(),
  };
}

async function discoverManagedAddresses(options = {}) {
  const result = await getManagedAddresses(options);

  return {
    ...result,
    addressSet: new Set(
      result.managedAddresses.map((entry) =>
        String(entry.address || "").trim().toLowerCase(),
      ),
    ),
  };
}

function defaultIsAddressUsed(probeResult = null) {
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
    // Ignore malformed probe balances and fall back to UTXO count.
  }

  return Number(probeResult.utxoCount || 0) > 0;
}

async function discoverAddressesByGapLimit({
  chain,
  network,
  walletAddress,
  walletRecord = null,
  gapLimit = 20,
  branchPlans = [],
  validateAddress = null,
  deriveManagedAddress = null,
  probeAddressState = null,
} = {}) {
  if (typeof deriveManagedAddress !== "function") {
    throw new Error(`UTXO ${String(chain || "").toUpperCase()} gap discovery requires derivation`);
  }

  const resolvedWallet =
    walletRecord ||
    (await resolveWalletRecord({
      chain,
      network,
      walletAddress,
    }));
  if (!resolvedWallet?._id) {
    return {
      walletRecord: resolvedWallet,
      gapLimit: Number(gapLimit) || 20,
      rows: [],
      branchSummaries: [],
      discoveredManagedAddresses: [],
    };
  }

  const normalizedGapLimit = Math.max(Number(gapLimit) || 20, 1);
  const rows = [];
  const discoveredManagedAddresses = [];
  const branchSummaries = [];

  for (const plan of Array.isArray(branchPlans) ? branchPlans : []) {
    const branch = Number(plan.branch ?? 0);
    const startIndex = Math.max(Number(plan.startIndex ?? 0), 0);
    const minScanCount = Math.max(Number(plan.minScanCount || 1), 1);
    const maxScanCount = Math.max(
      Number(plan.maxScanCount || minScanCount + normalizedGapLimit),
      minScanCount + normalizedGapLimit,
    );
    let scannedCount = 0;
    let consecutiveUnused = 0;
    let usedCount = 0;
    let highestUsedIndex = null;

    for (
      let addressIndex = startIndex;
      scannedCount < maxScanCount;
      addressIndex += 1
    ) {
      const derived = await Promise.resolve(
        deriveManagedAddress({
          chain,
          network,
          walletRecord: resolvedWallet,
          walletAddress: String(walletAddress || "").trim(),
          branch,
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
        continue;
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
          branch,
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
        discoveredManagedAddresses.push(payload);
      }

      const chainState =
        typeof probeAddressState === "function"
          ? await Promise.resolve(
              probeAddressState({
                chain,
                network,
                walletRecord: resolvedWallet,
                walletAddress: String(walletAddress || "").trim(),
                branch,
                addressIndex,
                address,
                plan,
              }),
            )
          : null;
      const isUsed =
        typeof plan.isAddressUsed === "function"
          ? await Promise.resolve(
              plan.isAddressUsed({
                chainState,
                walletRecord: resolvedWallet,
                address,
                branch,
                addressIndex,
                plan,
              }),
            )
          : defaultIsAddressUsed(chainState);

      rows.push({
        address,
        branch,
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
        isUsed,
      });

      scannedCount += 1;
      if (isUsed) {
        usedCount += 1;
        highestUsedIndex = addressIndex;
        consecutiveUnused = 0;
      } else {
        consecutiveUnused += 1;
      }

      if (scannedCount >= minScanCount && consecutiveUnused >= normalizedGapLimit) {
        break;
      }
    }

    branchSummaries.push({
      branch,
      purpose: String(plan.purpose || "receive").trim(),
      isChange: plan.isChange === true,
      scannedCount,
      usedCount,
      consecutiveUnused,
      highestUsedIndex,
      gapLimit: normalizedGapLimit,
    });
  }

  return {
    walletRecord: resolvedWallet,
    gapLimit: normalizedGapLimit,
    rows,
    branchSummaries,
    discoveredManagedAddresses,
  };
}

module.exports = {
  isDatabaseAvailable,
  resolveWalletRecord,
  normalizeManagedAddressEntry,
  buildManagedAddressPayload,
  upsertManagedAddress,
  ensureWalletIndexed,
  getManagedAddresses,
  discoverManagedAddresses,
  defaultIsAddressUsed,
  discoverAddressesByGapLimit,
};
