const {
  DEFAULT_ED25519_DERIVATION_PATH,
  Ed25519Keypair,
} = require("@mysten/sui/keypairs/ed25519");
const { isValidSuiAddress, normalizeSuiAddress } = require("@mysten/sui/utils");

const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");
const client = require("./client");

const KEY_TYPE = "ED25519";
const ADDRESS_TYPE = "account";

function normalizeString(value) {
  return String(value || "").trim();
}

function isCanonicalSuiAddress(address) {
  return /^0x[0-9a-f]{64}$/i.test(normalizeString(address));
}

function normalizeAddress(address) {
  const normalized = normalizeString(address);
  if (!normalized || !isCanonicalSuiAddress(normalized) || !isValidSuiAddress(normalized)) {
    throw AppError.validation("Invalid SUI address");
  }

  return normalizeSuiAddress(normalized);
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

function derivePublicKeyHex(keypair) {
  return Buffer.from(keypair.getPublicKey().toRawBytes()).toString("hex");
}

function deriveKeypairFromMnemonic(mnemonic, network) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const keypair = Ed25519Keypair.deriveKeypair(
    normalizedMnemonic,
    DEFAULT_ED25519_DERIVATION_PATH,
  );
  const address = normalizeAddress(keypair.getPublicKey().toSuiAddress());
  const publicKey = derivePublicKeyHex(keypair);

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    address,
    publicKey,
    keypair,
    secretKey: keypair.getSecretKey(),
    derivationPath: DEFAULT_ED25519_DERIVATION_PATH,
  };
}

function deriveWalletFromMnemonic(mnemonic, network) {
  const { keypair, ...derived } = deriveKeypairFromMnemonic(mnemonic, network);

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
      addressType: ADDRESS_TYPE,
    },
    metadata: {
      keyType: KEY_TYPE,
      addressType: ADDRESS_TYPE,
      canonicalAddress: derived.address,
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

async function resolveAddressFromSecret(secret) {
  const normalized = normalizeString(secret);
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return (await importWalletFromMnemonic(normalized, client.DEFAULT_NETWORK)).address;
  }

  try {
    const keypair = Ed25519Keypair.fromSecretKey(normalized);
    return normalizeAddress(keypair.getPublicKey().toSuiAddress());
  } catch (_error) {
    throw AppError.validation("Invalid SUI wallet secret");
  }
}

async function assignManagedReceiveExecutionParams() {
  return {};
}

async function resolveManagedReceiveExecutionParams() {
  return {};
}

module.exports = {
  KEY_TYPE,
  ADDRESS_TYPE,
  DEFAULT_ED25519_DERIVATION_PATH,
  normalizeAddress,
  deriveKeypairFromMnemonic,
  deriveWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  createWallet,
  importWalletFromMnemonic,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
