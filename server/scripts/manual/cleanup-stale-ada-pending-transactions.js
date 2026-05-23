const mongoose = require("mongoose");

const { requireEnv } = require("./utils");
const Wallet = require("../../Modules/wallet/model");
const Transaction = require("../../Modules/transaction/model");
const adaClient = require("../../Modules/chainAdapters/ada/client");
const { normalizeTxHash } = require("../../common/utils/txHash");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || String(next).startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function readStringArg(args, name, envName = "") {
  const cliValue = String(args[name] || "").trim();
  if (cliValue) {
    return cliValue;
  }

  return envName ? String(process.env[envName] || "").trim() : "";
}

async function resolveWalletScope(args) {
  const walletId = readStringArg(args, "walletId", "MANUAL_WALLET_ID");
  const address = readStringArg(args, "address", "MANUAL_WALLET_ADDRESS");
  const requestedNetwork = readStringArg(args, "network", "MANUAL_ADA_NETWORK");

  if (!walletId && !address) {
    return {
      walletQuery: {},
      scope: "all_ada_wallets",
    };
  }

  const query = {
    chain: "ada",
  };

  if (walletId) {
    query._id = walletId;
  } else {
    query.address = address;
    if (!requestedNetwork) {
      throw new Error("--network is required when using --address");
    }

    query.network = adaClient.normalizeNetwork(requestedNetwork);
  }

  const walletRecord = await Wallet.findOne(query)
    .select("_id address network")
    .lean();

  if (!walletRecord) {
    throw new Error("ADA wallet not found for the requested selector");
  }

  return {
    walletQuery: {
      walletId: walletRecord._id,
      network: walletRecord.network,
    },
    scope: {
      walletId: String(walletRecord._id),
      address: walletRecord.address,
      network: walletRecord.network,
    },
  };
}

function normalizeString(value) {
  return String(value || "").trim();
}

function getComparableTimestamp(transaction = {}) {
  return (
    transaction.confirmedAt ||
    transaction.chainTimestamp ||
    transaction.createdAt ||
    transaction.updatedAt ||
    null
  );
}

function serializeTransaction(transaction = {}) {
  const storedTxHash = normalizeString(transaction.txHash);
  const normalizedTxHash = normalizeTxHash(transaction.txHash);

  return {
    transactionId: String(transaction._id),
    walletId: String(transaction.walletId || ""),
    userId: String(transaction.userId || ""),
    accountId: String(transaction.accountId || ""),
    network: normalizeString(transaction.network),
    direction: normalizeString(transaction.direction),
    asset: normalizeString(transaction.asset),
    amount: normalizeString(transaction.amount),
    amountBaseUnits: normalizeString(transaction.amountBaseUnits),
    fromAddress: normalizeString(transaction.fromAddress),
    toAddress: normalizeString(transaction.toAddress),
    status: normalizeString(transaction.status),
    chainStatus: normalizeString(transaction.chainStatus),
    systemStatus: normalizeString(transaction.systemStatus),
    relatedTransactionId: normalizeString(transaction.relatedTransactionId),
    storedTxHash: storedTxHash || null,
    normalizedTxHash: normalizedTxHash || null,
    txHashNormalizationNeeded:
      Boolean(storedTxHash) && storedTxHash !== normalizedTxHash,
    createdAt: transaction.createdAt || null,
    updatedAt: transaction.updatedAt || null,
    chainTimestamp: transaction.chainTimestamp || null,
    confirmedAt: transaction.confirmedAt || null,
  };
}

function isConfirmedOrSuccessfulTransaction(transaction = {}) {
  const status = normalizeString(transaction.status).toLowerCase();
  const chainStatus = normalizeString(transaction.chainStatus).toLowerCase();
  return status === "success" || chainStatus === "confirmed";
}

function buildResolvedState(normalizedTxHash, matchedTransaction) {
  return {
    txHash: normalizedTxHash || null,
    status: "failed",
    chainStatus: "cancelled",
    systemStatus: "superseded_by_confirmed_ada_tx",
    relatedTransactionId: matchedTransaction ? matchedTransaction._id : undefined,
    errorMessage: matchedTransaction
      ? `Superseded by confirmed ADA transaction ${matchedTransaction._id} (${normalizedTxHash})`
      : `Superseded by confirmed ADA transaction ${normalizedTxHash}`,
  };
}

function buildPendingMatchIndex(transactions = []) {
  const byWalletAndHash = new Map();

  for (const transaction of transactions) {
    const normalizedTxHash = normalizeTxHash(transaction.txHash);
    if (!normalizedTxHash) {
      continue;
    }

    const key = [
      String(transaction.walletId || ""),
      normalizeString(transaction.network).toLowerCase(),
      normalizedTxHash,
    ].join("|");

    if (!byWalletAndHash.has(key)) {
      byWalletAndHash.set(key, []);
    }

    byWalletAndHash.get(key).push(transaction);
  }

  return byWalletAndHash;
}

