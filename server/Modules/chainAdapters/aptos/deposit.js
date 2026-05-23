const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const amount = require("./amount");
const client = require("./client");
const mapper = require("./mapper");
const transaction = require("./transaction");
const wallet = require("./wallet");
const { AppError } = require("../../../helpers/errors");
const APTOS_DEPOSIT_EVENT_TYPE = "0x1::fungible_asset::Deposit";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeAddress(address, network) {
  client.normalizeNetwork(network);

  try {
    return wallet.normalizeAddress(address);
  } catch (_error) {
    throw AppError.validation("APT deposit address is invalid");
  }
}

function buildDepositEntry(mapped = {}, rawEntry = {}) {
  const txHash = normalizeString(mapped.txHash || rawEntry.hash);
  const amountBaseUnits = normalizeString(mapped.amountBaseUnits || "0");
  const amountBigInt = /^\d+$/.test(amountBaseUnits) ? BigInt(amountBaseUnits) : 0n;

  if (!txHash || amountBigInt <= 0n) {
    return null;
  }

  return {
    hash: txHash,
    txHash,
    vout: 0,
    outputIndex: 0,
    amount: amount.fromBaseUnits(amountBaseUnits),
    amountBaseUnits,
    confirmations: Number(mapped.confirmations || 0),
    fromAddress: normalizeString(mapped.fromAddress),
    toAddress: normalizeString(mapped.toAddress),
    chainStatus: normalizeString(mapped.chainStatus || "confirmed"),
    succeeded: mapped.succeeded === true,
    validated: mapped.validated === true,
    chainTimestamp: mapped.chainTimestamp,
    rawEntry,
  };
}

async function verifyDepositByTxHash(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(
    input.network || client.DEFAULT_NETWORK,
  );
  const targetAddress = normalizeAddress(
    input.address || input.toAddress || input.destinationAddress,
    normalizedNetwork,
  );
  const rawEntry = await transaction.fetchTransactionByHash({
    network: normalizedNetwork,
    txHash: input.txHash || input.transactionHash,
    retries: input.retries,
    retryDelayMs: input.retryDelayMs,
  });

  if (!rawEntry) {
    throw AppError.notFound("APT transaction was not found on-chain");
  }

  const mapped = mapper.mapTransaction(
    {
      ...rawEntry,
      network: normalizedNetwork,
      walletAddress: targetAddress,
      walletAddresses: [targetAddress],
    },
    targetAddress,
  );

  if (!mapped || mapped.direction !== "incoming") {
    throw AppError.validation("APT transaction is not a deposit to this wallet");
  }

  if (
    input.expectedAmount !== undefined &&
    amount.normalizeDisplayAmount(input.expectedAmount) !== mapped.amount
  ) {
    throw AppError.validation("APT deposit amount does not match the expected amount");
  }

  if (
    input.expectedAmountBaseUnits !== undefined &&
    normalizeString(input.expectedAmountBaseUnits) !== mapped.amountBaseUnits
  ) {
    throw AppError.validation("APT deposit amount does not match the expected amount");
  }

  return buildDepositEntry(mapped, rawEntry);
}

async function watchDeposits(input = {}) {
  const network = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const targetAddress = normalizeAddress(input.address, network);
  const aptosClient = client.getClient(network);
  const activities = await aptosClient.getFungibleAssetActivities({
    limit: input.limit || 50,
    where: {
      owner_address: { _eq: targetAddress },
      is_transaction_success: { _eq: true },
      type: { _eq: APTOS_DEPOSIT_EVENT_TYPE },
    },
  });
  const seen = new Set();
  const versions = Array.from(
    new Set(
      (Array.isArray(activities) ? activities : [])
        .map((entry) => normalizeString(entry?.transaction_version))
        .filter((entry) => /^\d+$/.test(entry)),
    ),
  );
  const entries = await Promise.all(
    versions.map((version) =>
      aptosClient
        .getTransactionByVersion(version)
        .then((entry) => ({
          ...entry,
          network,
        })),
    ),
  );

  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      raw: entry,
      mapped: mapper.mapTransaction(
        {
          ...entry,
          network,
          walletAddress: targetAddress,
          walletAddresses: [targetAddress],
        },
        targetAddress,
      ),
    }))
    .filter(({ mapped }) => mapped && mapped.direction === "incoming")
    .map(({ raw, mapped }) => buildDepositEntry(mapped, raw))
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
    chain: "aptos",
    network: normalizedNetwork,
    address: destinationAddress,
    isActive: true,
  }).lean();

  if (managedAddress?.walletId) {
    const matchedWallet = await Wallet.findOne({
      _id: managedAddress.walletId,
      chain: "aptos",
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
    chain: "aptos",
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
  verifyDepositByTxHash,
};
