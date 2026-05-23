import xrpLogo from "../img/xrp.png";
import solLogo from "../img/sol.png";
import bnbLogo from "../img/BNB.png";
import ethLogo from "../img/eth.png";
import tronLogo from "../img/tron.png";
import btcLogo from "../img/btc.png";
import adaLogo from "../img/cardano-ada.webp";
import hbarLogo from "../img/hedera.webp";
import suiLogo from "../img/sui.png";
import ltcLogo from "../img/ltc.png";
import tonLogo from "../img/ton.png";
import dogeLogo from "../img/dog.webp";
import avaxLogo from "../img/avax.webp";
import polygonLogo from "../img/polygon.webp";
import arbitrumLogo from "../img/arbitrum.png";
import usdtLogo from "../img/usdt.png";
import aptosLogo from "../img/Aptos.webp";
import xtzLogo from "../img/xtz.png";
const EMPTY_NETWORKS = Object.freeze([]);

const CHAIN_CODE_ALIASES = Object.freeze({
  hedera: "hbar",
});

export function normalizeChainCode(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  return CHAIN_CODE_ALIASES[normalized] || normalized;
}

export const CHAIN_REGISTRY = {
  xrp: {
    id: "xrp",
    code: "xrp",
    name: "XRP",
    label: "XRP",
    symbol: "XRP",
    nativeAssetSymbol: "XRP",
    color: "#4F46E5",
    icon: xrpLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "XRP Address",
    decimals: 6,
    baseUnitName: "drop",
    supportsDestinationTag: true,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://livenet.xrpl.org/transactions/",
        addressBaseUrl: "https://livenet.xrpl.org/accounts/",
        querySuffix: "",
      },
      testnet: {
        transactionBaseUrl: "https://testnet.xrpl.org/transactions/",
        addressBaseUrl: "https://testnet.xrpl.org/accounts/",
        querySuffix: "",
      },
    },
  },
  solana: {
    id: "solana",
    code: "solana",
    name: "Solana",
    label: "Solana",
    symbol: "SOL",
    nativeAssetSymbol: "SOL",
    color: "#14F195",
    icon: solLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "Solana Address",
    decimals: 9,
    baseUnitName: "lamport",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://explorer.solana.com/tx/",
        addressBaseUrl: "https://explorer.solana.com/address/",
        querySuffix: "",
      },
      testnet: {
        transactionBaseUrl: "https://explorer.solana.com/tx/",
        addressBaseUrl: "https://explorer.solana.com/address/",
        querySuffix: "?cluster=testnet",
      },
    },
  },
  bnb: {
    id: "bnb",
    code: "bnb",
    name: "BNB Smart Chain",
    label: "BNB Smart Chain",
    symbol: "BNB",
    nativeAssetSymbol: "BNB",
    color: "#F3BA2F",
    icon: bnbLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "BNB Address",
    decimals: 18,
    baseUnitName: "wei",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://bscscan.com/tx/",
        addressBaseUrl: "https://bscscan.com/address/",
        querySuffix: "",
      },
      testnet: {
        transactionBaseUrl: "https://testnet.bscscan.com/tx/",
        addressBaseUrl: "https://testnet.bscscan.com/address/",
        querySuffix: "",
      },
    },
  },
  eth: {
    id: "eth",
    code: "eth",
    name: "Ethereum",
    label: "Ethereum",
    symbol: "ETH",
    nativeAssetSymbol: "ETH",
    color: "#627EEA",
    icon: ethLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "ETH Address",
    decimals: 18,
    baseUnitName: "wei",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://etherscan.io/tx/",
        addressBaseUrl: "https://etherscan.io/address/",
        querySuffix: "",
      },
    },
  },
  tron: {
    id: "tron",
    code: "tron",
    name: "TRON",
    label: "TRON",
    symbol: "TRX",
    nativeAssetSymbol: "TRX",
    color: "#FF060A",
    icon: tronLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "TRON Address",
    decimals: 6,
    baseUnitName: "sun",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://tronscan.org/#/transaction/",
        addressBaseUrl: "https://tronscan.org/#/address/",
        querySuffix: "",
      },
      testnet: {
        transactionBaseUrl: "https://nile.tronscan.org/#/transaction/",
        addressBaseUrl: "https://nile.tronscan.org/#/address/",
        querySuffix: "",
      },
    },
  },
  btc: {
    id: "btc",
    code: "btc",
    name: "Bitcoin",
    label: "Bitcoin",
    symbol: "BTC",
    nativeAssetSymbol: "BTC",
    color: "#F7931A",
    icon: btcLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "Bitcoin Address",
    decimals: 8,
    baseUnitName: "satoshi",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://blockstream.info/tx/",
        addressBaseUrl: "https://blockstream.info/address/",
        querySuffix: "",
      },
      testnet: {
        transactionBaseUrl: "https://blockstream.info/testnet/tx/",
        addressBaseUrl: "https://blockstream.info/testnet/address/",
        querySuffix: "",
      },
    },
  },
  ada: {
    id: "ada",
    code: "ada",
    name: "Cardano",
    label: "Cardano",
    symbol: "ADA",
    nativeAssetSymbol: "ADA",
    color: "#2A6CF6",
    icon: adaLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "Cardano Address",
    decimals: 6,
    baseUnitName: "lovelace",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://cexplorer.io/tx/",
        addressBaseUrl: "https://cexplorer.io/address/",
        querySuffix: "",
      },
      preprod: {
        transactionBaseUrl: "https://preprod.cexplorer.io/tx/",
        addressBaseUrl: "https://preprod.cexplorer.io/address/",
        querySuffix: "",
      },
    },
  },
  hbar: {
    id: "hbar",
    code: "hbar",
    name: "Hedera",
    label: "Hedera",
    symbol: "HBAR",
    nativeAssetSymbol: "HBAR",
    color: "#0F172A",
    icon: hbarLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "Hedera Account ID",
    decimals: 8,
    baseUnitName: "tinybar",
    supportsDestinationTag: false,
    supportsMemo: true,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://hashscan.io/mainnet/transaction/",
        addressBaseUrl: "https://hashscan.io/mainnet/account/",
        querySuffix: "",
      },
      testnet: {
        transactionBaseUrl: "https://hashscan.io/testnet/transaction/",
        addressBaseUrl: "https://hashscan.io/testnet/account/",
        querySuffix: "",
      },
    },
  },
  sui: {
    id: "sui",
    code: "sui",
    name: "Sui",
    label: "Sui",
    symbol: "SUI",
    nativeAssetSymbol: "SUI",
    color: "#6FBCF0",
    icon: suiLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "Sui Address",
    decimals: 9,
    baseUnitName: "mist",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://suivision.xyz/txblock/",
        addressBaseUrl: "https://suivision.xyz/account/",
        querySuffix: "",
      },
    },
  },
  ltc: {
    id: "ltc",
    code: "ltc",
    name: "Litecoin",
    label: "Litecoin",
    symbol: "LTC",
    nativeAssetSymbol: "LTC",
    color: "#345D9D",
    icon: ltcLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "Litecoin Address",
    decimals: 8,
    baseUnitName: "litoshi",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://litecoinspace.org/tx/",
        addressBaseUrl: "https://litecoinspace.org/address/",
        querySuffix: "",
      },
    },
  },
  ton: {
    id: "ton",
    code: "ton",
    name: "Toncoin",
    label: "Toncoin",
    symbol: "TON",
    nativeAssetSymbol: "TON",
    color: "#0098EA",
    icon: tonLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "TON Address",
    decimals: 9,
    baseUnitName: "nanoton",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://tonviewer.com/transaction/",
        addressBaseUrl: "https://tonviewer.com/",
        querySuffix: "",
      },
    },
  },
  xtz: {
    id: "xtz",
    code: "xtz",
    name: "Tezos",
    label: "Tezos",
    symbol: "XTZ",
    nativeAssetSymbol: "XTZ",
    color: "#2C7DF7",
    icon: xtzLogo,
    supportedNetworks: EMPTY_NETWORKS,
    networks: EMPTY_NETWORKS,
    defaultNetwork: "",
    addressLabel: "Tezos Address",
    decimals: 6,
    baseUnitName: "mutez",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://tzkt.io/",
        addressBaseUrl: "https://tzkt.io/",
        querySuffix: "",
      },
      ghostnet: {
        transactionBaseUrl: "https://ghostnet.tzkt.io/",
        addressBaseUrl: "https://ghostnet.tzkt.io/",
        querySuffix: "",
      },
    },
  },
  doge: {
    id: "doge",
    code: "doge",
    name: "Dogecoin",
    label: "Dogecoin",
    symbol: "DOGE",
    nativeAssetSymbol: "DOGE",
    color: "#C2A633",
    icon: dogeLogo,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    networks: Object.freeze(["mainnet"]),
    defaultNetwork: "mainnet",
    addressLabel: "Dogecoin Address",
    decimals: 8,
    baseUnitName: "koinu",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://dogechain.info/tx/",
        addressBaseUrl: "https://dogechain.info/address/",
        querySuffix: "",
      },
    },
  },
  avax: {
    id: "avax",
    code: "avax",
    name: "Avalanche",
    label: "Avalanche C-Chain",
    symbol: "AVAX",
    nativeAssetSymbol: "AVAX",
    color: "#E84142",
    icon: avaxLogo,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    networks: Object.freeze(["mainnet"]),
    defaultNetwork: "mainnet",
    addressLabel: "AVAX Address",
    decimals: 18,
    baseUnitName: "wei",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://snowtrace.io/tx/",
        addressBaseUrl: "https://snowtrace.io/address/",
        querySuffix: "",
      },
    },
  },
  polygon: {
    id: "polygon",
    code: "polygon",
    name: "Polygon",
    label: "Polygon",
    symbol: "POL",
    nativeAssetSymbol: "POL",
    color: "#8247E5",
    icon: polygonLogo,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    networks: Object.freeze(["mainnet"]),
    defaultNetwork: "mainnet",
    addressLabel: "POL Address",
    decimals: 18,
    baseUnitName: "wei",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://polygonscan.com/tx/",
        addressBaseUrl: "https://polygonscan.com/address/",
        querySuffix: "",
      },
    },
  },
  aptos: {
    id: "aptos",
    code: "aptos",
    name: "Aptos",
    label: "Aptos",
    symbol: "APT",
    nativeAssetSymbol: "APT",
    color: "#000000",
    icon: aptosLogo,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    networks: Object.freeze(["mainnet"]),
    defaultNetwork: "mainnet",
    addressLabel: "Aptos Address",
    supportsDestinationTag: false,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://explorer.aptos.dev/txn/",
        addressBaseUrl: "https://explorer.aptos.dev/account/",
        querySuffix: "",
      },
      testnet: {
        transactionBaseUrl: "https://explorer.aptos.dev/txn/",
        addressBaseUrl: "https://explorer.aptos.dev/account/",
        querySuffix: "?network=testnet",
      },
    },
  },
  // ---------------------------------------------------------------------------
  // Arbitrum — EVM-compatible L2 (same address format / capabilities as ETH,
  // Polygon, AVAX). Added here through the central registry only; no component
  // changes are required.
  // ---------------------------------------------------------------------------
  arbitrum: {
    id: "arbitrum",
    code: "arbitrum",
    name: "Arbitrum",
    label: "Arbitrum",
    symbol: "ETH",
    nativeAssetSymbol: "ETH",
    color: "#12AAFF",
    icon: arbitrumLogo,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    networks: Object.freeze(["mainnet"]),
    defaultNetwork: "mainnet",
    addressLabel: "Arbitrum Address",
    decimals: 18,
    baseUnitName: "wei",
    supportsDestinationTag: false,
    supportsMemo: false,
    supportsSend: true,
    supportsReceive: true,
    explorer: {
      mainnet: {
        transactionBaseUrl: "https://arbiscan.io/tx/",
        addressBaseUrl: "https://arbiscan.io/address/",
        querySuffix: "",
      },
    },
  },
};

