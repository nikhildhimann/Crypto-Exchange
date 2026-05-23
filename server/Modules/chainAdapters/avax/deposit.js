const { getAddress } = require("ethers");

const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const transaction = require("./transaction");
const amount = require("./amount");
const { AppError } = require("../../../helpers/errors");

const MAINNET_NETWORK = "mainnet";
const DEFAULT_CONFIRMATIONS = 1;

function normalizeAddress(address) {
  const normalized = String(address || "").trim();
  if (!normalized) {
    throw AppError.validation("AVAX deposit address is required");
  }

  return getAddress(normalized);
}

function normalizeConfirmationCount(entry = {}) {
  const parsed = Number.parseInt(String(entry.confirmations ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function isIncomingNativeTransfer(entry, address) {
  const transactionPayload =
    entry?.transaction && typeof entry.transaction === "object" ? entry.transaction : {};
  const receipt = entry?.receipt && typeof entry.receipt === "object" ? entry.receipt : {};
  const normalizedAddress = String(address || "").toLowerCase();
  const toAddress = String(transactionPayload.to || "").toLowerCase();
  const value = String(transactionPayload.value || "0").trim();
  const confirmations = normalizeConfirmationCount(transactionPayload);
  const validated =
    Boolean(entry?.validated) ||
    typeof receipt.blockNumber === "number" ||
    typeof transactionPayload.blockNumber === "number";

  return (
    toAddress === normalizedAddress &&
    /^\d+$/.test(value) &&
    BigInt(value) > 0n &&
    entry?.succeeded === true &&
    validated &&
    confirmations >= DEFAULT_CONFIRMATIONS
  );
}

function buildCanonicalDepositEntry(entry, address) {
  const transactionPayload =
    entry?.transaction && typeof entry.transaction === "object" ? entry.transaction : {};
  const amountBaseUnits = String(transactionPayload.value || "0").trim();
  const txHash = String(entry?.txHash || transactionPayload.hash || "").trim();

  if (!txHash || !/^\d+$/.test(amountBaseUnits) || BigInt(amountBaseUnits) <= 0n) {
    return null;
  }

  return {
    hash: txHash,
    txHash,
    amount: amount.fromBaseUnits(amountBaseUnits),
    amountBaseUnits,
    confirmations: normalizeConfirmationCount(transactionPayload),
    fromAddress: String(transactionPayload.from || "").trim(),
    toAddress: normalizeAddress(address),
    chainStatus: entry.chainStatus || "confirmed",
    succeeded: entry.succeeded === true,
    validated: entry.validated === true,
    chainTimestamp: entry.timestamp ?? entry.chainTimestamp ?? null,
    rawEntry: entry,
  };
}

async function watchDeposits(input) {
  const network = String(input?.network || MAINNET_NETWORK).toLowerCase();
  if (network !== MAINNET_NETWORK) {
    return [];
  }

  const address = normalizeAddress(input?.address);
  const entries = await transaction.fetchHistory({
    network,
    address,
    limit: input?.limit || 50,
  });
  const seen = new Set();

  return entries
    .filter((entry) => isIncomingNativeTransfer(entry, address))
    .map((entry) => buildCanonicalDepositEntry(entry, address))
    .filter((entry) => {
      if (!entry || seen.has(entry.txHash)) {
        return false;
      }

      seen.add(entry.txHash);
      return true;
    });
}

async function matchDepositToWallet(depositEntry, network = MAINNET_NETWORK) {
  const normalizedNetwork = String(network || MAINNET_NETWORK).toLowerCase();
  if (normalizedNetwork !== MAINNET_NETWORK) {
    return null;
  }

  const destinationAddress = normalizeAddress(
    depositEntry?.toAddress ||
    depositEntry?.transaction?.to ||
    depositEntry?.rawEntry?.transaction?.to,
  );
  const txHash = String(depositEntry?.txHash || depositEntry?.hash || "").trim();

  if (!txHash) {
    return null;
  }

  const managedAddress = await WalletAddress.findOne({
    chain: "avax",
    network: normalizedNetwork,
    address: destinationAddress,
    isActive: true,
  }).lean();

  if (managedAddress?.walletId) {
    const wallet = await Wallet.findOne({
      _id: managedAddress.walletId,
      chain: "avax",
      network: normalizedNetwork,
    }).lean();

    if (wallet) {
      return {
        walletId: wallet._id,
        accountId: wallet.accountId,
        userId: wallet.userId,
        matchedBy: "managedAddress",
        destinationAddress,
      };
    }
  }

  const wallet = await Wallet.findOne({
    address: destinationAddress,
    chain: "avax",
    network: normalizedNetwork,
  }).lean();

  if (!wallet) {
    return null;
  }

  return {
    walletId: wallet._id,
    accountId: wallet.accountId,
    userId: wallet.userId,
    matchedBy: "address",
    destinationAddress,
  };
}

module.exports = {
  watchDeposits,
  matchDepositToWallet,
};
