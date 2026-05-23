const mongoose = require("mongoose");

const { requireEnv } = require("./utils");
const Wallet = require("../../Modules/wallet/model");
const Transaction = require("../../Modules/transaction/model");
const adaAmount = require("../../Modules/chainAdapters/ada/amount");
const adaClient = require("../../Modules/chainAdapters/ada/client");
const adaMapper = require("../../Modules/chainAdapters/ada/mapper");
const adaTransaction = require("../../Modules/chainAdapters/ada/transaction");
const { normalizeTxHash } = require("../../common/utils/txHash");

const DEFAULT_HISTORY_LIMIT = 100;
const UPDATE_FIELDS = [
  "direction",
  "fromAddress",
  "toAddress",
  "executionParams",
  "amount",
  "amountBaseUnits",
  "currency",
  "asset",
  "assetType",
  "standard",
  "contractAddress",
  "networkFee",
  "networkFeeBaseUnits",
  "networkFeeAsset",
  "networkFeeCurrency",
  "networkFeeAssetType",
  "platformFee",
  "platformFeeBaseUnits",
  "totalDebit",
  "totalDebitBaseUnits",
  "totalDebitAsset",
  "totalDebitCurrency",
  "totalDebitAssetType",
  "compositeDebit",
  "recipientGets",
  "recipientGetsBaseUnits",
  "txHash",
  "ledgerIndex",
  "chainStatus",
  "systemStatus",
  "status",
  "isSystemManaged",
  "rawRequest",
  "rawResponse",
  "chainTimestamp",
  "confirmedAt",
];

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

function readIntegerArg(args, name, defaultValue) {
  const raw = String(args[name] ?? "").trim();
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }

  return parsed;
}

