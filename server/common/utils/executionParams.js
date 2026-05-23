const { AppError } = require("../../helpers/errors");

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_TOP_LEVEL_KEYS = 25;
const MAX_NESTED_DEPTH = 3;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeScalarValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw AppError.validation("Execution params cannot contain non-finite numbers");
    }

    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw AppError.validation("Execution params cannot contain invalid dates");
    }

    return value.toISOString();
  }

  return undefined;
}

function sanitizeValue(value, fieldName, path, depth) {
  const scalar = normalizeScalarValue(value);
  if (scalar !== undefined || value === undefined) {
    return scalar;
  }

  if (depth >= MAX_NESTED_DEPTH) {
    throw AppError.validation(
      `${fieldName} cannot be nested deeper than ${MAX_NESTED_DEPTH} levels`,
    );
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      sanitizeValue(entry, fieldName, `${path}[${index}]`, depth + 1));
  }

  if (!isPlainObject(value)) {
    throw AppError.validation(`${fieldName}.${path} contains an unsupported value`);
  }

  return sanitizeObject(value, {
    fieldName,
    depth: depth + 1,
    parentPath: path,
    maxKeys: 50,
  });
}

function sanitizeObject(
  input,
  { fieldName = "executionParams", depth = 0, parentPath = "", maxKeys = MAX_TOP_LEVEL_KEYS } = {},
) {
  if (input === undefined || input === null) {
    return {};
  }

  if (!isPlainObject(input)) {
    throw AppError.validation(`${fieldName} must be an object`);
  }

  const entries = Object.entries(input);
  if (entries.length > maxKeys) {
    throw AppError.validation(`${fieldName} supports at most ${maxKeys} keys`);
  }

  return entries.reduce((result, [rawKey, value]) => {
    const key = String(rawKey || "").trim();
    const path = parentPath ? `${parentPath}.${key}` : key;

    if (!key || RESERVED_KEYS.has(key)) {
      throw AppError.validation(`${fieldName} contains an unsupported key`);
    }

    result[key] = sanitizeValue(value, fieldName, path, depth);
    return result;
  }, {});
}

function normalizeExecutionParamsObject(input, fieldName = "executionParams") {
  return sanitizeObject(input, { fieldName });
}

function mergeExecutionParams(...values) {
  return values.reduce((result, value) => ({
    ...result,
    ...normalizeExecutionParamsObject(value),
  }), {});
}

function getLegacyDestinationTag(executionParams = {}) {
  if (!executionParams || typeof executionParams !== "object") {
    return null;
  }

  const value = executionParams.destinationTag;
  return value === undefined || value === null || value === "" ? null : value;
}

module.exports = {
  isPlainObject,
  normalizeExecutionParamsObject,
  mergeExecutionParams,
  getLegacyDestinationTag,
};
