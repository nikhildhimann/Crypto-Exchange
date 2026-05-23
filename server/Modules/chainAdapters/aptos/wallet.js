const {
  Account,
  AccountAddress,
  Ed25519PrivateKey,
} = require("@aptos-labs/ts-sdk");

const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");
const client = require("./client");

const DERIVATION_PATH = "m/44'/637'/0'/0'/0'";
const KEY_TYPE = "ED25519";
const ADDRESS_TYPE = "account";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeAddress(address) {
  const normalized = normalizeString(address);

  if (!normalized) {
    throw AppError.validation("Invalid Aptos address");
  }

  try {
    return AccountAddress.from(normalized).toStringLong();
  } catch (_error) {
    throw AppError.validation("Invalid Aptos address");
  }
}

function validateAddress(address) {
  try {
    normalizeAddress(address);
    return true;
  } catch (_error) {
    return false;
  }
}

function buildManagedIdentifier(address, derivationPath, network) {
  return {
    address,
    derivationPath,
    branch: 0,
    addressIndex: 0,
    addressType: ADDRESS_TYPE,
    purpose: "receive",
    isActive: true,
    isChange: false,
    metadata: {
      keyType: KEY_TYPE,
      network,
    },
  };
}

function deriveAccountFromMnemonic(mnemonic, network) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const account = Account.fromDerivationPath({
    mnemonic: normalizedMnemonic,
    path: DERIVATION_PATH,
    legacy: true,
  });
  const address = normalizeAddress(account.accountAddress.toString());
  const publicKey = normalizeString(account.publicKey.toString());
  const privateKey = normalizeString(account.privateKey.toString());
  const authenticationKey = normalizeAddress(
    Account.authKey({ publicKey: account.publicKey }).toString(),
  );

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    address,
    publicKey,
    privateKey,
    authenticationKey,
    account,
    derivationPath: DERIVATION_PATH,
  };
}

function deriveWalletFromMnemonic(mnemonic, network) {
  const { account, privateKey, ...derived } = deriveAccountFromMnemonic(
    mnemonic,
    network,
  );

  return derived;
}

function buildWalletMaterial(derived) {
  return {
    mnemonic: derived.mnemonic,
    seed: "",
    address: derived.address,
    publicKey: derived.publicKey,
    derivationPath: derived.derivationPath,
    derivation: {
      path: derived.derivationPath,
      keyType: KEY_TYPE,
      network: derived.network,
      authenticationKey: derived.authenticationKey,
      addressType: ADDRESS_TYPE,
    },
    metadata: {
      keyType: KEY_TYPE,
      addressType: ADDRESS_TYPE,
      canonicalAddress: derived.address,
      authenticationKey: derived.authenticationKey,
      publicKey: derived.publicKey,
      network: derived.network,
    },
    managedAddress: buildManagedIdentifier(
      derived.address,
      derived.derivationPath,
      derived.network,
    ),
    additionalManagedAddresses: [],
  };
}

async function createWallet(network, mnemonic) {
  return buildWalletMaterial(deriveWalletFromMnemonic(mnemonic, network));
}

function importWalletFromMnemonic(mnemonic, network) {
  return createWallet(network, mnemonic);
}

function normalizePrivateKeySecret(secret) {
  const normalized = normalizeString(secret);

  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  try {
    return new Ed25519PrivateKey(normalized);
  } catch (_error) {
    throw AppError.validation("Invalid Aptos wallet secret");
  }
}

async function resolveAddressFromSecret(secret) {
  const normalized = normalizeString(secret);

  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return (await importWalletFromMnemonic(normalized, client.DEFAULT_NETWORK))
      .address;
  }

  const privateKey = normalizePrivateKeySecret(normalized);
  const account = Account.fromPrivateKey({
    privateKey,
    legacy: true,
  });

  return normalizeAddress(account.accountAddress.toString());
}

async function assignManagedReceiveExecutionParams() {
  return {};
}

async function resolveManagedReceiveExecutionParams() {
  return {};
}

module.exports = {
  DERIVATION_PATH,
  KEY_TYPE,
  ADDRESS_TYPE,
  normalizeAddress,
  deriveAccountFromMnemonic,
  deriveWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  createWallet,
  importWalletFromMnemonic,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
