const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const amount = require("./amount");
const client = require("./client");
const transaction = require("./transaction");
const wallet = require("./wallet");
const { AppError } = require("../../../helpers/errors");

function normalizeAddress(address, network) {
  const normalized = String(address || "").trim();
  if (!wallet.validateAddress(normalized, network)) {
    throw AppError.validation("ADA deposit address is invalid");
  }

  return normalized;
}


function normalizeTimestamp(value) {
  if (!value && value !== 0) {
    return null;
  }

  const timestamp = new Date(Number(value) * 1000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function buildCanonicalDepositEntry(rawEntry, output, managedAddressSet) {
  const txHash = String(rawEntry?.txHash || rawEntry?.tx?.hash || "").trim();
  const outputIndex = Number(output?.output_index);
  const amountBaseUnits = amount.resolveLovelaceBalance(output?.amount);
  const destinationAddress = String(output?.address || "").trim();
  const fromAddress = String(
    rawEntry?.utxos?.inputs?.find((input) => {
      const inputAddress = String(input?.address || "").trim().toLowerCase();
      return inputAddress && !managedAddressSet.has(inputAddress);
    })?.address ||
      rawEntry?.utxos?.inputs?.[0]?.address ||
      "",
  ).trim();
  const confirmations = Number(rawEntry?.confirmations || 0) || 0;

  if (!txHash || !Number.isInteger(outputIndex) || outputIndex < 0) {
    return null;
  }

  if (BigInt(amountBaseUnits) <= 0n) {
    return null;
  }

  return {
    hash: txHash,
    txHash,
    outputIndex,
    vout: outputIndex,
    amount: amount.fromBaseUnits(amountBaseUnits),
    amountBaseUnits,
    confirmations,
    fromAddress,
    toAddress: destinationAddress,
    chainStatus: confirmations > 0 ? "confirmed" : "pending",
    succeeded: confirmations > 0,
    validated: confirmations > 0,
    blockHeight: Number(rawEntry?.blockHeight || rawEntry?.tx?.block_height || 0) || undefined,
    chainTimestamp:
      rawEntry?.chainTimestamp instanceof Date
        ? rawEntry.chainTimestamp
        : normalizeTimestamp(rawEntry?.tx?.block_time),
    rawEntry,
  };
}

async function watchDeposits(input) {
  const network = client.normalizeNetwork(input?.network || client.DEFAULT_NETWORK);
  const targetAddress = normalizeAddress(input?.address, network);
  const entries = await transaction.fetchManagedHistoryEntries(
    network,
    targetAddress,
    input?.limit || 50,
  );
  const { addressSet } = await transaction.resolveManagedPaymentContext(network, targetAddress);
  const seen = new Set();

  return entries
    .flatMap((entry) => {
      const inputs = Array.isArray(entry?.utxos?.inputs) ? entry.utxos.inputs : [];
      const spendsFromManagedAddress = inputs.some((txInput) =>
        addressSet.has(String(txInput?.address || "").trim().toLowerCase()),
      );

      if (spendsFromManagedAddress) {
        return [];
      }

      return (Array.isArray(entry?.utxos?.outputs) ? entry.utxos.outputs : [])
        .filter((output) =>
          addressSet.has(String(output?.address || "").trim().toLowerCase()),
        )
        .map((output) => buildCanonicalDepositEntry(entry, output, addressSet));
    })
    .filter((entry) => {
      if (!entry) {
        return false;
      }

      const identity = `${entry.txHash}:${entry.outputIndex}`;
      if (seen.has(identity)) {
        return false;
      }

      seen.add(identity);
      return true;
    });
}

async function matchDepositToWallet(depositEntry, network = client.DEFAULT_NETWORK) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const destinationAddress = normalizeAddress(
    depositEntry?.toAddress || depositEntry?.address,
    normalizedNetwork,
  );

  const managedAddress = await WalletAddress.findOne({
    chain: "ada",
    network: normalizedNetwork,
    address: destinationAddress,
    isActive: true,
  }).lean();

  if (managedAddress?.walletId) {
    const matchedWallet = await Wallet.findOne({
      _id: managedAddress.walletId,
      chain: "ada",
      network: normalizedNetwork,
    }).lean();

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

  const matchedWallet = await Wallet.findOne({
    chain: "ada",
    network: normalizedNetwork,
    address: destinationAddress,
  }).lean();

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
