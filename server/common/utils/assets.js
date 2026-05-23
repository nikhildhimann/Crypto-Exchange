const { AppError } = require("../../helpers/errors");
const {
  formatUnitsFromBase,
  normalizeDecimalAmount,
  parseUnitsToBase,
} = require("./amount");
const { buildAddressExplorerUrl } = require("./explorer");
const { getChainConfig, getNetworkConfig } = require("../../config/chains");
const {
  getTokenConfig,
  listEnabledTokenMetadata,
} = require("../../config/tokens");

function normalizeString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function normalizeCode(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeSymbol(value) {
  return normalizeString(value).toUpperCase();
}

function assertRuntimeChainNetwork(chainCode, networkCode) {
  const chain = getChainConfig(chainCode);
  if (!chain) {
    throw AppError.validation(`Unsupported chain "${chainCode}"`);
  }

  const network = getNetworkConfig(chain.code, networkCode || chain.defaultNetwork);
  if (!network) {
    throw AppError.validation(
      `Unsupported network "${networkCode}" for chain "${chain.code}"`,
    );
  }

  return {
    chain,
    network,
  };
}

function buildNativeAssetDescriptor(chainCode, networkCode) {
  const { chain, network } = assertRuntimeChainNetwork(chainCode, networkCode);

  return {
    chain: chain.code,
    network: network.code,
    code: normalizeCode(chain.nativeAssetSymbol),
    asset: normalizeSymbol(chain.nativeAssetSymbol),
    symbol: normalizeSymbol(chain.nativeAssetSymbol),
    label: normalizeString(chain.nativeAssetSymbol),
    assetType: "native",
    standard: "native",
    decimals: Math.max(Number(chain.decimals) || 0, 0),
    baseUnitName: normalizeString(chain.baseUnitName) || "base units",
    contractAddress: null,
    contractExplorerUrl: null,
    features: chain.features,
    toggles: chain.toggles,
    metadata: Object.freeze({}),
  };
}

function buildTokenExplorerUrl(token) {
  const tokenBaseUrl = normalizeString(token?.explorer?.tokenBaseUrl);
  const contractAddress = normalizeString(token?.contractAddress);

  if (tokenBaseUrl && contractAddress) {
    return `${tokenBaseUrl}${encodeURIComponent(contractAddress)}`;
  }

  return buildAddressExplorerUrl(token.chain, token.network, contractAddress);
}

function buildTokenAssetDescriptor(token) {
  return {
    chain: token.chain,
    network: token.network,
    code: token.code,
    asset: token.asset,
    symbol: token.symbol,
    label: token.label,
    assetType: "token",
    standard: token.standard,
    decimals: token.decimals,
    baseUnitName: token.baseUnitName,
    contractAddress: token.contractAddress,
    contractExplorerUrl: buildTokenExplorerUrl(token),
    features: token.features,
    toggles: token.toggles,
    metadata: token.metadata || {},
  };
}

function listSupportedTokenMetadata(chainCode, networkCode) {
  return listEnabledTokenMetadata(chainCode, networkCode).map(buildTokenAssetDescriptor);
}

function listSupportedAssetMetadata(chainCode, networkCode) {
  return [
    buildNativeAssetDescriptor(chainCode, networkCode),
    ...listSupportedTokenMetadata(chainCode, networkCode),
  ];
}

function resolveSupportedAsset(chainCode, networkCode, requestedAsset) {
  const nativeAsset = buildNativeAssetDescriptor(chainCode, networkCode);
  const normalizedIdentifier = normalizeString(requestedAsset);

  if (!normalizedIdentifier) {
    return nativeAsset;
  }

  const nativeMatches = new Set([
    nativeAsset.asset,
    nativeAsset.symbol,
    nativeAsset.code,
  ]);

  if (
    nativeMatches.has(normalizeSymbol(normalizedIdentifier)) ||
    nativeMatches.has(normalizeCode(normalizedIdentifier))
  ) {
    return nativeAsset;
  }

  const token = getTokenConfig(chainCode, networkCode, normalizedIdentifier);
  if (!token) {
    throw AppError.validation(
      `Asset "${requestedAsset}" is not supported for chain "${chainCode}" on network "${networkCode}"`,
    );
  }

  return buildTokenAssetDescriptor(token);
}

function formatAssetBalanceFromBase(asset, baseUnitValue) {
  return formatUnitsFromBase(baseUnitValue, asset?.decimals ?? 0);
}

function normalizeAssetAmount(asset, value) {
  return normalizeDecimalAmount(value, asset?.decimals ?? 0);
}

function toAssetBaseUnits(asset, value) {
  return parseUnitsToBase(value, asset?.decimals ?? 0);
}

function fromAssetBaseUnits(asset, value) {
  return formatUnitsFromBase(value, asset?.decimals ?? 0);
}

module.exports = {
  buildNativeAssetDescriptor,
  buildTokenAssetDescriptor,
  listSupportedTokenMetadata,
  listSupportedAssetMetadata,
  resolveSupportedAsset,
  formatAssetBalanceFromBase,
  normalizeAssetAmount,
  toAssetBaseUnits,
  fromAssetBaseUnits,
};
