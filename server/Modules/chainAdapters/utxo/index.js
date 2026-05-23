const {
  ensureWalletIndexed,
  discoverManagedAddresses,
  getManagedAddresses,
  resolveWalletRecord,
  discoverAddressesByGapLimit,
} = require("./addressDiscovery.service");
const { getNextChangeAddress } = require("./changeAddress.service");
const { aggregateWalletBalance } = require("./balanceAggregation.service");
const { syncWalletHistory } = require("./walletSync.service");
const { rebuildWalletState } = require("./recovery.service");
const { reconcilePendingTransactionsForWallet } = require("./pendingReconciliation.service");
const { syncUtxoWallet } = require("./runtimeSync.service");

module.exports = {
  ensureWalletIndexed,
  discoverManagedAddresses,
  getManagedAddresses,
  resolveWalletRecord,
  discoverAddressesByGapLimit,
  getNextChangeAddress,
  aggregateWalletBalance,
  syncWalletHistory,
  rebuildWalletState,
  reconcilePendingTransactionsForWallet,
  syncUtxoWallet,
};