const TOKEN_REGISTRY = Object.freeze({
  arbitrum: Object.freeze({
    arb: Object.freeze({
      id: "arbitrum:arb",
      code: "arb",
      asset: "ARB",
      symbol: "ARB",
      name: "Arbitrum",
      label: "Arbitrum",
      color: "#12AAFF",
      icon: arbitrumLogo,
      standard: "erc20",
      contractAddress: "0x912CE59144191C1204E64559FE8253a0e49E6548",
    }),
  }),
  tron: Object.freeze({
    usdt: Object.freeze({
      id: "tron:usdt",
      code: "usdt",
      asset: "USDT",
      symbol: "USDT",
      name: "Tether USD",
      label: "Tether USD",
      color: "#26A17B",
      icon: usdtLogo,
      standard: "trc20",
      contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      fiatRateHint: 1,
    }),
  }),
});

function normalizeTokenCode(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTokenSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeContractAddress(value) {
  return String(value || "").trim();
}

function findRuntimeTokenMeta(chainId, tokenId, supportedChains = [], options = {}) {
  const normalizedChainId = normalizeChainCode(chainId);
  const normalizedTokenCode = normalizeTokenCode(tokenId);
  const normalizedTokenSymbol = normalizeTokenSymbol(tokenId);
  const normalizedContract = normalizeContractAddress(options.contractAddress);
  const runtimeChain = Array.isArray(supportedChains)
    ? supportedChains.find((item) => item?.code === normalizedChainId || item?.id === normalizedChainId)
    : null;
  const runtimeTokens = Array.isArray(runtimeChain?.tokens)
    ? runtimeChain.tokens
    : Array.isArray(runtimeChain?.assets)
      ? runtimeChain.assets.filter((item) => String(item?.assetType || "").toLowerCase() === "token")
      : [];

  return runtimeTokens.find((token) => {
    const tokenCode = normalizeTokenCode(token?.code || token?.asset || token?.symbol);
    const tokenSymbol = normalizeTokenSymbol(token?.asset || token?.symbol || token?.code);
    const tokenContract = normalizeContractAddress(token?.contractAddress);

    return (
      (normalizedContract && tokenContract && tokenContract === normalizedContract) ||
      (normalizedTokenCode && tokenCode === normalizedTokenCode) ||
      (normalizedTokenSymbol && tokenSymbol === normalizedTokenSymbol)
    );
  }) || null;
}

function normalizeRuntimeNetworks(item) {
  if (Array.isArray(item?.supportedNetworks) && item.supportedNetworks.length) {
    return item.supportedNetworks
      .map((network) =>
        typeof network === "string"
          ? { code: network, label: network }
          : {
            code: String(network?.code || "").toLowerCase(),
            label: network?.label || network?.code || "",
          },
      )
      .filter((network) => network.code);
  }

  if (Array.isArray(item?.networks) && item.networks.length) {
    return item.networks
      .map((network) => ({
        code: String(network?.code || network || "").toLowerCase(),
        label: network?.label || network?.code || network || "",
      }))
      .filter((network) => network.code);
  }

  return [];
}

function normalizeExplorerMap(explorer = {}, fallbackExplorer = {}, supportedNetworks = []) {
  const backendNetworks =
    explorer && typeof explorer === "object" && explorer.networks && typeof explorer.networks === "object"
      ? explorer.networks
      : {};
  const allowedNetworkCodes = new Set(
    (supportedNetworks || []).map((network) => String(network?.code || "").toLowerCase()).filter(Boolean),
  );
  const candidateNetworkCodes = allowedNetworkCodes.size
    ? Array.from(allowedNetworkCodes)
    : Object.keys(backendNetworks);

  const normalized = {};

  for (const networkCode of candidateNetworkCodes) {
    const fallbackEntry = fallbackExplorer?.[networkCode] || {};
    const backendEntry = backendNetworks[networkCode] || {};
    normalized[networkCode] = {
      transactionBaseUrl:
        backendEntry.transactionBaseUrl || fallbackEntry.transactionBaseUrl || "",
      addressBaseUrl: backendEntry.addressBaseUrl || fallbackEntry.addressBaseUrl || "",
      querySuffix: backendEntry.querySuffix || fallbackEntry.querySuffix || "",
    };
  }

  for (const [networkCode, backendEntry] of Object.entries(backendNetworks)) {
    if (normalized[networkCode]) {
      continue;
    }

    normalized[networkCode] = {
      transactionBaseUrl: backendEntry.transactionBaseUrl || "",
      addressBaseUrl: backendEntry.addressBaseUrl || "",
      querySuffix: backendEntry.querySuffix || "",
    };
  }

  return normalized;
}

export function mergeRuntimeChainMeta(item = {}) {
  const chainCode = normalizeChainCode(item?.code || item?.id);
  const localMeta = CHAIN_REGISTRY[chainCode] || null;
  const supportedNetworks = normalizeRuntimeNetworks(item);
  const resolvedNetworks = supportedNetworks;
  const runtimeNetworkCodes = resolvedNetworks.map((network) => network.code);
  const requestedDefaultNetwork = String(item?.defaultNetwork || "").toLowerCase();
  const explorer = normalizeExplorerMap(item?.explorer, localMeta?.explorer, resolvedNetworks);

  return {
    ...(localMeta || {}),
    ...item,
    id: chainCode || localMeta?.id || "unknown",
    code: chainCode || localMeta?.code || "unknown",
    name: item?.name || item?.label || localMeta?.name || chainCode.toUpperCase(),
    label: item?.label || localMeta?.label || item?.name || chainCode.toUpperCase(),
    symbol:
      item?.nativeAssetSymbol || item?.symbol || item?.currency || localMeta?.symbol || chainCode.toUpperCase(),
    nativeAssetSymbol:
      item?.nativeAssetSymbol || item?.symbol || localMeta?.nativeAssetSymbol || chainCode.toUpperCase(),
    color: localMeta?.color || "#4F46E5",
    icon: localMeta?.icon || null,
    supportedNetworks: resolvedNetworks,
    networks: runtimeNetworkCodes,
    defaultNetwork: runtimeNetworkCodes.includes(requestedDefaultNetwork)
      ? requestedDefaultNetwork
      : runtimeNetworkCodes[0] || "",
    addressLabel: localMeta?.addressLabel || "Address",
    decimals: Number(item?.decimals ?? localMeta?.decimals ?? 0) || 0,
    baseUnitName: item?.baseUnitName || localMeta?.baseUnitName || "",
    supportsDestinationTag:
      Boolean(item?.addressExtras?.destinationTag) || Boolean(localMeta?.supportsDestinationTag),
    supportsMemo: Boolean(item?.features?.supportsMemo ?? item?.supportsMemo ?? localMeta?.supportsMemo),
    supportsSend: Boolean(item?.features?.supportsSend ?? item?.supportsSend ?? localMeta?.supportsSend),
    supportsReceive: Boolean(item?.features?.supportsReceive ?? item?.supportsReceive ?? localMeta?.supportsReceive),
    explorer,
  };
}

export function getChainMeta(chainId, supportedChains = []) {
  const normalizedChainId = normalizeChainCode(chainId);
  const runtimeMeta = Array.isArray(supportedChains)
    ? supportedChains.find((item) => item.code === normalizedChainId || item.id === normalizedChainId)
    : null;

  if (runtimeMeta) {
    return mergeRuntimeChainMeta(runtimeMeta);
  }

  const localMeta = CHAIN_REGISTRY[normalizedChainId] || null;

  return (
    localMeta || {
      id: normalizedChainId || "unknown",
      code: normalizedChainId || "unknown",
      name: String(chainId || "Unknown").toUpperCase(),
      label: String(chainId || "Unknown").toUpperCase(),
      symbol: String(chainId || "Unknown").toUpperCase(),
      nativeAssetSymbol: String(chainId || "Unknown").toUpperCase(),
      color: "#888888",
      icon: null,
      supportedNetworks: EMPTY_NETWORKS,
      networks: EMPTY_NETWORKS,
      defaultNetwork: "",
      addressLabel: "Address",
      decimals: 0,
      baseUnitName: "",
      supportsDestinationTag: false,
      supportsMemo: false,
      supportsSend: false,
      supportsReceive: false,
      explorer: {},
    }
  );
}

export function getTokenMeta(chainId, tokenId, supportedChains = [], options = {}) {
  const normalizedChainId = normalizeChainCode(chainId);
  const localTokenMeta = Object.values(TOKEN_REGISTRY[normalizedChainId] || {}).find((token) => {
    const tokenCode = normalizeTokenCode(token?.code || token?.asset || token?.symbol);
    const tokenSymbol = normalizeTokenSymbol(token?.asset || token?.symbol || token?.code);
    const tokenContract = normalizeContractAddress(token?.contractAddress);
    const requestedContract = normalizeContractAddress(options.contractAddress);
    const requestedCode = normalizeTokenCode(tokenId);
    const requestedSymbol = normalizeTokenSymbol(tokenId);

    return (
      (requestedContract && tokenContract && tokenContract === requestedContract) ||
      (requestedCode && tokenCode === requestedCode) ||
      (requestedSymbol && tokenSymbol === requestedSymbol)
    );
  }) || null;
  const runtimeTokenMeta = findRuntimeTokenMeta(chainId, tokenId, supportedChains, options);
  const mergedTokenMeta = {
    ...(runtimeTokenMeta || {}),
    ...(localTokenMeta || {}),
  };
  const resolvedSymbol = normalizeTokenSymbol(
    mergedTokenMeta.asset || mergedTokenMeta.symbol || mergedTokenMeta.code || tokenId,
  );
  const resolvedCode = normalizeTokenCode(
    mergedTokenMeta.code || mergedTokenMeta.asset || mergedTokenMeta.symbol || tokenId,
  );
  const resolvedContractAddress =
    normalizeContractAddress(mergedTokenMeta.contractAddress) ||
    normalizeContractAddress(options.contractAddress);

  if (!resolvedSymbol && !resolvedCode && !resolvedContractAddress) {
    return null;
  }

  return {
    ...mergedTokenMeta,
    id: mergedTokenMeta.id || `${normalizedChainId}:${resolvedCode || resolvedSymbol.toLowerCase()}`,
    code: resolvedCode,
    asset: resolvedSymbol,
    symbol: resolvedSymbol,
    name:
      mergedTokenMeta.name ||
      mergedTokenMeta.label ||
      resolvedSymbol ||
      normalizeTokenSymbol(tokenId),
    label:
      mergedTokenMeta.label ||
      mergedTokenMeta.name ||
      resolvedSymbol ||
      normalizeTokenSymbol(tokenId),
    color: mergedTokenMeta.color || "#26A17B",
    icon: mergedTokenMeta.icon || null,
    standard: String(mergedTokenMeta.standard || "").toLowerCase(),
    contractAddress: resolvedContractAddress || null,
    fiatRateHint: Number(mergedTokenMeta.fiatRateHint) || 0,
  };
}

export function getNetworkOptions(chainMeta) {
  if (!chainMeta) {
    return EMPTY_NETWORKS;
  }

  if (Array.isArray(chainMeta.supportedNetworks) && chainMeta.supportedNetworks.length) {
    return chainMeta.supportedNetworks;
  }

  if (Array.isArray(chainMeta.networks) && chainMeta.networks.length) {
    return chainMeta.networks.map((network) => ({
      code: network,
      label: network,
    }));
  }

  return EMPTY_NETWORKS;
}

export function getNetworkLabel(chainMeta, networkCode) {
  const normalizedNetworkCode = String(networkCode || "").toLowerCase();
  const network = getNetworkOptions(chainMeta).find((item) => item.code === normalizedNetworkCode);

  return network?.label || networkCode || "";
}

export function buildExplorerTransactionUrl(chainMeta, networkCode, transactionHash) {
  if (!chainMeta || !transactionHash) {
    return "";
  }

  const explorer = chainMeta.explorer?.[String(networkCode || "").toLowerCase()];
  if (!explorer?.transactionBaseUrl) {
    return "";
  }

  return `${explorer.transactionBaseUrl}${transactionHash}${explorer.querySuffix || ""}`;
}

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_REGISTRY);
