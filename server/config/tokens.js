const { AppError } = require("../helpers/errors");
const {
  getConfiguredChainConfig,
  getConfiguredNetworkConfig,
  isChainEnabled,
  isNetworkEnabled,
} = require("./chains");
const tronWallet = require("../Modules/chainAdapters/tron/wallet");

const DEFAULT_TOKEN_FEATURES = Object.freeze({
  balance: true,
  receive: true,
  send: false,
  history: false,
});

const DEFAULT_TOKEN_TOGGLES = Object.freeze({
  enabled: true,
  balanceEnabled: true,
  receiveEnabled: true,
  sendEnabled: false,
  historyEnabled: false,
});

const BASE_TOKEN_CONFIG = Object.freeze([
  Object.freeze({
    chain: "arbitrum",
    network: "mainnet",
    standard: "erc20",
    code: "arb",
    asset: "ARB",
    symbol: "ARB",
    label: "Arbitrum",
    contractAddress: "0x912CE59144191C1204E64559FE8253a0e49E6548",
    decimals: 18,
    baseUnitName: "wei",
    explorer: Object.freeze({
      tokenBaseUrl: "https://arbiscan.io/token/",
    }),
    metadata: Object.freeze({
      issuer: "Offchain Labs",
      verified: true,
      receiveNote: "Receive on your Arbitrum wallet address. ETH is still needed later for on-chain token transfers.",
    }),
    features: Object.freeze({
      balance: true,
      receive: true,
      send: false,
      history: false,
    }),
    toggles: Object.freeze({
      enabled: true,
      balanceEnabled: true,
      receiveEnabled: true,
      sendEnabled: false,
      historyEnabled: false,
    }),
    enabled: true,
  }),
  Object.freeze({
    chain: "tron",
    network: "mainnet",
    standard: "trc20",
    code: "usdt",
    asset: "USDT",
    symbol: "USDT",
    label: "Tether USD",
    contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    decimals: 6,
    baseUnitName: "micro-usdt",
    explorer: Object.freeze({
      tokenBaseUrl: "https://tronscan.org/#/token20/",
    }),
    metadata: Object.freeze({
      issuer: "Tether",
      verified: true,
      receiveNote: "Receive on your TRON wallet address. TRX is still needed later for on-chain token transfers.",
    }),
    features: Object.freeze({
      balance: true,
      receive: true,
      send: true,
      history: true,
    }),
    toggles: Object.freeze({
      enabled: true,
      balanceEnabled: true,
      receiveEnabled: true,
      sendEnabled: true,
      historyEnabled: true,
    }),
    enabled: true,
  }),
]);

function normalizeCode(value, fallback = "") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase();
}

function normalizeSymbol(value, fallback = "") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toUpperCase();
}

function toBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return Boolean(value);
}

function normalizeTokenFeatures(input = {}) {
  return Object.freeze({
    ...DEFAULT_TOKEN_FEATURES,
    ...(input && typeof input === "object" ? input : {}),
  });
}

function normalizeTokenToggles(input = {}, fallbackEnabled = true) {
  const merged = {
    ...DEFAULT_TOKEN_TOGGLES,
    ...(input && typeof input === "object" ? input : {}),
  };

  return Object.freeze({
    enabled: toBoolean(merged.enabled, fallbackEnabled),
    balanceEnabled: toBoolean(merged.balanceEnabled, true),
    receiveEnabled: toBoolean(merged.receiveEnabled, true),
    sendEnabled: toBoolean(merged.sendEnabled, false),
    historyEnabled: toBoolean(merged.historyEnabled, false),
  });
}

function normalizeTokenConfig(token) {
  const chain = normalizeCode(token.chain);
  const network = normalizeCode(token.network);
  const asset = normalizeSymbol(token.asset || token.symbol);
  const symbol = normalizeSymbol(token.symbol || token.asset);
  const code = normalizeCode(token.code || symbol);
  const features = normalizeTokenFeatures(token.features);
  const toggles = normalizeTokenToggles(token.toggles, token.enabled !== false);

  return Object.freeze({
    ...token,
    chain,
    network,
    code,
    asset,
    symbol,
    label: String(token.label || symbol).trim() || symbol,
    contractAddress: String(token.contractAddress || "").trim(),
    standard: normalizeCode(token.standard || "token", "token"),
    decimals: Math.max(Number(token.decimals) || 0, 0),
    baseUnitName: String(token.baseUnitName || "").trim() || "base units",
    features,
    toggles,
    enabled: toggles.enabled,
    explorer:
      token.explorer && typeof token.explorer === "object" && !Array.isArray(token.explorer)
        ? Object.freeze({ ...token.explorer })
        : Object.freeze({}),
    metadata:
      token.metadata && typeof token.metadata === "object" && !Array.isArray(token.metadata)
        ? Object.freeze({ ...token.metadata })
        : Object.freeze({}),
  });
}

