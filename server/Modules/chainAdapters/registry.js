const { validateAdapterRegistration } = require("./contract");
const { AppError } = require("../../helpers/errors");

const registry = new Map();

function registerAdapter(adapter) {
  const validatedAdapter = validateAdapterRegistration(adapter);
  const code = validatedAdapter.metadata.code;

  if (registry.has(code)) {
    throw new Error(`[chainAdapters] Duplicate adapter registration attempted for "${code}"`);
  }

  registry.set(code, validatedAdapter);
}

function getAdapter(chain) {
  const adapter = registry.get(String(chain).toLowerCase());
  if (!adapter) {
    throw AppError.notFound(`No chain adapter registered for "${chain}"`);
  }

  return adapter;
}

function getAdapterOrNull(chain) {
  return registry.get(String(chain).toLowerCase()) || null;
}

function hasAdapter(chain) {
  return registry.has(String(chain).toLowerCase());
}

function listAdapters() {
  return Array.from(registry.values()).map((adapter) => adapter.metadata);
}

function listAdapterCodes() {
  return Array.from(registry.keys());
}

// Export early to break circular dependencies
module.exports = {
  registerAdapter,
  getAdapter,
  getAdapterOrNull,
  hasAdapter,
  listAdapters,
  listAdapterCodes,
};

// Now load manifest after methods are exported
const registeredAdapters = require("./manifest");
registeredAdapters.forEach(registerAdapter);
