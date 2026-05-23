const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const transaction = require("./transaction");
const mapper = require("./mapper");
const wallet = require("./wallet");
const client = require("./client");
const { AppError } = require("../../../helpers/errors");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeAddress(address, network) {
  try {
    return wallet.normalizeAddress(address, network);
  } catch (_error) {
    throw AppError.validation("TON deposit address is invalid");
  }
}

function normalizeTimestamp(value) {
  if (!value) {
    return undefined;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function buildCanonicalDepositEntry(rawEntry, mappedEntry, targetAddress) {
  const txHash = normalizeString(mappedEntry?.txHash || rawEntry?.txHash);
  const amountBaseUnits = normalizeString(mappedEntry?.amountBaseUnits || "0");

  if (!txHash || !/^\d+$/.test(amountBaseUnits) || BigInt(amountBaseUnits) <= 0n) {
    return null;
  }

  return {
    hash: txHash,
    txHash,
    amount: mappedEntry.amount,
    amountBaseUnits,
    confirmations: Number(mappedEntry?.confirmations || 0),
    fromAddress: normalizeString(mappedEntry?.fromAddress),
    toAddress: normalizeString(targetAddress || mappedEntry?.toAddress),
    chainStatus: normalizeString(mappedEntry?.chainStatus || "pending"),
    succeeded: mappedEntry?.succeeded === true,
    validated: mappedEntry?.validated === true,
    chainTimestamp: normalizeTimestamp(mappedEntry?.chainTimestamp),
    rawEntry,
  };
}

async function watchDeposits(input = {}) {
  const network = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const targetAddress = normalizeAddress(input.address, network);
  const entries = await transaction.fetchHistory({
    network,
    address: targetAddress,
    limit: input.limit || 50,
  });
  const seen = new Set();

  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      raw: entry,
      mapped: mapper.mapTransaction(entry, targetAddress),
    }))
    .filter(({ mapped }) =>
      Boolean(
        mapped &&
        mapped.direction === "incoming" &&
        mapped.succeeded === true &&
        mapped.toAddress === targetAddress &&
        mapped.fromAddress !== targetAddress,
      ),
    )
    .map(({ raw, mapped }) => buildCanonicalDepositEntry(raw, mapped, targetAddress))
    .filter((entry) => {
      if (!entry) {
        return false;
      }

      if (seen.has(entry.txHash)) {
        return false;
      }

      seen.add(entry.txHash);
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
    chain: "ton",
    network: normalizedNetwork,
    address: destinationAddress,
    isActive: true,
  }).lean();

  if (managedAddress?.walletId) {
    const matchedWallet = await Wallet.findOne({
      _id: managedAddress.walletId,
      chain: "ton",
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
    chain: "ton",
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
