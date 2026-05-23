const test = require("node:test");
const assert = require("node:assert/strict");

const swapConfig = require("../config/swap");
const { AppError } = require("../helpers/errors");
const {
  buildNativeAssetDescriptor,
  toAssetBaseUnits,
} = require("../common/utils/assets");
const swapService = require("../Modules/swap/service");

const {
  assertMinimumSwapQuoteOrThrow,
  buildProfitProtectedQuote,
  buildSourceAmountForUsdEquivalentBaseUnits,
  buildSupportedPairsFromDiagnostics,
  calculateMinimumSwapQuote,
} = swapService.__testables;

function toScaledPrice(value) {
  return BigInt(Math.round(Number(value) * 1_000_000_000_000)).toString();
}

function buildRouteProtection(overrides = {}) {
  const serviceFeeBps = overrides.serviceFeeBps ?? 100;
  const spreadBps = overrides.spreadBps ?? 50;

  return {
    serviceFeeBps,
    spreadBps,
    totalFeeBps: serviceFeeBps + spreadBps,
    payoutFeeBufferBps: overrides.payoutFeeBufferBps ?? 100,
    minimumProfitUsd: overrides.minimumProfitUsd ?? "0.05",
    minSourceAmount: overrides.minSourceAmount ?? "0",
  };
}

function buildFixedPayoutEstimator(destinationAssetDescriptor, feeAmount) {
  const networkFeeBaseUnits = toAssetBaseUnits(destinationAssetDescriptor, feeAmount);

  return async () => ({
    networkFee: feeAmount,
    networkFeeBaseUnits,
    destinationAddress: "0xrecipient",
    executionParams: {},
    preparedTransaction: null,
  });
}

test("tiny XRP to BNB amount returns minimum swap details", async () => {
  const sourceAssetDescriptor = buildNativeAssetDescriptor("xrp", "mainnet");
  const destinationAssetDescriptor = buildNativeAssetDescriptor("bnb", "mainnet");
  const minimumSwapQuote = await calculateMinimumSwapQuote({
    routeProtection: buildRouteProtection({
      serviceFeeBps: 140,
      spreadBps: 60,
      payoutFeeBufferBps: 200,
      minimumProfitUsd: "0.10",
    }),
    sourceAssetDescriptor,
    destinationAssetDescriptor,
    sourcePriceScaled: toScaledPrice(2),
    destinationPriceScaled: toScaledPrice(600),
    destinationWallet: { chain: "bnb", network: "mainnet" },
    destinationSystemWallet: { address: "0xsystem" },
    destinationReceive: { address: "0xrecipient", executionParams: {} },
    estimatePayoutQuote: buildFixedPayoutEstimator(destinationAssetDescriptor, "0.0002"),
  });

  assert.throws(
    () =>
      assertMinimumSwapQuoteOrThrow({
        sourceAmountBaseUnits: toAssetBaseUnits(sourceAssetDescriptor, "0.01"),
        minimumSwapQuote,
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.errors?.validationCode, "swap_amount_too_small");
      assert.equal(error.errors?.minimumSourceAsset, "XRP");
      assert.equal(error.errors?.destinationAsset, "BNB");
      assert.ok(Number(error.errors?.minimumSourceAmount) > 0);
      assert.ok(Number(error.errors?.estimatedReceiveAtMinimum) > 0);
      return true;
    },
  );
});

test("profit protection exposes payout-fee constraint when network fee exceeds gross destination", () => {
  assert.throws(
    () =>
      buildProfitProtectedQuote({
        routeProtection: buildRouteProtection({
          serviceFeeBps: 100,
          spreadBps: 50,
          payoutFeeBufferBps: 0,
          minimumProfitUsd: "0",
        }),
        sourceAmountBaseUnits: toAssetBaseUnits(
          buildNativeAssetDescriptor("xrp", "mainnet"),
          "1",
        ),
        sourcePriceScaled: toScaledPrice(1),
        sourceDecimals: 6,
        destinationPriceScaled: toScaledPrice(600),
        destinationDecimals: 18,
        payoutNetworkFeeBaseUnits: toAssetBaseUnits(
          buildNativeAssetDescriptor("bnb", "mainnet"),
          "0.01",
        ),
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.errors?.validationCode, "swap_amount_too_small");
      assert.equal(error.errors?.code, "payout_network_fee_gte_gross_destination");
      return true;
    },
  );
});

