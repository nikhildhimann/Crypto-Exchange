// Transitional compatibility for older ledger rows that may predate amountBaseUnits.
// This module is migration-only: once old rows are backfilled, callers should read
// only the generic amountBaseUnits field and this helper can be removed.
//
// The legacy fallback field name is intentionally isolated here so the balance core
// can remain generic while historical XRP-ledger rows are still supported.

function getLedgerBaseUnitValueExpression() {
  return {
    $ifNull: ["$amountBaseUnits", { $ifNull: ["$amountDrops", "0"] }],
  };
}

module.exports = {
  getLedgerBaseUnitValueExpression,
};
