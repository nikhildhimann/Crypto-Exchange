const bip39 = require("bip39");
const { derivePath, getPublicKey } = require("ed25519-hd-key");
const { blake2b } = require("@noble/hashes/blake2b");
const { sha256 } = require("@noble/hashes/sha256");
const bs58 = require("bs58").default || require("bs58");

const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");

const XTZ_DERIVATION_PATH = "m/44'/1729'/0'/0'";
const TZ1_PREFIX = new Uint8Array([6, 161, 159]);
const EDPK_PREFIX = new Uint8Array([13, 15, 37, 217]);

function checkSum(payload) {
  const hash1 = sha256(payload);
  const hash2 = sha256(hash1);
  return Buffer.from(hash2.slice(0, 4));
}

function b58cencode(payload, prefix) {
  const n = new Uint8Array(prefix.length + payload.length);
  n.set(prefix);
  n.set(payload, prefix.length);
  const sum = checkSum(n);
  const combined = new Uint8Array(n.length + sum.length);
  combined.set(n);
  combined.set(sum, n.length);
  return bs58.encode(combined);
}

function getPublicKeyBytes(privateKey) {
  if (typeof getPublicKey === 'function') {
    return getPublicKey(privateKey, false);
  }
  
  const crypto = require('crypto');
  const priv = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      privateKey
    ]),
    format: 'der',
    type: 'pkcs8'
  });
  const pub = crypto.createPublicKey(priv);
  return pub.export({ format: 'der', type: 'spki' }).slice(-32);
}

function pubkeyToAddress(pubKey) {
  const hash = blake2b(pubKey, { dkLen: 20 });
  return b58cencode(hash, TZ1_PREFIX);
}

function pubkeyToEncodedPublicKey(pubKey) {
  return b58cencode(pubKey, EDPK_PREFIX);
}

function deriveKeypairFromMnemonic(mnemonic) {
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
  const derived = derivePath(XTZ_DERIVATION_PATH, seed.toString("hex"));
  
  const pubKey = getPublicKeyBytes(derived.key);
  const address = pubkeyToAddress(pubKey);
  const publicKey = pubkeyToEncodedPublicKey(pubKey);

  return {
    mnemonic: normalizedMnemonic,
    address,
    publicKey,
    publicKeyHex: Buffer.from(pubKey).toString("hex"),
    privateKey: derived.key.toString('hex')
  };
}

async function createWallet(_network, mnemonic) {
  const keypair = deriveKeypairFromMnemonic(mnemonic);
  return {
    mnemonic: keypair.mnemonic,
    seed: "",
    address: keypair.address,
    publicKey: keypair.publicKey
  };
}

function importWalletFromMnemonic(mnemonic) {
  return createWallet(null, mnemonic);
}

function validateAddress(address) {
  if (!address || typeof address !== 'string') return false;
  const normalized = address.trim();
  // Validates basic format (length ~36, starts with tz1/tz2/tz3/KT1)
  if (!/^(tz[123]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalized)) {
    return false;
  }
  return true;
}

async function resolveAddressFromSecret(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }
  if (normalized.includes(" ")) {
    return deriveKeypairFromMnemonic(normalized).address;
  }
  throw AppError.validation("XTZ secret must be a mnemonic");
}

module.exports = {
  createWallet,
  importWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  deriveKeypairFromMnemonic
};
