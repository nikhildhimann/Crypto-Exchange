function bytesToBase64(bytes) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

const SECURE_PIN_ALGORITHM = "pbkdf2-sha256";
const DEV_FALLBACK_PIN_ALGORITHM = "dev-fallback-v1";
const WEAK_PIN_VALUES = new Set(["123456", "654321"]);
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

function getWindowCrypto() {
  if (typeof window === "undefined") {
    return typeof globalThis.crypto === "undefined" ? null : globalThis.crypto;
  }

  return window.crypto || globalThis.crypto || null;
}

function hasSecurePinCrypto() {
  return Boolean(getWindowCrypto()?.subtle);
}

function canUseDevPinFallback() {
  return Boolean(import.meta.env.DEV);
}

function getPinStorageUnavailableReason() {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "This browser blocks secure PIN storage on non-HTTPS pages. Open the app on localhost or serve it over HTTPS.";
  }

  return "Secure PIN storage is unavailable on this device";
}

function getCryptoOrThrow() {
  const secureCrypto = getWindowCrypto();
  if (!secureCrypto?.subtle) {
    throw new Error(getPinStorageUnavailableReason());
  }

  return secureCrypto;
}

function getRandomBytes(length) {
  const secureCrypto = getWindowCrypto();
  const bytes = new Uint8Array(length);

  if (secureCrypto?.getRandomValues) {
    secureCrypto.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

function fnv1a64(value) {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }

  return hash.toString(16).padStart(16, "0");
}

function deriveDevFallbackPinHash(pin, saltBase64) {
  const base = `${saltBase64}:${pin}:aura-dev-pin`;
  let previousHash = base;

  for (let round = 0; round < 4096; round += 1) {
    previousHash = [
      fnv1a64(`a:${round}:${previousHash}:${base}`),
      fnv1a64(`b:${round}:${base}:${previousHash}`),
      fnv1a64(`c:${previousHash}:${round}`),
      fnv1a64(`d:${base}:${round}`),
    ].join("");
  }

  return previousHash;
}

export function getPinStorageSupport() {
  if (hasSecurePinCrypto()) {
    return {
      supported: true,
      usesReducedSecurity: false,
      algorithm: SECURE_PIN_ALGORITHM,
      message: "",
    };
  }

  if (canUseDevPinFallback()) {
    return {
      supported: true,
      usesReducedSecurity: true,
      algorithm: DEV_FALLBACK_PIN_ALGORITHM,
      message:
      ""
    };
  }

  return {
    supported: false,
    usesReducedSecurity: false,
    algorithm: "",
    message: getPinStorageUnavailableReason(),
  };
}

export function isValidPinFormat(pin = "") {
  return /^\d{6}$/.test(String(pin));
}

export function sanitizePinInput(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 6);
}

function isRepeatedPin(pin) {
  return /^(\d)\1{5}$/.test(pin);
}

function isSequentialPin(pin) {
  if (!isValidPinFormat(pin)) {
    return false;
  }

  const digits = pin.split("").map((digit) => Number(digit));
  const ascending = digits.every((digit, index) => index === 0 || digit - digits[index - 1] === 1);
  const descending = digits.every((digit, index) => index === 0 || digit - digits[index - 1] === -1);

  return ascending || descending;
}

export function getPinValidationError(pin = "") {
  const normalizedPin = String(pin || "");

  if (!isValidPinFormat(normalizedPin)) {
    return "PIN must be 6 digits";
  }

  if (isRepeatedPin(normalizedPin)) {
    return "Repeated digits not allowed";
  }

  if (isSequentialPin(normalizedPin)) {
    return "Sequential PIN not allowed";
  }

  if (WEAK_PIN_VALUES.has(normalizedPin)) {
    return "PIN is too weak";
  }

  return "";
}

export function getPinConfirmationError(pin = "", confirmPin = "") {
  if (!confirmPin) {
    return "";
  }

  if (!isValidPinFormat(confirmPin)) {
    return "PIN must be 6 digits";
  }

  if (String(pin) !== String(confirmPin)) {
    return "PINs do not match";
  }

  return "";
}

export function getAutoLockLabel(minutes) {
  if (minutes === 0) {
    return "Immediate";
  }

  return `${minutes} min`;
}

export async function generatePinCredentials(pin) {
  const validationError = getPinValidationError(pin);
  if (validationError) {
    throw new Error(validationError);
  }

  const support = getPinStorageSupport();
  if (!support.supported) {
    throw new Error(support.message);
  }

  const saltBytes = getRandomBytes(16);
  const pinSalt = bytesToBase64(saltBytes);
  const pinHash = await derivePinHash(pin, pinSalt, support.algorithm);

  return {
    pinSalt,
    pinHash,
    pinAlgorithm: support.algorithm,
  };
}

export async function derivePinHash(pin, saltBase64, pinAlgorithm = SECURE_PIN_ALGORITHM) {
  if (!isValidPinFormat(pin)) {
    throw new Error("PIN must be exactly 6 digits");
  }

  if (pinAlgorithm === DEV_FALLBACK_PIN_ALGORITHM) {
    return deriveDevFallbackPinHash(pin, saltBase64);
  }

  const secureCrypto = getCryptoOrThrow();
  const pinBytes = new TextEncoder().encode(pin);
  const saltBytes = base64ToBytes(saltBase64);
  const baseKey = await secureCrypto.subtle.importKey(
    "raw",
    pinBytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await secureCrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 150000,
      hash: "SHA-256",
    },
    baseKey,
    256,
  );

  return bytesToBase64(new Uint8Array(derivedBits));
}

export async function verifyPin(pin, pinHash, pinSalt, pinAlgorithm = SECURE_PIN_ALGORITHM) {
  if (!pinHash || !pinSalt) {
    return false;
  }

  const derivedHash = await derivePinHash(pin, pinSalt, pinAlgorithm);
  return derivedHash === pinHash;
}
