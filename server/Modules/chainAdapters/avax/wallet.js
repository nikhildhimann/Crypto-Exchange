const { HDNodeWallet, Wallet, getAddress, isAddress } = require("ethers");

const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");

const AVAX_DERIVATION_PATH = "m/44'/60'/0'/0/0";

function getPublicKey(wallet) {
  return wallet.publicKey || wallet.signingKey?.publicKey || "";
}

function deriveWalletFromMnemonic(mnemonic) {
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const wallet = HDNodeWallet.fromPhrase(normalizedMnemonic, "", AVAX_DERIVATION_PATH);

  return {
    mnemonic: normalizedMnemonic,
    wallet,
  };
}

function normalizePrivateKey(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return `0x${normalized}`;
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return normalized;
  }

  throw AppError.validation("Invalid AVAX wallet secret");
}

async function createWallet(_network, mnemonic) {
  const { mnemonic: normalizedMnemonic, wallet } = deriveWalletFromMnemonic(mnemonic);

  return {
    mnemonic: normalizedMnemonic,
    seed: wallet.privateKey,
    address: getAddress(wallet.address),
    publicKey: getPublicKey(wallet),
  };
}

function importWalletFromMnemonic(mnemonic, network) {
  return createWallet(network, mnemonic);
}

function validateAddress(address) {
  try {
    return isAddress(String(address).trim());
  } catch (_error) {
    return false;
  }
}

async function resolveAddressFromSecret(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return (await importWalletFromMnemonic(normalized)).address;
  }

  try {
    return getAddress(new Wallet(normalizePrivateKey(normalized)).address);
  } catch (_error) {
    throw AppError.validation("Invalid AVAX wallet secret");
  }
}

async function assignManagedReceiveExecutionParams() {
  return {};
}

async function resolveManagedReceiveExecutionParams() {
  return {};
}

module.exports = {
  AVAX_DERIVATION_PATH,
  createWallet,
  importWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  deriveWalletFromMnemonic,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
