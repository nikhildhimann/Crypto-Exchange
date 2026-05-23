const bip39 = require("bip39");
const { derivePath } = require("ed25519-hd-key");
const { Keypair, PublicKey } = require("@solana/web3.js");

const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");

const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";
const bs58 = require("bs58").default || require("bs58");

function deriveKeypairFromMnemonic(mnemonic) {
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
  const derived = derivePath(SOLANA_DERIVATION_PATH, seed.toString("hex"));
  const keypair = Keypair.fromSeed(derived.key);

  return {
    mnemonic: normalizedMnemonic,
    keypair,
  };
}

function getAddressFromSecret(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return deriveKeypairFromMnemonic(normalized).keypair.publicKey.toBase58();
  }

  if (normalized.startsWith("[")) {
    try {
      const parsed = JSON.parse(normalized);
      if (!Array.isArray(parsed) || !parsed.length) {
        throw new Error("Invalid Solana secret key");
      }

      return Keypair.fromSecretKey(Uint8Array.from(parsed)).publicKey.toBase58();
    } catch (_error) {
      throw AppError.validation("Invalid Solana secret key");
    }
  }

  try {
    const decoded = bs58.decode(normalized);
    if (decoded.length === 64) {
      return Keypair.fromSecretKey(decoded).publicKey.toBase58();
    }

    if (decoded.length === 32) {
      return Keypair.fromSeed(decoded).publicKey.toBase58();
    }
  } catch (_error) {
    throw AppError.validation("Invalid Solana secret key");
  }

  throw AppError.validation("Invalid Solana secret key");
}

async function createWallet(_network, mnemonic) {
  const { mnemonic: normalizedMnemonic, keypair } = deriveKeypairFromMnemonic(mnemonic);

  return {
    mnemonic: normalizedMnemonic,
    seed: "",
    address: keypair.publicKey.toBase58(),
    publicKey: keypair.publicKey.toBase58(),
  };
}

function importWalletFromMnemonic(mnemonic) {
  return createWallet(null, mnemonic);
}

function validateAddress(address) {
  try {
    const publicKey = new PublicKey(String(address).trim());
    return publicKey.toBase58() === String(address).trim();
  } catch (_error) {
    return false;
  }
}

async function resolveAddressFromSecret(secret) {
  return getAddressFromSecret(secret);
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
  deriveKeypairFromMnemonic,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
