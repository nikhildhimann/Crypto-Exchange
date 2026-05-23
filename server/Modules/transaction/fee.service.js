const feesConfig = require("../../config/fees");
const { AppError } = require("../../helpers/errors");
const { addBaseUnits } = require("../../common/utils/amount");
const {
  buildNativeAssetDescriptor,
  fromAssetBaseUnits,
  normalizeAssetAmount,
  toAssetBaseUnits,
} = require("../../common/utils/assets");

function normalizeTransactionType(transactionType) {
  const normalized = String(transactionType || "external").toLowerCase();

  if (normalized === "receive") {
    return "receive";
  }

  if (normalized === "internal") {
    return "internal";
  }

  return "external";
}

function getDefaultFeePolicy() {
  return feesConfig;
}

function mergeFeePolicy(basePolicy = {}, overridePolicy = {}) {
  return {
    ...basePolicy,
    ...overridePolicy,
    platformFee: {
      ...(basePolicy.platformFee || {}),
      ...(overridePolicy.platformFee || {}),
    },
  };
}

function getContextFeeConfig(context) {
  return context?.chainConfig?.feePolicy && typeof context.chainConfig.feePolicy === "object"
    ? context.chainConfig.feePolicy
    : {};
}

function getFeePolicy(context, transactionType) {
  const normalizedType = normalizeTransactionType(transactionType);
  const defaultPolicy = feesConfig.policy?.default?.[normalizedType] || {};
  const chainPolicy = getContextFeeConfig(context)?.[normalizedType] || {};

  return mergeFeePolicy(defaultPolicy, chainPolicy);
}

function calculatePlatformFeeAmount(context, amount, policy) {
  const assetDescriptor = context?.assetDescriptor || buildNativeAssetDescriptor(
    context?.chain,
    context?.network || context?.chainConfig?.defaultNetwork,
  );
  const platformFeePolicy = policy?.platformFee || {};
  if (!platformFeePolicy.enabled) {
    return "0";
  }

  if (platformFeePolicy.type === "fixed") {
    return normalizeAssetAmount(assetDescriptor, platformFeePolicy.value || "0");
  }

  if (platformFeePolicy.type === "percentage") {
    const numericAmount = Number(amount);
    const numericRate = Number(platformFeePolicy.value);

    if (!Number.isFinite(numericAmount) || !Number.isFinite(numericRate)) {
      throw AppError.validation("Invalid percentage platform fee configuration");
    }

    return normalizeAssetAmount(
      assetDescriptor,
      ((numericAmount * numericRate) / 100).toFixed(assetDescriptor.decimals),
    );
  }

  if (platformFeePolicy.type === "none" || !platformFeePolicy.type) {
    return "0";
  }

  throw AppError.validation(
    `Unsupported platform fee type "${platformFeePolicy.type}" for chain "${context.chain}"`,
  );
}

async function estimateNetworkFee(context, input, policy) {
  if (!policy?.chargeNetworkFee) {
    return {
      networkFee: "0",
      networkFeeBaseUnits: "0",
      preparedTransaction: null,
    };
  }

  const estimateInput = {
    network: input.network,
    fromAddress: input.senderAddress,
    toAddress: input.destinationAddress,
    amount: input.recipientGets,
    executionParams: input.executionParams,
    asset: input.assetDescriptor?.asset,
    assetDescriptor: input.assetDescriptor,
  };

  if (typeof input.mnemonicProvider === "function") {
    Object.defineProperty(estimateInput, "mnemonic", {
      enumerable: true,
      configurable: true,
      get() {
        return input.mnemonicProvider();
      },
    });
  } else if (input.mnemonic !== undefined) {
    estimateInput.mnemonic = input.mnemonic;
  }

  const estimate = await context.adapter.transaction.estimateTransfer({
    ...estimateInput,
  });

  return {
    networkFee:
      estimate.networkFee ||
      fromAssetBaseUnits(
        estimate.networkFeeAssetDescriptor ||
          buildNativeAssetDescriptor(context.chain, input.network),
        estimate.networkFeeBaseUnits || "0",
      ),
    networkFeeBaseUnits: String(estimate.networkFeeBaseUnits || "0"),
    networkFeeAsset:
      estimate.networkFeeAsset ||
      buildNativeAssetDescriptor(context.chain, input.network).asset,
    networkFeeAssetDescriptor:
      estimate.networkFeeAssetDescriptor ||
      buildNativeAssetDescriptor(context.chain, input.network),
    preparedTransaction: estimate.preparedTransaction || null,
  };
}

