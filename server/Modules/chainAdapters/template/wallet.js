const { createPendingMethod, createPendingSyncMethod } = require("../pending");

module.exports = {
  createWallet: createPendingMethod("Template wallet creation is not implemented"),
  importWalletFromMnemonic: createPendingMethod("Template wallet import is not implemented"),
  validateAddress: createPendingSyncMethod("Template wallet address validation is not implemented"),
  resolveAddressFromSecret: createPendingMethod("Template secret derivation is not implemented"),
  assignManagedReceiveExecutionParams: async () => ({}),
  resolveManagedReceiveExecutionParams: async () => ({}),
};