function assertConfiguredChainNetwork(token) {
  if (!getConfiguredChainConfig(token.chain)) {
    throw AppError.validation(
      `Token "${token.asset || token.code}" references unsupported chain "${token.chain}"`,
    );
  }

  if (!getConfiguredNetworkConfig(token.chain, token.network)) {
    throw AppError.validation(
      `Token "${token.asset || token.code}" references unsupported network "${token.network}" for chain "${token.chain}"`,
    );
  }
}

function assertValidTokenContract(token) {
  if (!token.contractAddress) {
    throw AppError.validation(
      `Token "${token.asset || token.code}" is missing a contract address`,
    );
  }

  if (token.standard === "trc20" && token.chain === "tron" && !tronWallet.validateAddress(token.contractAddress)) {
    throw AppError.validation(
      `Token "${token.asset || token.code}" has an invalid TRC20 contract address`,
    );
  }
}

function assertValidTokenConfig(token) {
  if (!token.code) {
    throw AppError.validation("Token config is missing a code");
  }

  if (!token.asset) {
    throw AppError.validation(`Token "${token.code}" is missing an asset symbol`);
  }

  if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 36) {
    throw AppError.validation(
      `Token "${token.asset}" has invalid decimals "${token.decimals}"`,
    );
  }

  assertConfiguredChainNetwork(token);
  assertValidTokenContract(token);
}

function assertNoDuplicateTokens(tokens) {
  const seenKeys = new Map();

  for (const token of tokens) {
    const keys = [
      `code:${token.chain}:${token.network}:${token.code}`,
      `asset:${token.chain}:${token.network}:${token.asset}`,
      `contract:${token.chain}:${token.network}:${String(token.contractAddress).toLowerCase()}`,
    ];

    for (const key of keys) {
      if (seenKeys.has(key)) {
        const existing = seenKeys.get(key);
        throw AppError.validation(
          `Duplicate token config detected for "${token.asset}" and "${existing.asset}" on ${token.chain}/${token.network}`,
        );
      }

      seenKeys.set(key, token);
    }
  }
}

const CONFIGURED_TOKENS = Object.freeze(
  (() => {
    const normalizedTokens = BASE_TOKEN_CONFIG.map(normalizeTokenConfig);
    normalizedTokens.forEach(assertValidTokenConfig);
    assertNoDuplicateTokens(normalizedTokens);
    return normalizedTokens;
  })(),
);

function listConfiguredTokens() {
  return CONFIGURED_TOKENS;
}

function listConfiguredTokensForChain(chainCode, networkCode) {
  const normalizedChain = normalizeCode(chainCode);
  const normalizedNetwork = normalizeCode(networkCode);

  return CONFIGURED_TOKENS.filter((token) => {
    if (normalizedChain && token.chain !== normalizedChain) {
      return false;
    }

    if (normalizedNetwork && token.network !== normalizedNetwork) {
      return false;
    }

    return Boolean(getConfiguredChainConfig(token.chain)) &&
      Boolean(getConfiguredNetworkConfig(token.chain, token.network));
  });
}

function listEnabledTokens(chainCode, networkCode) {
  return listConfiguredTokensForChain(chainCode, networkCode).filter(
    (token) =>
      token.enabled &&
      token.toggles.enabled &&
      isChainEnabled(token.chain) &&
      isNetworkEnabled(token.chain, token.network),
  );
}

function matchesToken(token, identifier) {
  const normalizedIdentifier = String(identifier || "").trim();
  const lowerIdentifier = normalizeCode(identifier);
  const upperIdentifier = normalizeSymbol(identifier);

  return [
    token.code,
    token.contractAddress.toLowerCase(),
  ].includes(lowerIdentifier) || [
    token.asset,
    token.symbol,
  ].includes(upperIdentifier) || token.contractAddress === normalizedIdentifier;
}

function getConfiguredTokenConfig(chainCode, networkCode, identifier) {
  return (
    listConfiguredTokensForChain(chainCode, networkCode).find((token) =>
      matchesToken(token, identifier)) || null
  );
}

function getTokenConfig(chainCode, networkCode, identifier) {
  return (
    listEnabledTokens(chainCode, networkCode).find((token) =>
      matchesToken(token, identifier)) || null
  );
}

function listEnabledTokenMetadata(chainCode, networkCode) {
  return listEnabledTokens(chainCode, networkCode).map((token) => ({
    chain: token.chain,
    network: token.network,
    code: token.code,
    asset: token.asset,
    symbol: token.symbol,
    label: token.label,
    standard: token.standard,
    contractAddress: token.contractAddress,
    decimals: token.decimals,
    baseUnitName: token.baseUnitName,
    features: token.features,
    toggles: token.toggles,
    enabled: token.enabled,
    explorer: token.explorer,
    metadata: token.metadata,
  }));
}

module.exports = {
  BASE_TOKEN_CONFIG,
  listConfiguredTokens,
  listConfiguredTokensForChain,
  listEnabledTokens,
  listEnabledTokenMetadata,
  getConfiguredTokenConfig,
  getTokenConfig,
};
