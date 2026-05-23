const Wallet = require("../wallet/model");
const WalletAddress = require("../wallet/address.model");
const { buildWalletVisibilityFilter } = require("../../common/utils/walletState");
const transactionConfig = require("../../config/transactions");

function normalizeAddress(address) {
  return String(address || "").trim();
}

function normalizeExecutionParamValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return String(value);
}

function getRoutingExecutionParamKeys(context) {
  const keys = [];

  if (context?.addressExtras?.destinationTag) {
    keys.push("destinationTag");
  }

  if (context?.addressExtras?.memo) {
    keys.push("memo");
  }

  if (Array.isArray(context?.addressExtras?.extraParams)) {
    keys.push(
      ...context.addressExtras.extraParams.map((entry) =>
        entry && typeof entry === "object" ? entry.key || entry.code || entry.name : entry),
    );
  }

  return [...new Set(keys.map((key) => String(key || "").trim()).filter(Boolean))];
}

function getRoutingExecutionParams(context, executionParams = {}) {
  return getRoutingExecutionParamKeys(context).reduce((result, key) => {
    const normalizedValue = normalizeExecutionParamValue(executionParams?.[key]);
    if (normalizedValue !== null) {
      result[key] = normalizedValue;
    }

    return result;
  }, {});
}

async function findWalletByExecutionParam({ chain, network, address, key, value }) {
  return Wallet.findOne({
    chain,
    network,
    address: normalizeAddress(address),
    ...buildWalletVisibilityFilter(),
    [`metadata.routing.executionParams.${key}`]: value,
  }).lean();
}

async function resolveInternalTransferRecipient({
  senderWallet,
  chainContext,
  destinationAddress,
  executionParams = {},
}) {
  const normalizedAddress = normalizeAddress(destinationAddress);
  const routingExecutionParams = getRoutingExecutionParams(chainContext, executionParams);
  let matchedWallet = null;
  let matchStrategy = "address";

  for (const [key, value] of Object.entries(routingExecutionParams)) {
    let wallet = null;
    const managedResolver =
      chainContext?.adapter?.wallet?.findWalletByManagedExecutionParam;

    if (typeof managedResolver === "function") {
      wallet = await managedResolver({
        chain: senderWallet.chain,
        network: senderWallet.network,
        address: normalizedAddress,
        key,
        value,
        context: chainContext,
      });
    }

    if (!wallet) {
      wallet = await findWalletByExecutionParam({
        chain: senderWallet.chain,
        network: senderWallet.network,
        address: normalizedAddress,
        key,
        value,
      });
    }

    if (wallet) {
      matchedWallet = wallet;
      matchStrategy = `executionParams.${key}`;
      break;
    }
  }

  if (!matchedWallet) {
    matchedWallet = await Wallet.findOne({
      chain: senderWallet.chain,
      network: senderWallet.network,
      address: normalizedAddress,
      ...buildWalletVisibilityFilter(),
    }).lean();
  }

  if (!matchedWallet && ["btc", "ada", "hbar"].includes(senderWallet.chain)) {
    const managedAddress = await WalletAddress.findOne({
      chain: senderWallet.chain,
      network: senderWallet.network,
      address: normalizedAddress,
      isActive: true,
    }).lean();

    if (managedAddress?.walletId) {
      matchedWallet = await Wallet.findOne({
        _id: managedAddress.walletId,
        chain: senderWallet.chain,
        network: senderWallet.network,
        ...buildWalletVisibilityFilter(),
      }).lean();

      if (matchedWallet) {
        matchStrategy = "managedAddress";
      }
    }
  }

  const sameWallet =
    Boolean(matchedWallet) &&
    String(matchedWallet._id) === String(senderWallet._id);
  const sameUser =
    Boolean(matchedWallet) &&
    !sameWallet &&
    String(matchedWallet.userId) === String(senderWallet.userId);
  const samePlatform = Boolean(matchedWallet) && !sameWallet;
  const recipientClassification = sameWallet
    ? "self"
    : sameUser
      ? "same_user"
      : samePlatform
        ? "platform_user"
        : "external";
  const settlementMode = samePlatform
    ? transactionConfig.useLocalInternalSettlement()
      ? "local_internal"
      : transactionConfig.platformTransferSettlementMode
    : "onchain";

  return {
    recipientWallet: matchedWallet,
    normalizedAddress,
    routingExecutionParams,
    matchStrategy,
    isSameWallet: sameWallet,
    isSameUser: sameUser,
    isSamePlatform: samePlatform,
    isInternal: samePlatform && transactionConfig.useLocalInternalSettlement(),
    settlementMode,
    recipientClassification,
  };
}

module.exports = {
  normalizeAddress,
  getRoutingExecutionParams,
  resolveInternalTransferRecipient,
};
