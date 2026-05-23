const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const amount = require("./amount");
const client = require("./client");
const transaction = require("./transaction");
const wallet = require("./wallet");
const { AppError } = require("../../../helpers/errors");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeAddress(address, network) {
  const normalized = normalizeString(address);
  const isCanonical = wallet.validateCanonicalAccountId(normalized);
  const isAlias = wallet.validateAliasAccountId(normalized);

  if (!isCanonical && !isAlias) {
    throw AppError.validation("HBAR deposit account ID is invalid");
  }

  client.normalizeNetwork(network);
  return normalized;
}

function normalizeAccountSet(raw = {}, fallbackAddress = "") {
  const values = new Set();

  if (Array.isArray(raw.walletAddresses)) {
    for (const entry of raw.walletAddresses) {
      const normalized = normalizeString(entry).toLowerCase();
      if (normalized) {
        values.add(normalized);
      }
    }
  }

  const fallback = normalizeString(fallbackAddress).toLowerCase();
  if (fallback) {
    values.add(fallback);
  }

  return values;
}

function buildCanonicalDepositEntry(rawEntry, transferEntry, transferIndex, walletAddress) {
  const txHash = normalizeString(rawEntry?.transaction_id);
  const amountBaseUnits = String(transferEntry?.amount ?? "0").trim();
  const amountValue = BigInt(amountBaseUnits || "0");
  const destinationAddress = normalizeString(walletAddress || transferEntry?.account || "");
  const confirmations = normalizeString(rawEntry?.consensus_timestamp) ? 1 : 0;

  if (!txHash || !Number.isInteger(transferIndex) || transferIndex < 0) {
    return null;
  }

  if (amountValue <= 0n) {
    return null;
  }

  const fromAddress = normalizeString(
    (Array.isArray(rawEntry?.transfers) ? rawEntry.transfers : [])
      .filter((entry) => BigInt(String(entry?.amount ?? "0")) < 0n)
      .sort((left, right) => {
        const leftAmount = BigInt(String(left?.amount ?? "0")) * -1n;
        const rightAmount = BigInt(String(right?.amount ?? "0")) * -1n;
        if (leftAmount === rightAmount) {
          return normalizeString(left?.account).localeCompare(normalizeString(right?.account));
        }

        return leftAmount > rightAmount ? -1 : 1;
      })[0]?.account || "",
  );
  const chainTimestamp = rawEntry?.consensus_timestamp
    ? new Date(Number(rawEntry.consensus_timestamp) * 1000)
    : undefined;

  return {
    hash: txHash,
    txHash,
    vout: transferIndex,
    outputIndex: transferIndex,
    amount: amount.fromBaseUnits(amountBaseUnits),
    amountBaseUnits,
    confirmations,
    fromAddress,
    toAddress: destinationAddress,
    chainStatus: normalizeString(rawEntry?.result || "SUCCESS"),
    succeeded: normalizeString(rawEntry?.result || "SUCCESS") === "SUCCESS",
    validated: confirmations > 0,
    chainTimestamp,
    rawEntry,
  };
}

async function resolveWatchTarget(address, network) {
  const normalizedAddress = normalizeAddress(address, network);

  if (wallet.validateCanonicalAccountId(normalizedAddress)) {
    return {
      requestedAddress: normalizedAddress,
      historyAddress: normalizedAddress,
      canonicalAccountId: normalizedAddress,
      aliasAccountId: null,
      pendingActivation: false,
    };
  }

  const aliasAccountId = client.normalizeAliasAccountId(normalizedAddress);
  const resolvedAccount = await client.getClient(network).resolveAccount(aliasAccountId, {
    allowNotFound: true,
  }).catch(() => null);

  return {
    requestedAddress: aliasAccountId,
    historyAddress: resolvedAccount?.accountId || null,
    canonicalAccountId: resolvedAccount?.accountId || null,
    aliasAccountId,
    pendingActivation: !resolvedAccount?.accountId,
  };
}

async function watchDeposits(input = {}) {
  const network = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const target = await resolveWatchTarget(input.address, network);

  if (!target.historyAddress) {
    return [];
  }

  const entries = await transaction.fetchHistory({
    network,
    address: target.historyAddress,
    limit: input.limit || 50,
  });
  const seen = new Set();

  return (Array.isArray(entries) ? entries : [])
    .flatMap((entry) => {
      const walletAddressSet = normalizeAccountSet(entry, target.historyAddress);
      const transfers = Array.isArray(entry?.transfers) ? entry.transfers : [];
      const spendsFromWallet = transfers.some((transferEntry) => {
        const transferAccount = normalizeString(transferEntry?.account).toLowerCase();
        return transferAccount &&
          walletAddressSet.has(transferAccount) &&
          BigInt(String(transferEntry?.amount ?? "0")) < 0n;
      });

      if (spendsFromWallet) {
        return [];
      }

      return transfers
        .map((transferEntry, index) => ({
          transferEntry,
          index,
        }))
        .filter(({ transferEntry }) => {
          const transferAccount = normalizeString(transferEntry?.account).toLowerCase();
          return transferAccount &&
            walletAddressSet.has(transferAccount) &&
            BigInt(String(transferEntry?.amount ?? "0")) > 0n;
        })
        .map(({ transferEntry, index }) =>
          buildCanonicalDepositEntry(entry, transferEntry, index, target.requestedAddress),
        );
    })
    .filter((entry) => {
      if (!entry) {
        return false;
      }

      const identity = `${entry.txHash}:${entry.vout}`;
      if (seen.has(identity)) {
        return false;
      }

      seen.add(identity);
      return true;
    });
}

