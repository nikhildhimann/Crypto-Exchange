const { Network } = require("alchemy-sdk");
const AppError = require("../../helpers/errors");

/**
 * Single source of truth for all NFT Marketplace supported chains.
 * @type {Object}
 */
const CHAIN_CONFIG = {
  polygon: {
    chainId: 137,
    name: "Polygon Mainnet",
    nativeCurrency: { symbol: "MATIC", decimals: 18 },
    openSeaChainName: "matic",
    alchemyNetwork: Network.MATIC_MAINNET,
    seaportAddress: "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
    conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
    explorerUrl: "https://polygonscan.com",
    isActive: true,
  },
  ethereum: {
    chainId: 1,
    name: "Ethereum Mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    openSeaChainName: "ethereum",
    alchemyNetwork: Network.ETH_MAINNET,
    seaportAddress: "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
    conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
    explorerUrl: "https://etherscan.io",
    isActive: false,
  },
  base: {
    chainId: 8453,
    name: "Base Mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    openSeaChainName: "base",
    alchemyNetwork: Network.BASE_MAINNET,
    seaportAddress: "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
    conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
    explorerUrl: "https://basescan.org",
    isActive: false,
  },
};

/**
 * Returns an array of supported chain keys based on configuration.
 * Reads NFT_MARKETPLACE_SUPPORTED_CHAINS environment variable if present.
 * @returns {Array<string>} List of active chain identifiers.
 */
const getSupportedChains = () => {
  if (process.env.NFT_MARKETPLACE_SUPPORTED_CHAINS) {
    const overrideChains = process.env.NFT_MARKETPLACE_SUPPORTED_CHAINS.split(",").map((c) => c.trim().toLowerCase());
    return Object.keys(CHAIN_CONFIG).filter((key) => overrideChains.includes(key));
  }
  return Object.keys(CHAIN_CONFIG).filter((key) => CHAIN_CONFIG[key].isActive);
};

/**
 * Returns the chain configuration object for a specific chain.
 * @param {string} chainName - The identifier of the chain (e.g., 'polygon')
 * @returns {Object} The chain configuration object.
 * @throws {AppError} If the chain is unsupported.
 */
const getChainConfig = (chainName) => {
  const normalizedKey = String(chainName).toLowerCase().trim();
  const config = CHAIN_CONFIG[normalizedKey];
  if (!config) {
    throw AppError.validation(`Unsupported chain for NFT Marketplace: ${normalizedKey}`);
  }
  
  const supported = getSupportedChains();
  if (!supported.includes(normalizedKey)) {
    throw AppError.validation(`Chain ${normalizedKey} is currently disabled for NFT Marketplace`);
  }
  
  // Create a deep copy to prevent polluting the base config via reference mutation
  const activeConfig = { ...config };
  activeConfig.seaportAddress = process.env.SEAPORT_CONTRACT_ADDRESS || activeConfig.seaportAddress;
  activeConfig.conduitKey = process.env.OPENSEA_CONDUIT_KEY || activeConfig.conduitKey;

  return activeConfig;
};

/**
 * Returns the OpenSea specific chain slug for a given chain key.
 * @param {string} chainName - The identifier of the chain.
 * @returns {string} The OpenSea chain name (e.g., 'matic' for 'polygon').
 */
const getOpenSeaChainName = (chainName) => {
  try {
    const config = getChainConfig(chainName);
    return config.openSeaChainName;
  } catch (err) {
    throw AppError.validation(`Cannot resolve OpenSea chain name for: ${chainName}`);
  }
};

module.exports = {
  CHAIN_CONFIG,
  getSupportedChains,
  getChainConfig,
  getOpenSeaChainName,
};
