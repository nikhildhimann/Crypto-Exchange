/**
 * Safely redacts sensitive information from objects and handles non-serializable 
 * types like BigInt and circular references to prevent crashes during logging.
 */
function redactObject(value, depth = 0, seen = new WeakSet()) {
  // Safety break for extremely deep objects to prevent stack overflow
  if (depth > 12) {
    return "[DEPTH_LIMIT]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  // Handle BigInt - cannot be serialized by JSON.stringify
  if (typeof value === "bigint") {
    return String(value);
  }

  // Handle basic types
  if (typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object" && value._bsontype === "ObjectId") {
    return String(value);
  }

  // Prevent circular references
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => redactObject(item, depth + 1, seen));
  }

  // Handle Objects
  seen.add(value);
  const redacted = {};
  const sensitiveKeys = ["password", "token", "secret", "mnemonic", "privateKey"];

  for (const key of Object.keys(value)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      redacted[key] = "[REDACTED]";
      continue;
    }

    try {
      redacted[key] = redactObject(value[key], depth + 1, seen);
    } catch (_error) {
      redacted[key] = "[UNSERIALIZABLE]";
    }
  }

  return redacted;
}

module.exports = {
  redactObject,
};
