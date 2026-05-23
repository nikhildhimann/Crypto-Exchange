const Transaction = require("../../transaction/model");
const { normalizeTxHash } = require("../../../common/utils/txHash");

// How far back to search for confirmed transactions when building the reconciliation
// hash map. 30-day window covers any realistically delayed confirmation without
// loading the full wallet history into memory.
const RECONCILIATION_CONFIRMED_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeString(value) {
  return String(value || "").trim();
}

function isConfirmedOrSuccessfulTransaction(transaction = {}) {
  const status = normalizeString(transaction.status).toLowerCase();
  const chainStatus = normalizeString(transaction.chainStatus).toLowerCase();
  return status === "success" || chainStatus === "confirmed";
}

function getComparableTimestamp(transaction = {}) {
  return (
    transaction.confirmedAt ||
    transaction.chainTimestamp ||
    transaction.updatedAt ||
    transaction.createdAt ||
    null
  );
}

async function reconcilePendingTransactionsForWallet({
  walletId,
  chain,
  network,
  logger = null,
  logContext = {},
} = {}) {
  if (!walletId || !chain || !network) {
    return {
      scannedPending: 0,
      normalizedTxHashes: 0,
      superseded: 0,
      ambiguous: 0,
    };
  }

  const confirmedLookbackCutoff = new Date(Date.now() - RECONCILIATION_CONFIRMED_LOOKBACK_MS);

  const [walletTransactions, pendingTransactions] = await Promise.all([
    // Scope to recent confirmed/success rows only — old confirmed rows cannot
    // match a pending row that was created recently, so loading the full wallet
    // history is unnecessary and grows unboundedly as history accumulates.
    Transaction.find({
      walletId,
      chain,
      network,
      transactionType: "external",
      type: "transfer",
      status: { $in: ["success", "failed"] },
      createdAt: { $gte: confirmedLookbackCutoff },
    })
      .select(
        "_id walletId chain network txHash status chainStatus systemStatus relatedTransactionId errorMessage createdAt updatedAt chainTimestamp confirmedAt",
      )
      .lean(),
    Transaction.find({
      walletId,
      chain,
      network,
      transactionType: "external",
      type: "transfer",
      status: "pending",
    })
      .select(
        "_id walletId chain network txHash status chainStatus systemStatus relatedTransactionId errorMessage createdAt updatedAt chainTimestamp confirmedAt",
      )
      .lean(),
  ]);

  const byNormalizedHash = new Map();
  for (const transaction of walletTransactions) {
    const normalizedHash = normalizeTxHash(transaction.txHash);
    if (!normalizedHash) {
      continue;
    }

    if (!byNormalizedHash.has(normalizedHash)) {
      byNormalizedHash.set(normalizedHash, []);
    }

    byNormalizedHash.get(normalizedHash).push(transaction);
  }

  let normalizedTxHashes = 0;
  let superseded = 0;
  let ambiguous = 0;

  for (const pendingTransaction of pendingTransactions) {
    const storedTxHash = normalizeString(pendingTransaction.txHash);
    const normalizedHash = normalizeTxHash(pendingTransaction.txHash);
    const matchingConfirmedTransactions = (byNormalizedHash.get(normalizedHash) || [])
      .filter(
        (candidate) =>
          String(candidate._id) !== String(pendingTransaction._id) &&
          isConfirmedOrSuccessfulTransaction(candidate),
      )
      .sort((left, right) => {
        const leftTime = new Date(getComparableTimestamp(left) || 0).getTime();
        const rightTime = new Date(getComparableTimestamp(right) || 0).getTime();
        return rightTime - leftTime;
      });

    if (storedTxHash && storedTxHash !== normalizedHash) {
      await Transaction.updateOne(
        {
          _id: pendingTransaction._id,
          status: "pending",
          chain,
          network,
        },
        {
          $set: {
            txHash: normalizedHash || null,
          },
        },
      );
      normalizedTxHashes += 1;
    }

    if (!normalizedHash || !matchingConfirmedTransactions.length) {
      continue;
    }

    if (matchingConfirmedTransactions.length > 1) {
      ambiguous += 1;
      continue;
    }

    const confirmedTransaction = matchingConfirmedTransactions[0];
    await Transaction.updateOne(
      {
        _id: pendingTransaction._id,
        status: "pending",
        chain,
        network,
      },
      {
        $set: {
          txHash: normalizedHash || null,
          status: "failed",
          chainStatus: "cancelled",
          systemStatus: "superseded_by_confirmed_ada_tx",
          relatedTransactionId: confirmedTransaction._id,
          errorMessage: `Superseded by confirmed ADA transaction ${confirmedTransaction._id} (${normalizedHash})`,
        },
      },
    );
    superseded += 1;

    if (logger?.info) {
      logger.info("Reconciled superseded ADA pending transaction", {
        ...logContext,
        walletId: String(walletId),
        chain,
        network,
        pendingTransactionId: String(pendingTransaction._id),
        confirmedTransactionId: String(confirmedTransaction._id),
        txHash: normalizedHash,
      });
    }
  }

  return {
    scannedPending: pendingTransactions.length,
    normalizedTxHashes,
    superseded,
    ambiguous,
  };
}

module.exports = {
  reconcilePendingTransactionsForWallet,
};