test("minimum swap quote respects route minSourceAmount when it dominates", async () => {
  const sourceAssetDescriptor = buildNativeAssetDescriptor("xrp", "mainnet");
  const destinationAssetDescriptor = buildNativeAssetDescriptor("bnb", "mainnet");
  const routeProtection = buildRouteProtection({
    minSourceAmount: "9",
    serviceFeeBps: 100,
    spreadBps: 50,
    payoutFeeBufferBps: 100,
    minimumProfitUsd: "0.05",
  });
  const minimumSwapQuote = await calculateMinimumSwapQuote({
    routeProtection,
    sourceAssetDescriptor,
    destinationAssetDescriptor,
    sourcePriceScaled: toScaledPrice(5),
    destinationPriceScaled: toScaledPrice(600),
    destinationWallet: { chain: "bnb", network: "mainnet" },
    destinationSystemWallet: { address: "0xsystem" },
    destinationReceive: { address: "0xrecipient", executionParams: {} },
    estimatePayoutQuote: buildFixedPayoutEstimator(destinationAssetDescriptor, "0.00005"),
  });

  assert.equal(minimumSwapQuote.minimumSourceAmount, "9");
  assert.equal(minimumSwapQuote.constraintCode, "route_min_source_amount");
});

test("minimum swap quote respects minimum USD equivalent and minimum profit protection", async () => {
  const sourceAssetDescriptor = buildNativeAssetDescriptor("xrp", "mainnet");
  const destinationAssetDescriptor = buildNativeAssetDescriptor("bnb", "mainnet");
  const sourcePriceScaled = toScaledPrice(0.5);
  const destinationPriceScaled = toScaledPrice(600);
  const minimumSwapQuote = await calculateMinimumSwapQuote({
    routeProtection: buildRouteProtection({
      serviceFeeBps: 120,
      spreadBps: 80,
      payoutFeeBufferBps: 200,
      minimumProfitUsd: "0.30",
    }),
    sourceAssetDescriptor,
    destinationAssetDescriptor,
    sourcePriceScaled,
    destinationPriceScaled,
    destinationWallet: { chain: "bnb", network: "mainnet" },
    destinationSystemWallet: { address: "0xsystem" },
    destinationReceive: { address: "0xrecipient", executionParams: {} },
    estimatePayoutQuote: buildFixedPayoutEstimator(destinationAssetDescriptor, "0.0001"),
  });

  const minUsdFloorBaseUnits = buildSourceAmountForUsdEquivalentBaseUnits({
    minimumUsdEquivalent: swapConfig.minUsdEquivalent,
    sourcePriceScaled,
    sourceDecimals: sourceAssetDescriptor.decimals,
  });

  assert.ok(
    BigInt(minimumSwapQuote.minimumSourceAmountBaseUnits) >= BigInt(minUsdFloorBaseUnits),
  );
  assert.ok(Number(minimumSwapQuote.systemFeeAmountAtMinimum) > 0);
  assert.ok(Number(minimumSwapQuote.estimatedReceiveAtMinimum) > 0);
});

