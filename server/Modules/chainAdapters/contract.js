const {
  getConfiguredChainConfig,
  getConfiguredChainCodes,
  getConfiguredNetworkCodes,
} = require("../../config/chains");

const REQUIRED_METHODS = Object.freeze({
  client: ["getClient"],
  amount: ["normalizeDisplayAmount", "toBaseUnits", "fromBaseUnits"],
  wallet: ["createWallet", "importWalletFromMnemonic", "validateAddress", "resolveAddressFromSecret"],
  transaction: [
    "normalizeExecutionParams",
    "validateDestination",
    "estimateTransfer",
    "executeTransfer",
    "fetchHistory",
  ],
  balance: ["fetchBalance"],
  deposit: ["watchDeposits"],
  withdrawal: ["submitWithdrawal"],
  qr: ["buildQrPayload"],
  mapper: ["mapTransaction"],
});

function assertObject(path, value) {
  if (!value || typeof value !== "object") {
    throw new Error(`[chainAdapters] "${path}" must be an object`);
  }
}

function assertFunction(path, value) {
  if (typeof value !== "function") {
    throw new Error(`[chainAdapters] "${path}" must be a function`);
  }
}

function validateAdapterRegistration(adapter) {
  assertObject("adapter", adapter);
  assertObject("adapter.metadata", adapter.metadata);

  const { code } = adapter.metadata;
  if (!code || typeof code !== "string") {
    throw new Error('[chainAdapters] "adapter.metadata.code" must be a non-empty string');
  }

  const chainConfig = getConfiguredChainConfig(code);
  if (!chainConfig) {
    throw new Error(
      `[chainAdapters] Unsupported adapter code "${code}". Configured chains: ${getConfiguredChainCodes().join(", ")}`,
    );
  }

  if (adapter.metadata.code !== chainConfig.code) {
    throw new Error(
      `[chainAdapters] Adapter metadata code "${adapter.metadata.code}" does not match chain config "${chainConfig.code}"`,
    );
  }

  if (adapter.metadata.label !== chainConfig.label) {
    throw new Error(
      `[chainAdapters] Adapter "${code}" label must match chain config label "${chainConfig.label}"`,
    );
  }

  if (!Array.isArray(adapter.metadata.capabilities)) {
    throw new Error(`[chainAdapters] Adapter "${code}" metadata.capabilities must be an array`);
  }

  const missingContractEntries = [];
  for (const [sectionName, methods] of Object.entries(REQUIRED_METHODS)) {
    if (!adapter[sectionName] || typeof adapter[sectionName] !== "object") {
      missingContractEntries.push(`adapter.${sectionName}`);
      continue;
    }

    for (const methodName of methods) {
      if (typeof adapter[sectionName][methodName] !== "function") {
        missingContractEntries.push(`adapter.${sectionName}.${methodName}`);
      }
    }
  }

  if (missingContractEntries.length) {
    throw new Error(
      `[chainAdapters] Adapter "${code}" is missing required contract members: ${missingContractEntries.join(", ")}`,
    );
  }

  const adapterNetworks = Array.isArray(adapter.metadata.supportedNetworks)
    ? adapter.metadata.supportedNetworks
    : [];

  if (!adapterNetworks.length) {
    throw new Error(`[chainAdapters] Adapter "${code}" must declare supportedNetworks`);
  }

  for (const network of adapterNetworks) {
    if (!network || typeof network.code !== "string") {
      throw new Error(`[chainAdapters] Adapter "${code}" has an invalid supported network entry`);
    }

    if (!getConfiguredNetworkCodes(code).includes(String(network.code).toLowerCase())) {
      throw new Error(
        `[chainAdapters] Adapter "${code}" declares unsupported network "${network.code}"`,
      );
    }
  }

  return adapter;
}

module.exports = {
  REQUIRED_METHODS,
  validateAdapterRegistration,
};