async function upsertManagedAddress(walletRecord, network, materialAddress, managedAddress) {
  const normalizedAddress = normalizeString(managedAddress?.address || materialAddress);
  if (!walletRecord?._id || !normalizedAddress) {
    return;
  }

  await WalletAddress.updateOne(
    {
      walletId: walletRecord._id,
      address: normalizedAddress,
    },
    {
      $set: {
        walletId: walletRecord._id,
        userId: walletRecord.userId,
        chain: "hbar",
        network,
        address: normalizedAddress,
        memo: "",
        derivationPath: String(
          managedAddress?.derivationPath ||
            walletRecord?.metadata?.derivation?.path ||
            wallet.DERIVATION_PATH,
        ).trim(),
        branch: Number.isFinite(Number(managedAddress?.branch))
          ? Number(managedAddress.branch)
          : 0,
        addressIndex: Number.isFinite(Number(managedAddress?.addressIndex))
          ? Number(managedAddress.addressIndex)
          : 0,
        addressType: String(managedAddress?.addressType || "").trim(),
        purpose: String(managedAddress?.purpose || "receive").trim(),
        isActive: managedAddress?.isActive !== false,
        isChange: managedAddress?.isChange === true,
        metadata:
          managedAddress?.metadata && typeof managedAddress.metadata === "object"
            ? managedAddress.metadata
            : {},
        status: managedAddress?.isActive === false ? "inactive" : "active",
      },
    },
    { upsert: true },
  );
}

async function activatePendingWallet(matchedWallet, network) {
  if (!matchedWallet || !wallet.isPendingActivation(matchedWallet)) {
    return matchedWallet;
  }

  const aliasAccountId = wallet.getAliasAccountId(matchedWallet);
  if (!aliasAccountId) {
    return matchedWallet;
  }

  const resolvedAccount = await client.getClient(network).resolveAccount(aliasAccountId, {
    allowNotFound: true,
  }).catch(() => null);

  if (!resolvedAccount?.accountId) {
    return matchedWallet;
  }

  const finalizedMaterial = wallet.buildFinalizedWalletMaterial({
    address: matchedWallet.address,
    publicKey: matchedWallet.publicKey,
    derivationPath: matchedWallet.metadata?.derivation?.path || wallet.DERIVATION_PATH,
    derivation: matchedWallet.metadata?.derivation || {},
    metadata: matchedWallet.metadata || {},
  }, {
    ...resolvedAccount,
    aliasAccountId,
    network,
  });

  await Wallet.updateOne(
    { _id: matchedWallet._id },
    {
      $set: {
        address: finalizedMaterial.address,
        metadata: finalizedMaterial.metadata,
      },
    },
  );

  await upsertManagedAddress(
    matchedWallet,
    network,
    finalizedMaterial.managedAddress?.address,
    finalizedMaterial.managedAddress,
  );

  for (const managedAddress of Array.isArray(finalizedMaterial.additionalManagedAddresses)
    ? finalizedMaterial.additionalManagedAddresses
    : []) {
    await upsertManagedAddress(matchedWallet, network, managedAddress.address, managedAddress);
  }

  return Wallet.findOne({
    _id: matchedWallet._id,
    chain: "hbar",
    network,
  }).lean();
}

async function matchDepositToWallet(depositEntry, network = client.DEFAULT_NETWORK) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const destinationAddress = normalizeAddress(
    depositEntry?.toAddress || depositEntry?.address,
    normalizedNetwork,
  );

  const managedAddress = await WalletAddress.findOne({
    chain: "hbar",
    network: normalizedNetwork,
    address: destinationAddress,
    isActive: true,
  }).lean();

  if (managedAddress?.walletId) {
    let matchedWallet = await Wallet.findOne({
      _id: managedAddress.walletId,
      chain: "hbar",
      network: normalizedNetwork,
    }).lean();

    matchedWallet = await activatePendingWallet(matchedWallet, normalizedNetwork);

    if (matchedWallet) {
      return {
        walletId: matchedWallet._id,
        accountId: matchedWallet.accountId,
        userId: matchedWallet.userId,
        matchedBy: "managedAddress",
        destinationAddress,
      };
    }
  }

  let matchedWallet = await Wallet.findOne({
    chain: "hbar",
    network: normalizedNetwork,
    address: destinationAddress,
  }).lean();

  matchedWallet = await activatePendingWallet(matchedWallet, normalizedNetwork);

  if (!matchedWallet) {
    return null;
  }

  return {
    walletId: matchedWallet._id,
    accountId: matchedWallet.accountId,
    userId: matchedWallet.userId,
    matchedBy: "address",
    destinationAddress,
  };
}

module.exports = {
  watchDeposits,
  matchDepositToWallet,
};
