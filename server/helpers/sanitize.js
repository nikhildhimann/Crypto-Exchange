const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const DEFAULT_MAX_SAFE_OBJECT_DEPTH = 4;
const DEFAULT_MAX_SAFE_OBJECT_KEYS = 25;
const DEFAULT_MAX_SAFE_ARRAY_LENGTH = 25;

function sanitizeString(value) {
  return String(value).replace(/\0/g, "").trim();
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !DANGEROUS_OBJECT_KEYS.has(String(key || "").trim()))
        .map(([key, nestedValue]) => [key, sanitizeValue(nestedValue)]),
    );
  }

  return value;
}

function normalizeStructuredValue(value, options, depth) {
  const {
    fieldName,
    maxDepth,
    maxKeys,
    maxArrayLength,
  } = options;

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      const error = new Error(`${fieldName} cannot contain non-finite numbers`);
      error.status = 400;
      throw error;
    }

    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > maxArrayLength) {
      const error = new Error(`${fieldName} supports at most ${maxArrayLength} array items`);
      error.status = 400;
      throw error;
    }

    if (depth >= maxDepth) {
      const error = new Error(`${fieldName} cannot be nested deeper than ${maxDepth} levels`);
      error.status = 400;
      throw error;
    }

    return value.map((entry) => normalizeStructuredValue(entry, options, depth + 1));
  }

  if (!isPlainObject(value)) {
    const error = new Error(`${fieldName} must contain only plain JSON objects`);
    error.status = 400;
    throw error;
  }

  if (depth >= maxDepth) {
    const error = new Error(`${fieldName} cannot be nested deeper than ${maxDepth} levels`);
    error.status = 400;
    throw error;
  }

  const entries = Object.entries(value)
    .filter(([key]) => !DANGEROUS_OBJECT_KEYS.has(String(key || "").trim()));

  if (entries.length > maxKeys) {
    const error = new Error(`${fieldName} supports at most ${maxKeys} keys`);
    error.status = 400;
    throw error;
  }

  return Object.fromEntries(
    entries.map(([key, nestedValue]) => [
      sanitizeString(key),
      normalizeStructuredValue(nestedValue, options, depth + 1),
    ]),
  );
}

function normalizePlainObjectInput(
  value,
  {
    fieldName = "metadata",
    maxDepth = DEFAULT_MAX_SAFE_OBJECT_DEPTH,
    maxKeys = DEFAULT_MAX_SAFE_OBJECT_KEYS,
    maxArrayLength = DEFAULT_MAX_SAFE_ARRAY_LENGTH,
  } = {},
) {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  if (!isPlainObject(value)) {
    const error = new Error(`${fieldName} must be an object`);
    error.status = 400;
    throw error;
  }

  return normalizeStructuredValue(value, {
    fieldName,
    maxDepth,
    maxKeys,
    maxArrayLength,
  }, 0);
}

function trimObjectStrings(payload = {}) {
  return sanitizeValue(payload);
}

function pickAllowedTopLevelFields(payload = {}, allowedFields = []) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const allowed = new Set(
    Array.from(allowedFields || []).map((field) => String(field || "").split(".")[0]).filter(Boolean),
  );

  if (!allowed.size) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => allowed.has(key)),
  );
}

function sanitizeUser(user = {}) {
  const plainUser = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete plainUser.passwordHash;
  delete plainUser.seedCipherText;
  delete plainUser.seedFingerprint;
  return plainUser;
}

function sanitizeAccount(account = {}) {
  const plainAccount = typeof account.toObject === "function" ? account.toObject() : { ...account };
  delete plainAccount.encryptedMnemonic;
  delete plainAccount.mnemonicFingerprint;
  delete plainAccount.userId;
  if (plainAccount._id !== undefined) {
    plainAccount.accountId = String(plainAccount._id);
    delete plainAccount._id;
  }
  return plainAccount;
}

module.exports = {
  sanitizeString,
  sanitizeValue,
  normalizePlainObjectInput,
  trimObjectStrings,
  pickAllowedTopLevelFields,
  sanitizeUser,
  sanitizeAccount,
};
