const { Wallet, isValidAddress } = require("xrpl");
const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");
const DestinationTagService = require("../../destinationTag/service");

async function createWallet(_network, mnemonic) {
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const wallet = Wallet.fromMnemonic(normalizedMnemonic, { mnemonicEncoding: "bip39" });

  return {
    mnemonic: normalizedMnemonic,
    seed: wallet.seed || "",
    address: wallet.classicAddress,
    publicKey: wallet.publicKey,
  };
}

function importWalletFromMnemonic(mnemonic) {
  return createWallet(null, mnemonic);
}

function validateAddress(address) {
  return isValidAddress(String(address).trim());
}

async function resolveAddressFromSecret(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return (await importWalletFromMnemonic(normalized)).address;
  }

  return Wallet.fromSeed(normalized).classicAddress;
}

async function assignManagedReceiveExecutionParams({
  userId,
  accountId,
  walletId,
  chain = "xrp",
  network,
}) {
  const tagRecord = await DestinationTagService.assignTagToWallet(
    userId,
    accountId,
    walletId,
    chain,
    network,
  );

  if (tagRecord?.tag === undefined || tagRecord?.tag === null) {
    return {};
  }

  return {
    destinationTag: tagRecord.tag,
  };
}

async function resolveManagedReceiveExecutionParams({
  walletId,
  chain = "xrp",
  network,
}) {
  const tagRecord = await DestinationTagService.getTagByWallet(walletId, chain, network);

  if (tagRecord?.tag === undefined || tagRecord?.tag === null) {
    return {};
  }

  return {
    destinationTag: tagRecord.tag,
  };
}

async function findWalletByManagedExecutionParam({
  chain = "xrp",
  network,
  address,
  key,
  value,
}) {
  if (key !== "destinationTag") {
    return null;
  }

  const tagRecord = await DestinationTagService.getTagByValue(chain, network, value);
  const wallet = tagRecord?.walletId;

  if (!wallet || String(wallet.address || "").trim() !== String(address || "").trim()) {
    return null;
  }

  return wallet;
}

module.exports = {
  createWallet,
  importWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
  findWalletByManagedExecutionParam,
};
