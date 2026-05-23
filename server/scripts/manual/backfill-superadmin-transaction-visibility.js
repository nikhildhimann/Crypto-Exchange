const mongoose = require("mongoose");

const { requireEnv } = require("./utils");
const Transaction = require("../../Modules/transaction/model");
const Deposit = require("../../Modules/deposit/model");
const Withdrawal = require("../../Modules/withdrawal/model");
const LedgerEntry = require("../../Modules/transaction/ledgerEntry.model");

function toIdString(value) {
  if (!value) {
    return "";
  }

  return String(value).trim();
}

function toObjectIds(values = []) {
  return values
    .map((value) => toIdString(value))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((value) => new mongoose.Types.ObjectId(value));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

async function collectCandidateIds() {
  const categoryCounts = {};
  const candidateIds = new Set();

  const addIds = (label, values = []) => {
    let added = 0;

    for (const value of values) {
      const normalized = toIdString(value);
      if (!normalized) {
        continue;
      }

      if (!candidateIds.has(normalized)) {
        candidateIds.add(normalized);
        added += 1;
      }
    }

    categoryCounts[label] = {
      matched: values.length,
      added,
    };
  };

  addIds(
    "internal_transactions",
    await Transaction.distinct("_id", {
      visibleInSuperadmin: { $ne: true },
      transactionType: "internal",
    }),
  );

  addIds(
    "system_managed_transactions",
    await Transaction.distinct("_id", {
      visibleInSuperadmin: { $ne: true },
      isSystemManaged: true,
    }),
  );

  addIds(
    "fee_transactions",
    await Transaction.distinct("_id", {
      visibleInSuperadmin: { $ne: true },
      type: "fee",
    }),
  );

  addIds(
    "linked_related_transactions",
    await Transaction.distinct("_id", {
      visibleInSuperadmin: { $ne: true },
      relatedTransactionId: { $exists: true, $ne: null },
    }),
  );

  addIds(
    "ledger_linked_transactions",
    await LedgerEntry.distinct("transactionId", {
      transactionId: { $exists: true, $ne: null },
    }),
  );

  addIds(
    "deposit_watcher_transactions",
    await Deposit.distinct("transactionId", {
      transactionId: { $exists: true, $ne: null },
      "metadata.source": { $in: ["deposit_watcher", "same_platform_send"] },
    }),
  );

  addIds(
    "withdrawal_flow_transactions",
    await Withdrawal.distinct("transactionId", {
      transactionId: { $exists: true, $ne: null },
      $or: [
        { "metadata.source": "send_flow" },
        { reference: /^WD-/i },
      ],
    }),
  );

  return {
    candidateIds: Array.from(candidateIds),
    categoryCounts,
  };
}

async function run() {
  const dbUri = requireEnv("DB_URI");
  const dryRun = parseBoolean(process.env.BACKFILL_DRY_RUN, false);

  await mongoose.connect(dbUri);

  const alreadyVisibleCount = await Transaction.countDocuments({
    visibleInSuperadmin: true,
  });

  const { candidateIds, categoryCounts } = await collectCandidateIds();
  const objectIds = toObjectIds(candidateIds);

  console.log(
    JSON.stringify(
      {
        dryRun,
        alreadyVisibleCount,
        candidateCount: objectIds.length,
        categoryCounts,
      },
      null,
      2,
    ),
  );

  if (!objectIds.length) {
    console.log("No historical transactions qualified for conservative backfill.");
    await mongoose.disconnect();
    return;
  }

  if (dryRun) {
    console.log("Dry run enabled. No documents were updated.");
    await mongoose.disconnect();
    return;
  }

  const result = await Transaction.updateMany(
    {
      _id: { $in: objectIds },
      visibleInSuperadmin: { $ne: true },
    },
    {
      $set: { visibleInSuperadmin: true },
    },
  );

  const finalVisibleCount = await Transaction.countDocuments({
    visibleInSuperadmin: true,
  });

  console.log(
    JSON.stringify(
      {
        matchedCount: result.matchedCount || 0,
        modifiedCount: result.modifiedCount || 0,
        finalVisibleCount,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(1);
});
