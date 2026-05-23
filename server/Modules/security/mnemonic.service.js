const bip39 = require("bip39");
const { AppError } = require("../../helpers/errors");

const ALLOWED_MNEMONIC_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const MNEMONIC_CHARACTER_PATTERN = /^[a-zA-Z\s]+$/;

async function generateMnemonic() {
  return bip39.generateMnemonic(128);
}

function normalizeMnemonic(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function validateMnemonic(mnemonic) {
  const normalized = normalizeMnemonic(mnemonic);
  if (!normalized) {
    throw AppError.validation("Mnemonic is required");
  }

  if (!MNEMONIC_CHARACTER_PATTERN.test(normalized)) {
    throw AppError.validation("Mnemonic contains invalid characters");
  }

  const words = normalized.split(" ").filter(Boolean);
  if (!ALLOWED_MNEMONIC_WORD_COUNTS.has(words.length)) {
    throw AppError.validation(
      "Mnemonic must contain 12, 15, 18, 21, or 24 words",
    );
  }

  if (!bip39.validateMnemonic(normalized)) {
    throw AppError.validation("Invalid recovery phrase");
  }

  return normalized;
}

module.exports = {
  ALLOWED_MNEMONIC_WORD_COUNTS,
  generateMnemonic,
  normalizeMnemonic,
  validateMnemonic,
};