async function quoteTransfer(input) {
  const {
    context,
    amount,
    senderAddress,
    destinationAddress,
    network,
    transactionType,
    executionParams = {},
    assetDescriptor,
  } = input;
  const normalizedType = normalizeTransactionType(transactionType);
  const policy = getFeePolicy(context, normalizedType);
  const resolvedAssetDescriptor =
    assetDescriptor ||
    buildNativeAssetDescriptor(context.chain, network || context.chainConfig?.defaultNetwork);
  const networkFeeAssetDescriptor = buildNativeAssetDescriptor(
    context.chain,
    network || context.chainConfig?.defaultNetwork,
  );
  const normalizedAmount = normalizeAssetAmount(resolvedAssetDescriptor, amount);
  const amountBaseUnits = toAssetBaseUnits(resolvedAssetDescriptor, normalizedAmount);
  const platformFee = calculatePlatformFeeAmount(context, normalizedAmount, policy);
  const platformFeeBaseUnits = toAssetBaseUnits(resolvedAssetDescriptor, platformFee);
  const recipientGets = normalizedAmount;
  const recipientGetsBaseUnits = amountBaseUnits;
  const networkFeeEstimate = await estimateNetworkFee(
    context,
    {
      network,
      senderAddress,
      destinationAddress,
      recipientGets,
      mnemonic: input.mnemonic,
      mnemonicProvider: input.mnemonicProvider,
      executionParams,
      assetDescriptor: resolvedAssetDescriptor,
    },
    policy,
  );
  const totalDebitBaseUnits =
    resolvedAssetDescriptor.assetType === "token"
      ? addBaseUnits(amountBaseUnits, platformFeeBaseUnits)
      : addBaseUnits(
          amountBaseUnits,
          platformFeeBaseUnits,
          networkFeeEstimate.networkFeeBaseUnits,
        );

  return {
    transactionType: normalizedType,
    policy,
    asset: resolvedAssetDescriptor.asset,
    assetType: resolvedAssetDescriptor.assetType,
    standard: resolvedAssetDescriptor.standard,
    contractAddress: resolvedAssetDescriptor.contractAddress,
    amount: normalizedAmount,
    amountBaseUnits,
    platformFee,
    platformFeeBaseUnits,
    recipientGets,
    recipientGetsBaseUnits,
    networkFee: networkFeeEstimate.networkFee,
    networkFeeBaseUnits: networkFeeEstimate.networkFeeBaseUnits,
    networkFeeAsset: networkFeeEstimate.networkFeeAsset,
    networkFeeAssetType: networkFeeAssetDescriptor.assetType,
    networkFeeCurrency: networkFeeAssetDescriptor.symbol,
    totalDebit: fromAssetBaseUnits(resolvedAssetDescriptor, totalDebitBaseUnits),
    totalDebitBaseUnits,
    totalDebitAsset: resolvedAssetDescriptor.asset,
    totalDebitAssetType: resolvedAssetDescriptor.assetType,
    totalDebitCurrency: resolvedAssetDescriptor.symbol,
    compositeDebit:
      resolvedAssetDescriptor.assetType === "token"
        ? {
            transferAmount: normalizedAmount,
            transferAmountBaseUnits: amountBaseUnits,
            transferAsset: resolvedAssetDescriptor.asset,
            networkFee: networkFeeEstimate.networkFee,
            networkFeeBaseUnits: networkFeeEstimate.networkFeeBaseUnits,
            networkFeeAsset: networkFeeEstimate.networkFeeAsset,
          }
        : null,
    preparedTransaction: networkFeeEstimate.preparedTransaction,
  };
}

module.exports = {
  getDefaultFeePolicy,
  getFeePolicy,
  quoteTransfer,
};
