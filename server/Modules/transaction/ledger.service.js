const Wallet = require("../wallet/model");
const LedgerEntry = require("./ledgerEntry.model");
const balanceService = require("../balance/service");

function normalizeLedgerEntryPayloads(payload) {
  const entries = Array.isArray(payload) ? payload : [payload];

  return entries.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
}

async function markInternalDeltaSummariesStale(entries = [], options = {}) {
  const walletIds = Array.from(
    new Set(
      entries
        .map((entry) => String(entry?.walletId || "").trim())
        .filter(Boolean),
    ),
  );
  const userIds = Array.from(
    new Set(
      entries
        .map((entry) => String(entry?.userId || "").trim())
        .filter(Boolean),
    ),
  );

  if (!walletIds.length && !userIds.length) {
    return;
  }

  const invalidatedAt = new Date();

  if (walletIds.length) {
    await Wallet.updateMany(
      { _id: { $in: walletIds } },
      {
        $set: {
          "metadata.balance.internalDeltaSummary.stale": true,
          "metadata.balance.internalDeltaSummary.lastInvalidatedAt": invalidatedAt,
          "metadata.balance.internalDeltaSummary.lastInvalidateReason": String(
            options.invalidateReason || "ledger_write",
          ),
        },
      },
    );
  }

  await Promise.all(
    userIds.map((userId) =>
      balanceService.invalidateBalanceReadState(userId, {
        clearPortfolioSnapshot: true,
      }),
    ),
  );
}

async function writeLedgerEntry(payload) {
  const entries = await writeLedgerEntries(payload);
  return Array.isArray(entries) ? entries[0] || null : entries;
}

async function writeLedgerEntries(payload, options = {}) {
  const entries = normalizeLedgerEntryPayloads(payload);

  if (!entries.length) {
    return [];
  }

  await markInternalDeltaSummariesStale(entries, options);
  return LedgerEntry.create(entries);
}

module.exports = {
  writeLedgerEntry,
  writeLedgerEntries,
};
