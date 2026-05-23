const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const transaction = require("./transaction");
const amount = require("./amount");
const wallet = require("./wallet");
const client = require("./client");
const { AppError } = require("../../../helpers/errors");

const MAINNET_NETWORK = "mainnet";

function normalizeAddress(address, network) {
  const normalized = String(address || "").trim();
  if (!wallet.validateAddress(normalized, network)) {
    throw AppError.validation("BTC deposit address is invalid");
  }

  return normalized;
}

function normalizeConfirmations(entry = {}) {
  const parsed = Number.parseInt(String(entry.confirmations ?? "0").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeTimestamp(value) {
  if (!value && value !== 0) {
    return null;
  }

  const timestamp = new Date(Number(value) * 1000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function buildCanonicalDepositEntry(rawTx, output, targetAddress) {
  const txHash = String(rawTx?.txid || "").trim();
  const vout = Number(output?.n);
  const amountBaseUnits = String(output?.value ?? "0").trim();
  const confirmations = normalizeConfirmations({
    confirmations:
      rawTx?.status?.confirmed === true
        ? Math.max(
            Number(rawTx?.tipHeight || 0) - Number(rawTx?.status?.block_height || 0) + 1,
            1,
          )
        : 0,
  });

  if (!txHash || !Number.isInteger(vout) || vout < 0 || !/^\d+$/.test(amountBaseUnits)) {
    return null;
  }

  if (BigInt(amountBaseUnits) <= 0n) {
    return null;
  }

  return {
    hash: txHash,
    txHash,
    vout,
    amount: amount.fromBaseUnits(amountBaseUnits),
    amountBaseUnits,
    confirmations,
    fromAddress: String(rawTx?.vin?.[0]?.prevout?.scriptpubkey_address || "").trim(),
    toAddress: String(targetAddress || "").trim(),
    chainStatus: rawTx?.status?.confirmed === true ? "confirmed" : "pending",
    succeeded: rawTx?.status?.confirmed === true,
    validated: rawTx?.status?.confirmed === true,
    chainTimestamp: normalizeTimestamp(rawTx?.status?.block_time),
    rawEntry: rawTx,
  };
}

async function watchDeposits(input) {
  const network = client.normalizeNetwork(input?.network || MAINNET_NETWORK);
  const targetAddress = normalizeAddress(input?.address, network);
  const entries = await transaction.fetchHistory({
    network,
    address: targetAddress,
    limit: input?.limit || 50,
  });
  const seen = new Set();

  return entries
    .flatMap((entry) =>
      (Array.isArray(entry?.vout) ? entry.vout : [])
        .filter((output) =>
          String(output?.scriptpubkey_address || "").trim().toLowerCase() ===
            targetAddress.toLowerCase(),
        )
        .map((output) => buildCanonicalDepositEntry(entry, output, targetAddress)),
    )
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

async function matchDepositToWallet(depositEntry, network = MAINNET_NETWORK) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const destinationAddress = normalizeAddress(
    depositEntry?.toAddress ||
      depositEntry?.address ||
      depositEntry?.rawEntry?.vout?.[depositEntry?.vout || 0]?.scriptpubkey_address,
    normalizedNetwork,
  );

  const managedAddress = await WalletAddress.findOne({
    chain: "btc",
    network: normalizedNetwork,
    address: destinationAddress,
    isActive: true,
  }).lean();

  if (managedAddress?.walletId) {
    const matchedWallet = await Wallet.findOne({
      _id: managedAddress.walletId,
      chain: "btc",
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
    chain: "btc",
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
