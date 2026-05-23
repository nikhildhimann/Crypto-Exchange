const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", ".env"),
  quiet: true,
});

const Transaction = require("../../Modules/transaction/model");

const PROBABLE_DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 50;

function parseLimit() {
  const rawValue = process.argv[2];
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function getComparableTimestamp(transaction = {}) {
  const candidate =
    transaction.chainTimestamp ||
    transaction.confirmedAt ||
    transaction.createdAt ||
    transaction.updatedAt ||
    null;

  if (!candidate) {
    return 0;
  }

  const parsed = new Date(candidate).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildProbableDuplicateSignature(transaction = {}) {
  return [
    normalizeString(transaction.userId),
    normalizeString(transaction.accountId),
    normalizeString(transaction.walletId),
    normalizeString(transaction.chain).toLowerCase(),
    normalizeString(transaction.network).toLowerCase(),
    normalizeString(transaction.direction).toLowerCase(),
    normalizeString(transaction.asset).toUpperCase(),
    normalizeString(transaction.assetType).toLowerCase(),
    normalizeString(transaction.standard).toLowerCase(),
    normalizeString(transaction.contractAddress),
    normalizeString(transaction.amountBaseUnits),
    normalizeString(transaction.fromAddress),
    normalizeString(transaction.toAddress),
  ].join("|");
}

function toSerializableTransaction(transaction = {}) {
  return {
    id: String(transaction._id || ""),
    userId: normalizeString(transaction.userId),
    accountId: normalizeString(transaction.accountId),
    walletId: normalizeString(transaction.walletId),
    chain: normalizeString(transaction.chain),
    network: normalizeString(transaction.network),
    direction: normalizeString(transaction.direction),
    asset: normalizeString(transaction.asset),
    assetType: normalizeString(transaction.assetType),
    standard: normalizeString(transaction.standard),
    contractAddress: normalizeString(transaction.contractAddress),
    amountBaseUnits: normalizeString(transaction.amountBaseUnits),
    fromAddress: normalizeString(transaction.fromAddress),
    toAddress: normalizeString(transaction.toAddress),
    txHash: normalizeString(transaction.txHash),
    status: normalizeString(transaction.status),
    createdAt: transaction.createdAt || null,
    updatedAt: transaction.updatedAt || null,
    chainTimestamp: transaction.chainTimestamp || null,
    confirmedAt: transaction.confirmedAt || null,
  };
}

async function findExactHashDuplicates(limit) {
  return Transaction.aggregate([
    {
      $match: {
        txHash: {
          $exists: true,
          $type: "string",
          $nin: ["", null],
        },
      },
    },
    {
      $group: {
        _id: {
          walletId: "$walletId",
          txHash: "$txHash",
        },
        count: { $sum: 1 },
        userIds: { $addToSet: "$userId" },
        accountIds: { $addToSet: "$accountId" },
        chains: { $addToSet: "$chain" },
        networks: { $addToSet: "$network" },
        statuses: { $addToSet: "$status" },
        transactionIds: { $push: "$_id" },
        createdAtMin: { $min: "$createdAt" },
        createdAtMax: { $max: "$createdAt" },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
    {
      $sort: {
        count: -1,
        createdAtMax: -1,
      },
    },
    {
      $limit: limit,
    },
  ]);
}

async function findProbablePendingSuccessDuplicates(limit) {
  const transactions = await Transaction.find({
    transactionType: "external",
    type: "transfer",
    status: { $in: ["pending", "success"] },
  })
    .select([
      "_id",
      "userId",
      "accountId",
      "walletId",
      "chain",
      "network",
      "direction",
      "asset",
      "assetType",
      "standard",
      "contractAddress",
      "amountBaseUnits",
      "fromAddress",
      "toAddress",
      "txHash",
      "status",
      "createdAt",
      "updatedAt",
      "chainTimestamp",
      "confirmedAt",
    ].join(" "))
    .sort({ createdAt: -1 })
    .lean();

  const groups = new Map();

  for (const transaction of transactions) {
    const key = buildProbableDuplicateSignature(transaction);
    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(transaction);
  }

  const probablePairs = [];

  for (const [signature, groupTransactions] of groups.entries()) {
    const pendingWithoutHash = groupTransactions.filter(
      (transaction) =>
        normalizeString(transaction.status).toLowerCase() === "pending" &&
        !normalizeString(transaction.txHash),
    );
    const successWithHash = groupTransactions.filter(
      (transaction) =>
        normalizeString(transaction.status).toLowerCase() === "success" &&
        Boolean(normalizeString(transaction.txHash)),
    );

    if (!pendingWithoutHash.length || !successWithHash.length) {
      continue;
    }

    for (const pendingTransaction of pendingWithoutHash) {
      for (const successTransaction of successWithHash) {
        const timeDeltaMs = Math.abs(
          getComparableTimestamp(pendingTransaction) -
            getComparableTimestamp(successTransaction),
        );

        if (timeDeltaMs > PROBABLE_DUPLICATE_WINDOW_MS) {
          continue;
        }

        probablePairs.push({
          signature,
          timeDeltaMs,
          pending: toSerializableTransaction(pendingTransaction),
          success: toSerializableTransaction(successTransaction),
        });
      }
    }
  }

  probablePairs.sort((left, right) => left.timeDeltaMs - right.timeDeltaMs);

  return probablePairs.slice(0, limit);
}

async function run() {
  const limit = parseLimit();
  const dbUri = normalizeString(process.env.DB_URI);

  if (!dbUri) {
    throw new Error("DB_URI is required to run the transaction duplicate audit");
  }

  await mongoose.connect(dbUri);

  try {
    const [exactDuplicates, probablePendingSuccessPairs] = await Promise.all([
      findExactHashDuplicates(limit),
      findProbablePendingSuccessDuplicates(limit),
    ]);

    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          limit,
          exactDuplicatesByWalletIdAndTxHash: exactDuplicates,
          probablePendingSuccessPairs,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
