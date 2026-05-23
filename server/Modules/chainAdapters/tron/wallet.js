const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");
const client = require("./client");

function normalizePrivateKey(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return normalized;
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return normalized.slice(2);
  }

  throw AppError.validation("Invalid TRON wallet secret");
}

async function deriveWalletFromMnemonic(mnemonic) {
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const TronWeb = client.TronWeb;
  const wallet = await TronWeb.fromMnemonic(normalizedMnemonic);

  return {
    mnemonic: normalizedMnemonic,
    wallet,
  };
}

async function createWallet(_network, mnemonic) {
  const { mnemonic: normalizedMnemonic, wallet } = await deriveWalletFromMnemonic(mnemonic);

  return {
    mnemonic: normalizedMnemonic,
    seed: wallet.privateKey,
    address: wallet.address,
    publicKey: wallet.publicKey,
  };
}

function importWalletFromMnemonic(mnemonic, network) {
  return createWallet(network, mnemonic);
}

function validateAddress(address) {
  const TronWeb = client.TronWeb;

  try {
    return TronWeb.isAddress(String(address || "").trim());
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

  const TronWeb = client.TronWeb;

  try {
    return TronWeb.address.fromPrivateKey(normalizePrivateKey(normalized));
  } catch (_error) {
    throw AppError.validation("Invalid TRON wallet secret");
  }
}

async function assignManagedReceiveExecutionParams() {
  return {};
}

async function resolveManagedReceiveExecutionParams() {
  return {};
}

module.exports = {
  createWallet,
  importWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  deriveWalletFromMnemonic,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
