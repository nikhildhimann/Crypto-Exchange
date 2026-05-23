const platformFeeEnabled =
  process.env.SYSTEM_FEE_ENABLED === "true" &&
  process.env.PLATFORM_FEE_ENABLED === "true";

module.exports = Object.freeze({
  transactionPreviewExpirySeconds: Number(
    process.env.TRANSACTION_PREVIEW_EXPIRY_SECONDS || 60,
  ),
  withdrawalFeeBps: Number(process.env.WITHDRAWAL_FEE_BPS || 0),
  depositFeeBps: Number(process.env.DEPOSIT_FEE_BPS || 0),
  policy: Object.freeze({
    default: Object.freeze({
      external: Object.freeze({
        chargeNetworkFee: true,
        platformFee: Object.freeze({
          enabled: platformFeeEnabled,
          type: process.env.PLATFORM_FEE_TYPE || "fixed",
          value: process.env.PLATFORM_FEE_VALUE || "0",
        }),
      }),
      internal: Object.freeze({
        chargeNetworkFee: false,
        platformFee: Object.freeze({
          enabled: false,
          type: "none",
          value: "0",
        }),
      }),
      receive: Object.freeze({
        chargeNetworkFee: false,
        platformFee: Object.freeze({
          enabled: false,
          type: "none",
          value: "0",
        }),
      }),
    }),
    chains: Object.freeze({}),
  }),
});
