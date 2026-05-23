const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const amount = require("./amount");
const client = require("./client");
const transaction = require("./transaction");
const wallet = require("./wallet");
const { AppError } = require("../../../helpers/errors");

const SUI_COIN_TYPE = "0x2::sui::SUI";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeAddress(address, network) {
  const normalizedNetwork = client.normalizeNetwork(network);

  try {
    return wallet.normalizeAddress(address);
  } catch (_error) {
    throw AppError.validation("SUI deposit address is invalid");
  }
}

function resolveBalanceOwner(balanceChange = {}) {
  const owner = balanceChange?.owner;

  if (typeof owner === "string") {
    return normalizeString(owner);
  }

  if (owner && typeof owner === "object") {
    if (typeof owner.AddressOwner === "string") {
      return normalizeString(owner.AddressOwner);
    }

    if (typeof owner.ObjectOwner === "string") {
      return normalizeString(owner.ObjectOwner);
    }
  }

  return "";
}

function normalizeTimestamp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  const timestamp = new Date(parsed);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function buildDepositEntry(rawEntry, balanceChange, index, targetAddress) {
  const txHash = normalizeString(rawEntry?.digest || rawEntry?.txHash);
  const amountBaseUnits = BigInt(String(balanceChange?.amount || "0"));
  const senderAddress = normalizeString(rawEntry?.transaction?.data?.sender || rawEntry?.sender);
  const chainTimestamp = normalizeTimestamp(rawEntry?.timestampMs);
  const succeeded = normalizeString(rawEntry?.effects?.status?.status).toLowerCase() === "success";

  if (!txHash || amountBaseUnits <= 0n) {
    return null;
  }

  return {
    hash: txHash,
    txHash,
    vout: index,
    outputIndex: index,
    amount: amount.fromBaseUnits(amountBaseUnits.toString()),
    amountBaseUnits: amountBaseUnits.toString(),
    confirmations: chainTimestamp ? 1 : 0,
    fromAddress: senderAddress,
    toAddress: targetAddress,
    chainStatus: succeeded ? "confirmed" : "failed",
    succeeded,
    validated: Boolean(chainTimestamp || rawEntry?.checkpoint),
    chainTimestamp,
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
    .flatMap((entry) => {
      const senderAddress = normalizeString(entry?.transaction?.data?.sender || entry?.sender);
      const balanceChanges = (Array.isArray(entry?.balanceChanges) ? entry.balanceChanges : [])
        .map((balanceChange, index) => ({
          balanceChange,
          index,
          owner: resolveBalanceOwner(balanceChange),
          coinType: normalizeString(balanceChange?.coinType).toLowerCase(),
          amount: BigInt(String(balanceChange?.amount || "0")),
        }))
        .filter(
          (candidate) =>
            candidate.owner &&
            wallet.validateAddress(candidate.owner) &&
            wallet.normalizeAddress(candidate.owner) === targetAddress &&
            candidate.coinType === SUI_COIN_TYPE.toLowerCase() &&
            candidate.amount > 0n,
        );

      if (!balanceChanges.length) {
        return [];
      }

      if (senderAddress && wallet.validateAddress(senderAddress)) {
        if (wallet.normalizeAddress(senderAddress) === targetAddress) {
          return [];
        }
      }

      return balanceChanges.map((candidate) =>
        buildDepositEntry(entry, candidate.balanceChange, candidate.index, targetAddress),
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

async function matchDepositToWallet(depositEntry, network = client.DEFAULT_NETWORK) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const destinationAddress = normalizeAddress(
    depositEntry?.toAddress || depositEntry?.address,
    normalizedNetwork,
  );

  const managedAddress = await WalletAddress.findOne({
    chain: "sui",
    network: normalizedNetwork,
    address: destinationAddress,
    isActive: true,
  }).lean();

  if (managedAddress?.walletId) {
    const matchedWallet = await Wallet.findOne({
      _id: managedAddress.walletId,
      chain: "sui",
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
    chain: "sui",
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
