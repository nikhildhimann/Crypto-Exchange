const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const seedVault = require("../../security/seedVault.service");
const logger = require("../../../common/utils/logger");

const ENCRYPTED_RECOVERY_PHRASE_SELECT =
  "+encryptedRecoveryPhrase.cipherText +encryptedRecoveryPhrase.iv +encryptedRecoveryPhrase.authTag";
const ADA_DEFERRED_ACCOUNT_DISCOVERY_OPTIONS = Object.freeze({
  maxAccounts: 20,
  probeReceiveEnd: 20,
  probeChangeEnd: 20,
  probeConcurrency: 6,
});

function buildDerivationPatch(derivation = {}) {
  return Object.entries(
    derivation && typeof derivation === "object" ? derivation : {},
  ).reduce((patch, [key, value]) => {
    if (value !== undefined) {
      patch[`metadata.derivation.${key}`] = value;
    }

    return patch;
  }, {});
}

function buildManagedAddressPayloads(wallet, material = {}) {
  const managedAddresses = [
    material?.managedAddress && typeof material.managedAddress === "object"
      ? material.managedAddress
      : null,
    ...(Array.isArray(material?.additionalManagedAddresses)
      ? material.additionalManagedAddresses.filter(
          (entry) => entry && typeof entry === "object",
        )
      : []),
  ].filter((entry) => String(entry.address || "").trim());

  return managedAddresses.map((managedAddress) => ({
    walletId: wallet._id,
    userId: wallet.userId,
    chain: wallet.chain,
    network: wallet.network,
    address: String(managedAddress.address || "").trim(),
    memo: "",
    derivationPath: String(managedAddress.derivationPath || "").trim(),
    branch: Number.isFinite(Number(managedAddress.branch))
      ? Number(managedAddress.branch)
      : 0,
    addressIndex: Number.isFinite(Number(managedAddress.addressIndex))
      ? Number(managedAddress.addressIndex)
      : 0,
    addressType: String(managedAddress.addressType || "").trim(),
    purpose: String(managedAddress.purpose || "receive").trim(),
    isActive: managedAddress.isActive !== false,
    isChange: managedAddress.isChange === true,
    metadata:
      managedAddress.metadata && typeof managedAddress.metadata === "object"
        ? managedAddress.metadata
        : {},
    status: managedAddress.isActive === false ? "inactive" : "active",
  }));
}