function normalizeComparable(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeComparable(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = normalizeComparable(value[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function addBaseUnits(left = "0", right = "0") {
  return (
    BigInt(String(left || "0").trim() || "0") +
    BigInt(String(right || "0").trim() || "0")
  ).toString();
}

function getExecutionStatus(mapped = {}) {
  if (mapped.succeeded) {
    return "success";
  }

  return mapped.validated ? "failed" : "pending";
}

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function buildTransactionTimeFields(mapped = {}, existing = null) {
  const nextChainTimestamp = normalizeTimestamp(
    mapped.chainTimestamp || mapped.confirmedAt,
  );
  const persistedChainTimestamp = normalizeTimestamp(existing?.chainTimestamp);
  const persistedConfirmedAt = normalizeTimestamp(existing?.confirmedAt);

  const chainTimestamp = nextChainTimestamp || persistedChainTimestamp;
  const confirmedAt = mapped.validated
    ? normalizeTimestamp(mapped.confirmedAt) ||
      chainTimestamp ||
      persistedConfirmedAt ||
      persistedChainTimestamp
    : persistedConfirmedAt;

  return {
    ...(chainTimestamp ? { chainTimestamp } : {}),
    ...(confirmedAt ? { confirmedAt } : {}),
  };
}

function buildAdaPayload(walletRecord, mapped, entry, existing = null) {
  const amountBaseUnits = String(mapped.amountBaseUnits || "0");
  const networkFeeBaseUnits = String(mapped.networkFeeBaseUnits || "0");
  const totalDebitBaseUnits =
    mapped.direction === "outgoing"
      ? addBaseUnits(amountBaseUnits, networkFeeBaseUnits)
      : "0";
  const isSystemManaged = existing?.isSystemManaged === true;
  const payload = {
    userId: walletRecord.userId,
    walletId: walletRecord._id,
    chain: "ada",
    type: "transfer",
    transactionType: "external",
    direction: mapped.direction,
    fromAddress: mapped.fromAddress,
    toAddress: mapped.toAddress,
    executionParams:
      mapped.executionParams && typeof mapped.executionParams === "object"
        ? mapped.executionParams
        : {},
    amount: mapped.amount || adaAmount.fromBaseUnits(amountBaseUnits),
    amountBaseUnits,
    currency: mapped.currency || "ADA",
    asset: mapped.asset || mapped.currency || "ADA",
    assetType: mapped.assetType || "native",
    standard: mapped.standard || "native",
    contractAddress: mapped.contractAddress || null,
    network: walletRecord.network,
    networkFee: mapped.networkFee || adaAmount.fromBaseUnits(networkFeeBaseUnits),
    networkFeeBaseUnits,
    networkFeeAsset: mapped.networkFeeAsset || "ADA",
    networkFeeCurrency: mapped.networkFeeCurrency || "ADA",
    networkFeeAssetType: mapped.networkFeeAssetType || "native",
    platformFee: "0",
    platformFeeBaseUnits: "0",
    totalDebit:
      mapped.totalDebit ||
      adaAmount.fromBaseUnits(totalDebitBaseUnits),
    totalDebitBaseUnits,
    totalDebitAsset: mapped.totalDebitAsset || mapped.asset || "ADA",
    totalDebitCurrency: mapped.totalDebitCurrency || mapped.currency || "ADA",
    totalDebitAssetType: mapped.totalDebitAssetType || mapped.assetType || "native",
    compositeDebit: mapped.compositeDebit || null,
    recipientGets: mapped.amount || adaAmount.fromBaseUnits(amountBaseUnits),
    recipientGetsBaseUnits: amountBaseUnits,
    txHash: normalizeTxHash(mapped.txHash) || null,
    ledgerIndex: Number(mapped.ledgerIndex || 0) || undefined,
    chainStatus: mapped.chainStatus || "synced",
    systemStatus: isSystemManaged
      ? existing.systemStatus || "synced_system_fee"
      : "synced_from_ada",
    status: getExecutionStatus(mapped),
    isSystemManaged,
    rawRequest: mapped.tx && typeof mapped.tx === "object" ? mapped.tx : {},
    rawResponse: entry && typeof entry === "object" ? entry : {},
    ...buildTransactionTimeFields(mapped, existing),
  };

  if (walletRecord.accountId) {
    payload.accountId = walletRecord.accountId;
  }

  return payload;
}

function diffPayload(existingDoc, payload) {
  const existing = existingDoc?.toObject ? existingDoc.toObject() : existingDoc;
  const changes = [];

  for (const field of UPDATE_FIELDS) {
    const previousValue = normalizeComparable(existing?.[field]);
    const nextValue = normalizeComparable(payload?.[field]);
    if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
      changes.push({
        field,
        before: previousValue,
        after: nextValue,
      });
    }
  }

  return changes;
}

async function resolveWallet(args) {
  const walletId = readStringArg(args, "walletId", "MANUAL_WALLET_ID");
  const address = readStringArg(args, "address", "MANUAL_WALLET_ADDRESS");
  const requestedNetwork = readStringArg(args, "network", "MANUAL_ADA_NETWORK");

  if (!walletId && !address) {
    throw new Error("Either --walletId or --address is required");
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
    .select("_id userId accountId chain network address")
    .lean();

  if (!walletRecord) {
    throw new Error("ADA wallet not found for the requested selector");
  }

  if (requestedNetwork) {
    const normalizedRequestedNetwork = adaClient.normalizeNetwork(requestedNetwork);
    if (walletRecord.network !== normalizedRequestedNetwork) {
      throw new Error(
        `Wallet network mismatch: wallet is "${walletRecord.network}", requested "${normalizedRequestedNetwork}"`,
      );
    }
  }

  return walletRecord;
}

async function run() {
  const args = parseArgs();
  const dbUri = requireEnv("DB_URI");
  const historyLimit = readIntegerArg(args, "limit", DEFAULT_HISTORY_LIMIT);
  const applyMode = args.apply === true;

  await mongoose.connect(dbUri);

  try {
    const walletRecord = await resolveWallet(args);
    const existingTransactions = await Transaction.find({
      walletId: walletRecord._id,
      chain: "ada",
      network: walletRecord.network,
      transactionType: "external",
      type: "transfer",
    }).sort({ chainTimestamp: -1, createdAt: -1 });

    const existingByTxHash = new Map();
    for (const transaction of existingTransactions) {
      const txHash = normalizeTxHash(transaction.txHash);
      if (!txHash) {
        continue;
      }

      const entries = existingByTxHash.get(txHash) || [];
      entries.push(transaction);
      existingByTxHash.set(txHash, entries);
    }

    const entries = await adaTransaction.fetchHistory({
      network: walletRecord.network,
      address: walletRecord.address,
      limit: historyLimit,
    });

    const report = {
      scannedHistoryEntries: entries.length,
      existingAdaTransactions: existingTransactions.length,
      exactExistingByHash: existingByTxHash.size,
      unchanged: [],
      wouldUpdate: [],
      wouldCreate: [],
      skippedAmbiguous: [],
      skippedUnmapped: [],
      existingDuplicateHashes: [],
      unmatchedExistingTransactions: [],
      appliedUpdates: [],
      appliedCreates: [],
    };
    const matchedTxHashes = new Set();

    for (const entry of entries) {
      const mapped = adaMapper.mapTransaction(entry, walletRecord.address);
      const txHash = normalizeTxHash(mapped?.txHash);

      if (!mapped || !txHash) {
        report.skippedUnmapped.push({
          txHash: txHash || normalizeTxHash(entry?.txHash),
          reason: mapped ? "missing_tx_hash" : "ambiguous_or_unmappable",
        });
        continue;
      }

      matchedTxHashes.add(txHash);
      const existingMatches = existingByTxHash.get(txHash) || [];

      if (existingMatches.length > 1) {
        report.existingDuplicateHashes.push({
          txHash,
          transactionIds: existingMatches.map((match) => String(match._id)),
        });
        report.skippedAmbiguous.push({
          txHash,
          reason: "multiple_existing_rows_for_same_tx_hash",
        });
        continue;
      }

      if (mapped.direction === "outgoing" && String(mapped.amountBaseUnits || "0") === "0") {
        report.skippedAmbiguous.push({
          txHash,
          reason: "outgoing_amount_could_not_be_mapped_safely",
        });
        continue;
      }

      const existing = existingMatches[0] || null;
      const payload = buildAdaPayload(walletRecord, mapped, entry, existing);

      if (existing) {
        const changes = diffPayload(existing, payload);
        if (!changes.length) {
          report.unchanged.push({
            txHash,
            transactionId: String(existing._id),
          });
          continue;
        }

        report.wouldUpdate.push({
          txHash,
          transactionId: String(existing._id),
          changes,
        });

        if (applyMode) {
          await Transaction.updateOne({ _id: existing._id }, { $set: payload });
          report.appliedUpdates.push({
            txHash,
            transactionId: String(existing._id),
            changedFields: changes.map((entryChange) => entryChange.field),
          });
        }

        continue;
      }

      report.wouldCreate.push({
        txHash,
        direction: payload.direction,
        amount: payload.amount,
        fromAddress: payload.fromAddress,
        toAddress: payload.toAddress,
      });

      if (applyMode) {
        const created = await Transaction.create(payload);
        report.appliedCreates.push({
          txHash,
          transactionId: String(created._id),
        });
      }
    }

    for (const transaction of existingTransactions) {
      const storedTxHash = String(transaction.txHash || "").trim();
      const txHash = normalizeTxHash(transaction.txHash);
      if (!txHash || matchedTxHashes.has(txHash)) {
        continue;
      }

      report.unmatchedExistingTransactions.push({
        storedTxHash: storedTxHash || null,
        txHash,
        txHashNormalizationNeeded:
          Boolean(storedTxHash) && storedTxHash !== txHash,
        transactionId: String(transaction._id),
        status: transaction.status,
        chainStatus: transaction.chainStatus,
      });
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          mode: applyMode ? "apply" : "dry-run",
          walletId: String(walletRecord._id),
          walletAddress: walletRecord.address,
          chain: "ada",
          network: walletRecord.network,
          historyLimit,
          existingAdaTransactions: report.existingAdaTransactions,
          scannedHistoryEntries: report.scannedHistoryEntries,
          wouldUpdate: report.wouldUpdate.length,
          wouldCreate: report.wouldCreate.length,
          skippedAmbiguous: report.skippedAmbiguous.length,
          skippedUnmapped: report.skippedUnmapped.length,
          existingDuplicateHashes: report.existingDuplicateHashes.length,
          unmatchedExistingTransactions: report.unmatchedExistingTransactions.length,
          appliedUpdates: report.appliedUpdates.length,
          appliedCreates: report.appliedCreates.length,
        },
        null,
        2,
      ),
    );

    for (const section of [
      "existingDuplicateHashes",
      "wouldUpdate",
      "wouldCreate",
      "skippedAmbiguous",
      "skippedUnmapped",
      "unmatchedExistingTransactions",
      "appliedUpdates",
      "appliedCreates",
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