test("calculated minimum amount is immediately previewable by the quote math", async () => {
  const sourceAssetDescriptor = buildNativeAssetDescriptor("xrp", "mainnet");
  const destinationAssetDescriptor = buildNativeAssetDescriptor("bnb", "mainnet");
  const routeProtection = buildRouteProtection({
    serviceFeeBps: 130,
    spreadBps: 70,
    payoutFeeBufferBps: 150,
    minimumProfitUsd: "0.08",
  });
  const sourcePriceScaled = toScaledPrice(2.1);
  const destinationPriceScaled = toScaledPrice(620);
  const payoutNetworkFeeBaseUnits = toAssetBaseUnits(destinationAssetDescriptor, "0.00015");
  const minimumSwapQuote = await calculateMinimumSwapQuote({
    routeProtection,
    sourceAssetDescriptor,
    destinationAssetDescriptor,
    sourcePriceScaled,
    destinationPriceScaled,
    destinationWallet: { chain: "bnb", network: "mainnet" },
    destinationSystemWallet: { address: "0xsystem" },
    destinationReceive: { address: "0xrecipient", executionParams: {} },
    estimatePayoutQuote: async () => ({
      networkFee: "0.00015",
      networkFeeBaseUnits: payoutNetworkFeeBaseUnits,
      destinationAddress: "0xrecipient",
      executionParams: {},
      preparedTransaction: null,
    }),
  });

  assert.doesNotThrow(() =>
    assertMinimumSwapQuoteOrThrow({
      sourceAmountBaseUnits: minimumSwapQuote.minimumSourceAmountBaseUnits,
      minimumSwapQuote,
    }),
  );

  const protectedQuote = buildProfitProtectedQuote({
    routeProtection,
    sourceAmountBaseUnits: minimumSwapQuote.minimumSourceAmountBaseUnits,
    sourcePriceScaled,
    sourceDecimals: sourceAssetDescriptor.decimals,
    destinationPriceScaled,
    destinationDecimals: destinationAssetDescriptor.decimals,
    payoutNetworkFeeBaseUnits,
  });

  assert.ok(BigInt(protectedQuote.estimatedReceiveAmountBaseUnits) > 0n);
});

test("higher fixed minimum profit materially raises low-fee route minimums while preserving route overrides", async () => {
  const sourceAssetDescriptor = buildNativeAssetDescriptor("polygon", "mainnet");
  const destinationAssetDescriptor = buildNativeAssetDescriptor("xtz", "mainnet");
  const baseInput = {
    sourceAssetDescriptor,
    destinationAssetDescriptor,
    sourcePriceScaled: toScaledPrice(0.0918),
    destinationPriceScaled: toScaledPrice(0.36691),
    destinationWallet: { chain: "xtz", network: "mainnet" },
    destinationSystemWallet: { address: "tz1system" },
    destinationReceive: { address: "tz1recipient", executionParams: {} },
    estimatePayoutQuote: buildFixedPayoutEstimator(destinationAssetDescriptor, "0.08"),
  };

  const lowProfitQuote = await calculateMinimumSwapQuote({
    routeProtection: buildRouteProtection({
      serviceFeeBps: 100,
      spreadBps: 0,
      payoutFeeBufferBps: 0,
      minimumProfitUsd: "0.00",
    }),
    ...baseInput,
  });
  const fixedProfitQuote = await calculateMinimumSwapQuote({
    routeProtection: buildRouteProtection({
      serviceFeeBps: 100,
      spreadBps: 0,
      payoutFeeBufferBps: 0,
      minimumProfitUsd: "0.30",
    }),
    ...baseInput,
  });

  assert.ok(
    Number(fixedProfitQuote.minimumSourceAmount) >
      Number(lowProfitQuote.minimumSourceAmount),
  );
  assert.ok(Number(fixedProfitQuote.minimumProfitAmountAtMinimum) > 0);
  assert.equal(fixedProfitQuote.minimumProfitUsd, "0.30");
});

test("/swap/pairs helper only returns unique routes backed by valid source and destination endpoints", () => {
  const pairs = buildSupportedPairsFromDiagnostics([
    {
      id: "xrp:mainnet:XRP",
      chain: "xrp",
      network: "mainnet",
      asset: "XRP",
      sourceReady: true,
      destinationReady: true,
    },
    {
      id: "xrp:mainnet:XRP",
      chain: "xrp",
      network: "mainnet",
      asset: "XRP",
      sourceReady: true,
      destinationReady: true,
    },
    {
      id: "bnb:mainnet:BNB",
      chain: "bnb",
      network: "mainnet",
      asset: "BNB",
      sourceReady: true,
      destinationReady: true,
    },
    {
      id: "eth:mainnet:ETH",
      chain: "eth",
      network: "mainnet",
      asset: "ETH",
      sourceReady: false,
      destinationReady: false,
    },
    {
      id: "solana:mainnet:SOL",
      chain: "solana",
      network: "mainnet",
      asset: "SOL",
      sourceReady: false,
      destinationReady: false,
    },
  ]);

  assert.deepEqual(
    pairs.map((pair) => pair.pairId),
    [
      "bnb:mainnet:BNB->xrp:mainnet:XRP",
      "xrp:mainnet:XRP->bnb:mainnet:BNB",
    ],
  );
});
