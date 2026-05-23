const bcrypt = require("bcryptjs");

const securityConfig = require("../../config/security");
const { AppError } = require("../../helpers/errors");

function normalizeSuperadminEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assertValidPassword(password) {
  const normalizedPassword = String(password || "");

  if (normalizedPassword.length < 12) {
    throw AppError.validation("Password must be at least 12 characters long");
  }

  if (normalizedPassword.length > 200) {
    throw AppError.validation("Password must not exceed 200 characters");
  }

  return normalizedPassword;
}

async function hashSuperadminPassword(password) {
  const normalizedPassword = assertValidPassword(password);
  return bcrypt.hash(normalizedPassword, securityConfig.bcryptSaltRounds);
}

async function verifySuperadminPassword(password, passwordHash) {
  if (!passwordHash) {
    return false;
  }

  return bcrypt.compare(String(password || ""), passwordHash);
}

module.exports = {
  assertValidPassword,
  hashSuperadminPassword,
  normalizeSuperadminEmail,
  verifySuperadminPassword,
};
