const test = require("node:test");
const assert = require("node:assert/strict");

const { AppError } = require("../helpers/errors");
const { buildNativeAssetDescriptor } = require("../common/utils/assets");
const swapService = require("../Modules/swap/service");
const xrpAmount = require("../Modules/chainAdapters/xrp/amount");
const xrpBalance = require("../Modules/chainAdapters/xrp/balance");
const xrpClient = require("../Modules/chainAdapters/xrp/client");

const {
  assertPayoutLiquidityOrThrow,
  buildProfitProtectedQuote,
  buildSafeSwapFailureReason,
  getTransferExecutionStatus,
  isAcceptedPendingSubmission,
} = swapService.__testables;

test("TRX to XRP review preflight rejects before source collection when XRP treasury cannot cover payout plus reserve", async () => {
  const xrpAsset = buildNativeAssetDescriptor("xrp", "mainnet");

  assert.throws(
    () =>
      assertPayoutLiquidityOrThrow({
        assetDescriptor: xrpAsset,
        systemWalletConfig: {
          reserveBaseUnits: "0",
        },
        liveBalance: {
          baseUnitBalance: xrpAmount.toBaseUnits("15"),
          availableBaseUnits: xrpAmount.toBaseUnits("15"),
          metadata: {
            minimumReserveBaseUnits: xrpAmount.toBaseUnits("10"),
          },
        },
        payoutAmountBaseUnits: xrpAmount.toBaseUnits("5"),
        payoutNetworkFeeBaseUnits: xrpAmount.toBaseUnits("1"),
        swapId: "swap-xrp-empty-treasury",
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(
        error.message,
        "Destination liquidity is temporarily unavailable for this swap route.",
      );
      assert.equal(error.errors?.validationCode, "LIQUIDITY_INSUFFICIENT");
      assert.equal(error.errors?.swapId, "swap-xrp-empty-treasury");
      assert.equal(
        Object.prototype.hasOwnProperty.call(error.errors || {}, "internalReason"),
        false,
      );
      return true;
    },
  );
});

test("XRP payout verification only treats tesSUCCESS as success", async () => {
  assert.equal(
    getTransferExecutionStatus(
      {
        chainStatus: "tesSUCCESS",
      },
      { chain: "xrp" },
    ),
    "success",
  );

  assert.equal(
    getTransferExecutionStatus(
      {
        chainStatus: "tecUNFUNDED_PAYMENT",
        validated: true,
      },
      { chain: "xrp" },
    ),
    "failed",
  );

  assert.equal(
    isAcceptedPendingSubmission(
      {
        chainStatus: "tecUNFUNDED_PAYMENT",
        validated: true,
      },
      { chain: "xrp" },
    ),
    false,
  );
});

test("Profit protection rejects a swap amount when payout fee and minimum profit would consume the route margin", async () => {
  const xrpAsset = buildNativeAssetDescriptor("xrp", "mainnet");

  assert.throws(
    () =>
      buildProfitProtectedQuote({
        routeProtection: {
          serviceFeeBps: 100,
          spreadBps: 50,
          payoutFeeBufferBps: 100,
          minimumProfitUsd: "0.25",
        },
        sourceAmountBaseUnits: "1000000",
        sourcePriceScaled: BigInt(1_000_000_000_000).toString(),
        sourceDecimals: 6,
        destinationPriceScaled: BigInt(500_000_000_000).toString(),
        destinationDecimals: 6,
        payoutNetworkFeeBaseUnits: xrpAmount.toBaseUnits("0.05"),
        swapId: "swap-profit-protection",
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(
        error.message,
        "This amount is too small for this network. Please enter a higher amount.",
      );
      assert.equal(error.errors?.validationCode, "swap_amount_too_small");
      return true;
    },
  );
});

test("Profit protection returns a positive final receive when route fees and fee buffer still preserve margin", async () => {
  const protectedQuote = buildProfitProtectedQuote({
    routeProtection: {
      serviceFeeBps: 200,
      spreadBps: 100,
      payoutFeeBufferBps: 200,
      minimumProfitUsd: "0.01",
    },
    sourceAmountBaseUnits: "100000000",
    sourcePriceScaled: BigInt(1_000_000_000_000).toString(),
    sourceDecimals: 6,
    destinationPriceScaled: BigInt(1_000_000_000_000).toString(),
    destinationDecimals: 6,
    payoutNetworkFeeBaseUnits: "10000",
  });

  assert.ok(BigInt(protectedQuote.grossDestinationBaseUnits) > 0n);
  assert.ok(BigInt(protectedQuote.platformFeeAmountBaseUnits) > 0n);
  assert.ok(BigInt(protectedQuote.bufferedPayoutNetworkFeeBaseUnits) >= 10000n);
  assert.ok(BigInt(protectedQuote.estimatedReceiveAmountBaseUnits) > 0n);
});

test("Swap payout failure reasons are sanitized for user responses", async () => {
  assert.equal(
    buildSafeSwapFailureReason(
      "payout_failed",
      "SWAP_PAYOUT_CHAIN_REJECTED",
    ),
    "This swap could not be completed. Our team will review it for refund or retry.",
  );
});

test("XRP balance fetch reports reserve-aware minimum balance metadata", async () => {
  const originalGetClient = xrpClient.getClient;

  try {
    xrpClient.getClient = async () => ({
      request: async (payload) => {
        if (payload?.command === "account_info") {
          return {
            result: {
              ledger_current_index: 999,
              account_data: {
                Balance: xrpAmount.toBaseUnits("42"),
                OwnerCount: 3,
              },
            },
          };
        }

        if (payload?.command === "server_info") {
          return {
            result: {
              info: {
                validated_ledger: {
                  reserve_base_xrp: "1",
                  reserve_inc_xrp: "0.2",
                },
              },
            },
          };
        }

        throw new Error(`Unexpected XRP request: ${payload?.command || "unknown"}`);
      },
    });

    const balance = await xrpBalance.fetchBalance({
      network: "mainnet",
      address: "rEXAMPLEADDRESS123456789",
    });

    assert.equal(balance.exists, true);
    assert.equal(balance.baseUnitBalance, xrpAmount.toBaseUnits("42"));
    assert.equal(balance.rentExemptMinimumBaseUnits, xrpAmount.toBaseUnits("1.6"));
  } finally {
    xrpClient.getClient = originalGetClient;
  }
});
