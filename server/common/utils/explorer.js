const { getChainConfig, getNetworkConfig } = require("../../config/chains");

function normalizeValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function normalizeSuffix(value) {
  const suffix = normalizeValue(value);
  return suffix || "";
}

function getExplorerNetworkEntry(chain, network) {
  const chainConfig = getChainConfig(chain);
  if (!chainConfig?.explorer?.supported) {
    return null;
  }

  const resolvedNetwork = normalizeValue(network) || chainConfig.defaultNetwork;
  const networkConfig = getNetworkConfig(chainConfig.code, resolvedNetwork);
  const networkCode = networkConfig?.code || resolvedNetwork;
  const explorerEntry = chainConfig.explorer.networks?.[networkCode];

  if (!explorerEntry) {
    return null;
  }

  return {
    chain: chainConfig.code,
    network: networkCode,
    chainConfig,
    networkConfig,
    explorerEntry,
  };
}

function buildExplorerUrl(baseUrl, value, querySuffix = "") {
  const normalizedBaseUrl = normalizeValue(baseUrl);
  const normalizedValue = normalizeValue(value);

  if (!normalizedBaseUrl || !normalizedValue) {
    return null;
  }

  return `${normalizedBaseUrl}${encodeURIComponent(normalizedValue)}${normalizeSuffix(querySuffix)}`;
}

function buildAddressExplorerUrl(chain, network, address) {
  const entry = getExplorerNetworkEntry(chain, network);
  if (!entry) {
    return null;
  }

  return buildExplorerUrl(
    entry.explorerEntry.addressBaseUrl,
    address,
    entry.explorerEntry.querySuffix,
  );
}

function buildTransactionExplorerUrl(chain, network, txHash) {
  const entry = getExplorerNetworkEntry(chain, network);
  if (!entry) {
    return null;
  }

  return buildExplorerUrl(
    entry.explorerEntry.transactionBaseUrl,
    txHash,
    entry.explorerEntry.querySuffix,
  );
}

function buildExplorerMetadata(chain, network, input = {}) {
  const entry = getExplorerNetworkEntry(chain, network);
  const addressUrl = buildAddressExplorerUrl(chain, network, input.address);
  const fromAddressUrl = buildAddressExplorerUrl(chain, network, input.fromAddress);
  const toAddressUrl = buildAddressExplorerUrl(chain, network, input.toAddress);
  const transactionUrl = buildTransactionExplorerUrl(chain, network, input.txHash);

  return {
    supported: Boolean(entry),
    chain: entry?.chain || normalizeValue(chain).toLowerCase(),
    network: entry?.network || normalizeValue(network).toLowerCase(),
    addressUrl,
    fromAddressUrl,
    toAddressUrl,
    transactionUrl,
  };
}

module.exports = {
  buildAddressExplorerUrl,
  buildTransactionExplorerUrl,
  buildExplorerMetadata,
};