async function replaceManagedAddressesForRecoveredWallet(wallet, material = {}) {
  const payloads = buildManagedAddressPayloads(wallet, material);
  const activeAddresses = payloads.map((payload) => payload.address);
  const supersededAt = new Date();

  await WalletAddress.updateMany(
    {
      walletId: wallet._id,
      chain: wallet.chain,
      network: wallet.network,
      ...(activeAddresses.length
        ? { address: { $nin: activeAddresses } }
        : {}),
    },
    {
      $set: {
        isActive: false,
        status: "inactive",
        "metadata.supersededByDeferredRecovery": true,
        "metadata.supersededAt": supersededAt,
      },
    },
  );

  if (!payloads.length) {
    return;
  }

  await WalletAddress.bulkWrite(
    payloads.map((payload) => ({
      updateOne: {
        filter: {
          walletId: wallet._id,
          address: payload.address,
        },
        update: {
          $set: payload,
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function repairAdaWallet(walletId, reason, options = {}) {
  const wallet = await Wallet.findById(walletId);
  if (!wallet || String(wallet.chain || "").toLowerCase() !== "ada") return null;

  const { syncUtxoWallet } = require("../utxo/runtimeSync.service");
  await syncUtxoWallet(String(wallet._id), {
    trigger: "manual_repair",
    reason: reason,
    force: true,
    forceDiscovery: true
  });

  return Wallet.findById(wallet._id);
}

async function completeDeferredAdaAccountDiscovery(walletId, options = {}) {
  const wallet = await Wallet.findById(walletId)
    .select(
      `_id userId accountId chain network address publicKey isImported metadata ${ENCRYPTED_RECOVERY_PHRASE_SELECT}`,
    );

  if (!wallet || String(wallet.chain || "").toLowerCase() !== "ada") {
    return {
      status: "skipped",
      reason: "wallet_not_ada",
      walletId: String(walletId || ""),
    };
  }

  if (wallet.isImported !== true) {
    return {
      status: "skipped",
      reason: "wallet_not_imported",
      walletId: String(wallet._id),
    };
  }

  const provisioning = wallet.metadata?.provisioning || {};
  if (
    options.force !== true &&
    provisioning.status !== "pending_recovery" &&
    provisioning.recoveryPending !== true &&
    provisioning.discoveryPending !== true
  ) {
    return {
      status: "skipped",
      reason: "recovery_not_pending",
      walletId: String(wallet._id),
    };
  }

  const trigger = String(options.trigger || "deferred_account_discovery");
  const reason = String(options.reason || "deferred_ada_recovery");
  const walletLib = require("./wallet");
  const discoveryOptions =
    options.discoveryOptions &&
    typeof options.discoveryOptions === "object"
      ? {
          ...ADA_DEFERRED_ACCOUNT_DISCOVERY_OPTIONS,
          ...options.discoveryOptions,
        }
      : ADA_DEFERRED_ACCOUNT_DISCOVERY_OPTIONS;
  const startedAt = Date.now();

  try {
    const mnemonic = seedVault.decryptSeed(wallet.encryptedRecoveryPhrase);
    const discoveredMaterial = await walletLib.discoverWalletFromMnemonic(
      mnemonic,
      wallet.network,
      discoveryOptions,
    );
    const discoveredAccount = Number(
      discoveredMaterial?.derivation?.account ?? wallet.metadata?.derivation?.account ?? 0,
    );
    const accountChanged =
      Number(wallet.metadata?.derivation?.account ?? 0) !== discoveredAccount;
    const addressChanged =
      String(discoveredMaterial?.address || "").trim() !==
      String(wallet.address || "").trim();

    if (accountChanged || addressChanged) {
      await replaceManagedAddressesForRecoveredWallet(wallet, discoveredMaterial);
    }

    await Wallet.updateOne(
      { _id: wallet._id },
      {
        $set: {
          address: String(discoveredMaterial?.address || wallet.address || "").trim(),
          publicKey: String(
            discoveredMaterial?.publicKey || wallet.publicKey || "",
          ).trim(),
          ...buildDerivationPatch(discoveredMaterial?.derivation || {}),
          ...(discoveredMaterial?.metadata?.discovery &&
          typeof discoveredMaterial.metadata.discovery === "object"
            ? {
                "metadata.discovery": discoveredMaterial.metadata.discovery,
              }
            : {}),
          "metadata.provisioning.recoveryPending": false,
          "metadata.provisioning.discoveryPending": false,
          "metadata.provisioning.recoveredAt": new Date(),
          "metadata.provisioning.recoverySource": trigger,
          "metadata.provisioning.lastRecoveryOutcome":
            accountChanged || addressChanged
              ? "migrated_canonical_address"
              : "confirmed_canonical_address",
          "metadata.provisioning.lastRecoveryAttemptAt": new Date(),
          "metadata.provisioning.lastError": null,
          "metadata.provisioning.discoveryProfile": "full_deferred",
          "metadata.provisioning.discoveryCompletedAt": new Date(),
        },
        $unset: {
          "metadata.provisioning.status": "",
          "metadata.provisioning.recoveryReason": "",
          "metadata.provisioning.recoveryTrigger": "",
        },
        $inc: {
          "metadata.provisioning.recoveryAttempts": 1,
        },
      },
    );

    logger.info("Completed deferred ADA account discovery", {
      event: "ada_deferred_account_discovery_completed",
      walletId: String(wallet._id),
      network: wallet.network,
      accountChanged,
      addressChanged,
      accountIndex: discoveredAccount,
      durationMs: Date.now() - startedAt,
    });

    return {
      status: "completed",
      walletId: String(wallet._id),
      accountChanged,
      addressChanged,
      accountIndex: discoveredAccount,
    };
  } catch (error) {
    await Wallet.updateOne(
      { _id: wallet._id },
      {
        $set: {
          "metadata.provisioning.status": "pending_recovery",
          "metadata.provisioning.recoveryPending": true,
          "metadata.provisioning.discoveryPending": true,
          "metadata.provisioning.recoveryReason": reason,
          "metadata.provisioning.recoveryTrigger": trigger,
          "metadata.provisioning.lastRecoveryOutcome":
            "deferred_account_discovery_failed",
          "metadata.provisioning.lastRecoveryAttemptAt": new Date(),
          "metadata.provisioning.lastError":
            error instanceof Error ? error.message : String(error),
        },
        $inc: {
          "metadata.provisioning.recoveryAttempts": 1,
        },
      },
    );

    logger.warn("Deferred ADA account discovery failed", {
      event: "ada_deferred_account_discovery_failed",
      walletId: String(wallet._id),
      network: wallet.network,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });

    return {
      status: "failed",
      walletId: String(wallet._id),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Highly constrained migration rule to update wallet canonical address
async function migrateWalletCanonicalAddress({ wallet, candidateAddress, candidatePublicKey, accountIndex, reason, trigger }) {
  if (wallet.chain !== "ada" || !wallet.isImported) {
    return false;
  }

  // Update logic to safely mutate the wallet address and derivations
  const oldAddress = wallet.address;
  const newAddress = candidateAddress;
  
  if (oldAddress === newAddress) {
    return false;
  }

  const derivation = wallet.metadata?.derivation || {};
  const provisioning = wallet.metadata?.provisioning || {};

  const patch = {
    address: newAddress,
    publicKey: candidatePublicKey,
    "metadata.derivation.account": accountIndex,
    "metadata.derivation.address": newAddress,
    "metadata.derivation.publicKey": candidatePublicKey,
    "metadata.provisioning.recoveredAt": new Date(),
    "metadata.provisioning.recoverySource": trigger,
    "metadata.provisioning.lastRecoveryOutcome": "migrated_canonical_address",
    "metadata.provisioning.lastRecoveryAttemptAt": new Date(),
  };

  await Wallet.updateOne({ _id: wallet._id }, { $set: patch, $inc: { "metadata.provisioning.recoveryAttempts": 1 } });

  logger.info("ADA wallet canonical address recovered", {
    event: "ada_wallet_recovered",
    walletId: String(wallet._id),
    oldAddress,
    newAddress,
    accountIndex,
    reason,
    trigger
  });

  return true;
}

async function repairAdaWalletFromBalance(runtimeContext, balanceResult, network) {
  const walletInstance = runtimeContext.walletRecord;
  const canonicalAddress = walletInstance.address;
  const aggregated = balanceResult?.raw?.aggregatedAddresses || [];
  const canonicalAggregated = aggregated.find(a => a.address === canonicalAddress);
  
  const currentIsZero = !canonicalAggregated || (!canonicalAggregated.exists && BigInt(canonicalAggregated.baseUnitBalance || "0") === 0n);

  if (currentIsZero && walletInstance.isImported) {
    const sortedCandidates = [...aggregated]
      .filter(a => a.exists && a.purpose === "receive")
      .sort((a,b) => {
         const bA = BigInt(a.baseUnitBalance || "0");
         const bB = BigInt(b.baseUnitBalance || "0");
         if (bA !== bB) return bA > bB ? -1 : 1;
         return b.utxoCount - a.utxoCount;
      });
      
    if (sortedCandidates.length > 0 && (BigInt(sortedCandidates[0].baseUnitBalance || "0") > 0n || sortedCandidates[0].utxoCount > 0)) {
       const best = sortedCandidates[0];
       const walletLib = require("./wallet");
       const accountIndex = walletInstance.metadata?.derivation?.account || walletLib.DEFAULT_ACCOUNT_INDEX;
       
       const derived = walletLib.deriveManagedAddressFromAccountPublicKey(
          walletInstance.metadata.derivation.accountPublicKeyBech32,
          network,
          {
             stakePublicKeyBech32: walletInstance.metadata.derivation.stakePublicKeyBech32,
             accountIndex,
             branch: best.branch,
             addressIndex: best.addressIndex
          }
       );
       
       await migrateWalletCanonicalAddress({
          wallet: walletInstance,
          candidateAddress: best.address,
          candidatePublicKey: derived.publicKey,
          accountIndex,
          reason: "zero_balance_canonical_with_funded_deep_address",
          trigger: "balance_recovery"
       });
    }
  }
}

module.exports = {
  migrateWalletCanonicalAddress,
  repairAdaWallet,
  repairAdaWalletFromBalance,
  completeDeferredAdaAccountDiscovery,
};