async function run() {
  const args = parseArgs();
  const dbUri = requireEnv("DB_URI");
  const applyMode = args.apply === true;

  await mongoose.connect(dbUri);

  try {
    const { walletQuery, scope } = await resolveWalletScope(args);
    const baseQuery = {
      chain: "ada",
      transactionType: "external",
      type: "transfer",
      ...walletQuery,
    };

    const [allAdaTransactions, pendingAdaTransactions] = await Promise.all([
      Transaction.find(baseQuery)
        .sort({ createdAt: 1, _id: 1 }),
      Transaction.find({
        ...baseQuery,
        status: "pending",
      }).sort({ createdAt: 1, _id: 1 }),
    ]);

    const transactionsByWalletAndHash = buildPendingMatchIndex(allAdaTransactions);
    const report = {
      success: true,
      mode: applyMode ? "apply" : "dry-run",
      chain: "ada",
      scope,
      scannedAdaTransactions: allAdaTransactions.length,
      scannedAdaPendingTransactions: pendingAdaTransactions.length,
      pendingRowsNeedingTxHashNormalization: [],
      stalePendingRows: [],
      ambiguousStalePendingRows: [],
      appliedTxHashNormalizations: [],
      appliedResolutions: [],
    };

    for (const pendingTransaction of pendingAdaTransactions) {
      const serializedPending = serializeTransaction(pendingTransaction);
      const normalizedPendingTxHash = normalizeTxHash(pendingTransaction.txHash);
      const normalizationNeeded = serializedPending.txHashNormalizationNeeded;

      if (normalizationNeeded) {
        report.pendingRowsNeedingTxHashNormalization.push(serializedPending);
      }

      if (!normalizedPendingTxHash) {
        continue;
      }

      const key = [
        String(pendingTransaction.walletId || ""),
        normalizeString(pendingTransaction.network).toLowerCase(),
        normalizedPendingTxHash,
      ].join("|");
      const matchingTransactions = (transactionsByWalletAndHash.get(key) || [])
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

      if (!matchingTransactions.length) {
        continue;
      }

      const resolution = buildResolvedState(
        normalizedPendingTxHash,
        matchingTransactions[0] || null,
      );
      const row = {
        pending: serializedPending,
        matchingConfirmedRows: matchingTransactions.map((entry) =>
          serializeTransaction(entry),
        ),
        normalizationNeeded,
        resolutionPreview: {
          status: resolution.status,
          chainStatus: resolution.chainStatus,
          systemStatus: resolution.systemStatus,
          relatedTransactionId: resolution.relatedTransactionId
            ? String(resolution.relatedTransactionId)
            : null,
        },
      };

      if (matchingTransactions.length > 1) {
        report.ambiguousStalePendingRows.push(row);
        continue;
      }

      report.stalePendingRows.push(row);

      if (!applyMode) {
        continue;
      }

      const updatePayload = {
        ...buildResolvedState(normalizedPendingTxHash, matchingTransactions[0]),
      };
      const txHashChanged =
        normalizeString(pendingTransaction.txHash) !== normalizedPendingTxHash;

      await Transaction.updateOne(
        {
          _id: pendingTransaction._id,
          status: "pending",
          chain: "ada",
        },
        {
          $set: updatePayload,
        },
      );

      if (txHashChanged) {
        report.appliedTxHashNormalizations.push({
          transactionId: String(pendingTransaction._id),
          from: normalizeString(pendingTransaction.txHash) || null,
          to: normalizedPendingTxHash || null,
        });
      }

      report.appliedResolutions.push({
        transactionId: String(pendingTransaction._id),
        normalizedTxHash: normalizedPendingTxHash,
        relatedTransactionId: String(matchingTransactions[0]._id),
      });
    }

    if (applyMode) {
      const staleTransactionIds = new Set(
        report.appliedResolutions.map((entry) => entry.transactionId),
      );

      for (const pendingTransaction of pendingAdaTransactions) {
        const serializedPending = serializeTransaction(pendingTransaction);
        const normalizedPendingTxHash = normalizeTxHash(pendingTransaction.txHash);

        if (
          !serializedPending.txHashNormalizationNeeded ||
          staleTransactionIds.has(String(pendingTransaction._id))
        ) {
          continue;
        }

        await Transaction.updateOne(
          {
            _id: pendingTransaction._id,
            status: "pending",
            chain: "ada",
          },
          {
            $set: {
              txHash: normalizedPendingTxHash || null,
            },
          },
        );

        report.appliedTxHashNormalizations.push({
          transactionId: String(pendingTransaction._id),
          from: serializedPending.storedTxHash,
          to: normalizedPendingTxHash || null,
        });
      }
    }

    const affectedPendingTransactionIds = [
      ...new Set([
        ...report.pendingRowsNeedingTxHashNormalization.map(
          (entry) => entry.transactionId,
        ),
        ...report.stalePendingRows.map((entry) => entry.pending.transactionId),
        ...report.ambiguousStalePendingRows.map(
          (entry) => entry.pending.transactionId,
        ),
      ]),
    ];

    console.log(
      JSON.stringify(
        {
          success: report.success,
          mode: report.mode,
          chain: report.chain,
          scope: report.scope,
          scannedAdaTransactions: report.scannedAdaTransactions,
          scannedAdaPendingTransactions: report.scannedAdaPendingTransactions,
          pendingRowsNeedingTxHashNormalization:
            report.pendingRowsNeedingTxHashNormalization.length,
          stalePendingRows: report.stalePendingRows.length,
          ambiguousStalePendingRows: report.ambiguousStalePendingRows.length,
          appliedTxHashNormalizations: report.appliedTxHashNormalizations.length,
          appliedResolutions: report.appliedResolutions.length,
          affectedPendingTransactionIds,
        },
        null,
        2,
      ),
    );

    for (const section of [
      "pendingRowsNeedingTxHashNormalization",
      "stalePendingRows",
      "ambiguousStalePendingRows",
      "appliedTxHashNormalizations",
      "appliedResolutions",
    ]) {
      if (!report[section].length) {
        continue;
      }

      console.log(`\n# ${section}`);
      console.log(JSON.stringify(report[section], null, 2));
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
