const { derivePath, getPublicKey } = require('ed25519-hd-key');
const bip39 = require('bip39');
const bs58 = require('bs58').default || require('bs58');
const { blake2b } = require('@noble/hashes/blake2b');
const { sha256 } = require('@noble/hashes/sha256');

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

const mnemonic = bip39.generateMnemonic();
const seed = bip39.mnemonicToSeedSync(mnemonic);
const derived = derivePath("m/44'/1729'/0'/0'", seed.toString('hex'));

try {
  let pubKey;
  if (typeof getPublicKey === 'function') {
    pubKey = getPublicKey(derived.key, false);
  } else {
    // If not, we can use tweetnacl or crypto
    const crypto = require('crypto');
    const privateKey = crypto.createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        derived.key
      ]),
      format: 'der',
      type: 'pkcs8'
    });
    const publicKey = crypto.createPublicKey(privateKey);
    pubKey = publicKey.export({ format: 'der', type: 'spki' }).slice(-32);
  }

  const hash = blake2b(pubKey, { dkLen: 20 });
  const prefix = new Uint8Array([6, 161, 159]); // tz1
  const address = b58cencode(hash, prefix);
  console.log('Address:', address);
  console.log('Pubkey length:', pubKey.length);
} catch (e) {
  console.error(e);
}
