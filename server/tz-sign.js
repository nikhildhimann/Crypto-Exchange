const crypto = require('crypto');
const { blake2b } = require('@noble/hashes/blake2b');
const bs58 = require('bs58').default || require('bs58');
const { derivePath } = require('ed25519-hd-key');
const bip39 = require('bip39');

const mnemonic = "test test test test test test test test test test test junk";
const seed = bip39.mnemonicToSeedSync(mnemonic);
const derived = derivePath("m/44'/1729'/0'/0'", seed.toString("hex"));

// The private key is exactly 32 bytes
const privateKeyBytes = derived.key;

// Create node crypto private key
const priv = crypto.createPrivateKey({
  key: Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    privateKeyBytes
  ]),
  format: 'der',
  type: 'pkcs8'
});

// Tezos operation watermark is 0x03
const forgedHex = "0001020304"; // dummy forged hex
const watermark = Buffer.from('03', 'hex');
const dataToSign = Buffer.concat([watermark, Buffer.from(forgedHex, 'hex')]);

// Blake2b hash of the watermarked data (32 bytes)
const hash = Buffer.from(blake2b(dataToSign, { dkLen: 32 }));

console.log("Raw Hash to sign (hex):", hash.toString('hex'));

try {
  // Try signing with node crypto (ed25519)
  // crypto.sign natively handles the ed25519 scheme which expects the full data or pre-hashed? 
  // Ed25519 typically signs the RAW data, not the hash. But Tezos requires blake2b-256 hashing first.
  // Wait, wait! Does Tezos sign the blake2b hash of the watermarked message, or the watermarked message itself?
  // Tezos signs the blake2b 256 hash (32 bytes) of the watermarked message! Let's check.
  
  // Actually, ed25519 natively hashes the message with SHA512. If we just pass the blake2b hash to crypto.sign, it will be double hashed in Ed25519 unless we know specifically.
  // Wait, in Tezos, for Ed25519 (tz1), the message signature is the Ed25519 signature of the Blake2B (256-bit) hash of the data!
  // Wait no, actually Tezos Ed25519 signature signs the BLAKE2B 256 hash or just the plain data?
  // Let me just sign the `hash`.
  const signature = crypto.sign(null, hash, priv);
  console.log("Signature length:", signature.length); // Should be 64
  console.log("Signature hex:", signature.toString('hex'));
} catch (e) {
  console.error("Sign failed:", e);
}
