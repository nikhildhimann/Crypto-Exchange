module.exports = {
  hotWalletThreshold: process.env.TREASURY_HOT_WALLET_THRESHOLD || "0",
  autoSweepEnabled: process.env.TREASURY_AUTO_SWEEP_ENABLED === "true",
  reconcileIntervalMinutes: Number(process.env.TREASURY_RECONCILE_INTERVAL_MINUTES || 30),
};
