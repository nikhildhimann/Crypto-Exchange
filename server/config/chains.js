const CHAIN_CODE_ALIASES = Object.freeze({
  hbar: Object.freeze(["hedera"]),
});

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeChainCode(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized === "hedera") {
    return "hbar";
  }

  return normalized;
}

function getChainMatchCodes(chainCode) {
  const canonicalCode = normalizeChainCode(chainCode);
  const aliases = CHAIN_CODE_ALIASES[canonicalCode] || [];

  return Array.from(
    new Set(
      [canonicalCode, ...aliases]
        .filter(Boolean)
        .flatMap((code) => {
          const normalized = normalizeString(code);
          if (!normalized) {
            return [];
          }

          const lower = normalized.toLowerCase();
          const upper = normalized.toUpperCase();

          return lower === upper ? [normalized] : [lower, upper];
        }),
    ),
  );
}

const DEFAULT_CHAIN = normalizeChainCode(process.env.DEFAULT_CHAIN || "");
const MAINNET_ONLY = process.env.MAINNET_ONLY !== "false";
const MAINNET_NETWORK_CODE = "mainnet";
const HTTP_URL_PATTERN = /^(https?:\/\/)/;
const HTTP_OR_WS_URL_PATTERN = /^(https?:\/\/|wss?:\/\/)/;
const WS_URL_PATTERN = /^(wss?:\/\/)/;

function normalizeHttpUrl(value) {
  const normalized = normalizeString(value);
  return HTTP_URL_PATTERN.test(normalized) ? normalized : "";
}

function ensureTrailingSlash(value) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return "";
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function resolveExplorerBaseUrl(envName, fallback) {
  return ensureTrailingSlash(normalizeHttpUrl(process.env[envName]) || fallback);
}

const CHAIN_FEATURE_KEYS = Object.freeze([
  "create",
  "import",
  "send",
  "receive",
  "qr",
  "explorer",
  "history",
  "internalTransfer",
]);

const CHAIN_TOGGLE_KEYS = Object.freeze([
  "enabled",
  "sendEnabled",
  "receiveEnabled",
  "importEnabled",
  "createEnabled",
  "maintenance",
]);

const DEFAULT_CHAIN_FEATURES = Object.freeze({
  create: true,
  import: true,
  send: true,
  receive: true,
  qr: true,
  explorer: false,
  history: true,
  internalTransfer: true,
});

const DEFAULT_CHAIN_TOGGLES = Object.freeze({
  enabled: true,
  sendEnabled: true,
  receiveEnabled: true,
  importEnabled: true,
  createEnabled: true,
  maintenance: false,
});

const BASE_CHAIN_CONFIG = Object.freeze({
  xrp: Object.freeze({
    code: "xrp",
    family: "xrp",
    label: "XRP",
    nativeAssetSymbol: "XRP",
    defaultNetwork: "testnet",
    decimals: 6,
    baseUnitName: "drop",
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
      Object.freeze({ code: "testnet", label: "Testnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: true,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://livenet.xrpl.org/accounts/",
          transactionBaseUrl: "https://livenet.xrpl.org/transactions/",
        }),
        testnet: Object.freeze({
          addressBaseUrl: "https://testnet.xrpl.org/accounts/",
          transactionBaseUrl: "https://testnet.xrpl.org/transactions/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["testnet", "mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "XRPL_DEFAULT_NETWORK",
          description: "Default XRP network",
          pattern: /^(mainnet|testnet)$/i,
          default: "testnet",
        }),
        Object.freeze({
          name: "XRPL_MAINNET_URL",
          description: "XRP mainnet RPC URL",
          pattern: WS_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "XRPL_TESTNET_URL",
          description: "XRP testnet RPC URL",
          pattern: WS_URL_PATTERN,
          networks: Object.freeze(["testnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),

  solana: Object.freeze({
    code: "solana",
    family: "solana",
    label: "Solana",
    nativeAssetSymbol: "SOL",
    defaultNetwork: "testnet",
    decimals: 9,
    baseUnitName: "lamports",
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
      Object.freeze({ code: "testnet", label: "Testnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://explorer.solana.com/address/",
          transactionBaseUrl: "https://explorer.solana.com/tx/",
          querySuffix: "",
        }),
        testnet: Object.freeze({
          addressBaseUrl: "https://explorer.solana.com/address/",
          transactionBaseUrl: "https://explorer.solana.com/tx/",
          querySuffix: "?cluster=testnet",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["testnet", "mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "SOLANA_DEFAULT_NETWORK",
          description: "Default Solana network",
          pattern: /^(mainnet|testnet)$/i,
          default: "testnet",
        }),
        Object.freeze({
          name: "SOLANA_MAINNET_URL",
          description: "Solana mainnet RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "SOLANA_TESTNET_URL",
          description: "Solana testnet RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["testnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  bnb: Object.freeze({
    code: "bnb",
    family: "evm",
    label: "BNB Smart Chain",
    nativeAssetSymbol: "BNB",
    defaultNetwork: "mainnet",
    decimals: 18,
    baseUnitName: "wei",
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://bscscan.com/address/",
          transactionBaseUrl: "https://bscscan.com/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "BNB_RPC_HTTP",
          description: "BNB Smart Chain HTTP RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "BNB_RPC_WSS",
          description: "BNB Smart Chain WebSocket RPC URL",
          pattern: WS_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "BNB_CHAIN_ID",
          description: "BNB chain ID",
          pattern: /^\d+$/,
          default: "56",
          networks: Object.freeze(["mainnet"]),
          productionValidator: "chainId:56",
        }),
      ]),
    }),
    enabled: true,
  }),
  avax: Object.freeze({
    code: "avax",
    family: "evm",
    label: "Avalanche C-Chain",
    nativeAssetSymbol: "AVAX",
    defaultNetwork: "mainnet",
    decimals: 18,
    baseUnitName: "wei",
    create: true,
    import: true,
    send: true,
    receive: true,
    qr: true,
    history: true,
    internalTransfer: false,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://snowtrace.io/address/",
          transactionBaseUrl: "https://snowtrace.io/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "AVAX_RPC_HTTP",
          description: "Avalanche C-Chain HTTP RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "AVAX_RPC_WSS",
          description: "Avalanche C-Chain WebSocket RPC URL",
          pattern: WS_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "AVAX_CHAIN_ID",
          description: "Avalanche C-Chain chain ID",
          pattern: /^\d+$/,
          default: "43114",
          networks: Object.freeze(["mainnet"]),
          productionValidator: "chainId:43114",
        }),
        Object.freeze({
          name: "AVAX_EXPLORER_API_URL",
          description: "Avalanche explorer/data API base URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "AVAX_EXPLORER_API_KEY",
          description: "Avalanche explorer/data API key",
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  polygon: Object.freeze({
    code: "polygon",
    family: "evm",
    label: "Polygon",
    // No existing Polygon-native symbol assumptions exist in this codebase, so
    // expose the current native ticker as POL rather than introducing legacy MATIC by default.
    nativeAssetSymbol: "POL",
    defaultNetwork: "mainnet",
    decimals: 18,
    baseUnitName: "wei",
    send: true,
    internalTransfer: false,
    history: true,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://polygonscan.com/address/",
          transactionBaseUrl: "https://polygonscan.com/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "POLYGON_RPC_HTTP",
          description: "Polygon HTTP RPC URL",
          pattern: HTTP_URL_PATTERN,
          validate: (value) => {
            const normalized = String(value || "")
              .trim()
              .toLowerCase();

            if (
              normalized.includes("your-polygon-mainnet-rpc") ||
              normalized.includes("replace-with") ||
              normalized.includes("example.com")
            ) {
              return "POLYGON_RPC_HTTP must be set to a real Polygon mainnet RPC URL";
            }

            return null;
          },
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "POLYGON_RPC_WSS",
          description: "Polygon WebSocket RPC URL",
          pattern: WS_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "POLYGON_CHAIN_ID",
          description: "Polygon chain ID",
          pattern: /^\d+$/,
          default: "137",
          networks: Object.freeze(["mainnet"]),
          productionValidator: "chainId:137",
        }),
        Object.freeze({
          name: "POLYGON_EXPLORER_API_URL",
          description: "Polygon explorer API URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "POLYGON_EXPLORER_API_KEY",
          description: "Polygon explorer API key",
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  eth: Object.freeze({
    code: "eth",
    family: "evm",
    label: "Ethereum",
    nativeAssetSymbol: "ETH",
    defaultNetwork: "mainnet",
    decimals: 18,
    baseUnitName: "wei",
    send: true,
    internalTransfer: false,
    history: true,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://etherscan.io/address/",
          transactionBaseUrl: "https://etherscan.io/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "ETH_RPC_HTTP",
          description: "Ethereum HTTP RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "ETH_RPC_HTTP_FALLBACKS",
          description:
            "Optional comma-separated Ethereum HTTP RPC fallback URLs",
          optional: true,
          pattern: /^(https?:\/\/[^,\s]+)(\s*,\s*https?:\/\/[^,\s]+)*$/,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "ETH_RPC_WSS",
          description: "Ethereum WebSocket RPC URL",
          pattern: WS_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "ETH_CHAIN_ID",
          description: "Ethereum chain ID",
          pattern: /^\d+$/,
          default: "1",
          networks: Object.freeze(["mainnet"]),
          productionValidator: "chainId:1",
        }),
        Object.freeze({
          name: "ETH_EXPLORER_API_URL",
          description: "Ethereum explorer API URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "ETH_EXPLORER_API_KEY",
          description: "Ethereum explorer API key",
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
    arbitrum: Object.freeze({
    code: "arbitrum",
    family: "evm",
    label: "Arbitrum",
    nativeAssetSymbol: "ETH",
    defaultNetwork: "mainnet",
    decimals: 18,
    baseUnitName: "wei",
    send: true,
    internalTransfer: false,
    history: true,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://arbiscan.io/address/",
          transactionBaseUrl: "https://arbiscan.io/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "ARBITRUM_RPC_HTTP",
          description: "Arbitrum HTTP RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "ARBITRUM_RPC_WSS",
          description: "Arbitrum WebSocket RPC URL",
          pattern: WS_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "ARBITRUM_CHAIN_ID",
          description: "Arbitrum chain ID",
          pattern: /^\d+$/,
          default: "42161",
          networks: Object.freeze(["mainnet"]),
          productionValidator: "chainId:42161",
        }),
        Object.freeze({
          name: "ARBITRUM_EXPLORER_API_URL",
          description: "Arbitrum explorer API URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "ARBITRUM_EXPLORER_API_KEY",
          description: "Arbitrum explorer API key",
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  btc: Object.freeze({
    code: "btc",
    family: "bitcoin",
    label: "Bitcoin",
    nativeAssetSymbol: "BTC",
    defaultNetwork: "mainnet",
    decimals: 8,
    baseUnitName: "satoshi",
    send: true,
    receive: true,
    history: true,
    internalTransfer: false,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
      Object.freeze({ code: "testnet", label: "Testnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://blockstream.info/address/",
          transactionBaseUrl: "https://blockstream.info/tx/",
        }),
        testnet: Object.freeze({
          addressBaseUrl: "https://blockstream.info/testnet/address/",
          transactionBaseUrl: "https://blockstream.info/testnet/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet", "testnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "BTC_DEFAULT_NETWORK",
          description: "Default Bitcoin network",
          pattern: /^(mainnet|testnet)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "BTC_MAINNET_API_URL",
          description: "Bitcoin mainnet API URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "BTC_TESTNET_API_URL",
          description: "Bitcoin testnet API URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["testnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  ada: Object.freeze({
    code: "ada",
    family: "cardano",
    label: "Cardano",
    nativeAssetSymbol: "ADA",
    defaultNetwork: "mainnet",
    decimals: 6,
    baseUnitName: "lovelace",
    send: true,
    receive: true,
    history: true,
    internalTransfer: false,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
      Object.freeze({ code: "preprod", label: "Preprod" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://cexplorer.io/address/",
          transactionBaseUrl: "https://cexplorer.io/tx/",
        }),
        preprod: Object.freeze({
          addressBaseUrl: "https://preprod.cexplorer.io/address/",
          transactionBaseUrl: "https://preprod.cexplorer.io/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet", "preprod"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "ADA_DEFAULT_NETWORK",
          description: "Default Cardano network",
          pattern: /^(mainnet|preprod)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "ADA_MAINNET_API_URL",
          description: "Cardano mainnet API URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "ADA_MAINNET_PROJECT_ID",
          description: "Cardano mainnet provider project ID",
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "ADA_PREPROD_API_URL",
          description: "Cardano preprod API URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["preprod"]),
        }),
        Object.freeze({
          name: "ADA_PREPROD_PROJECT_ID",
          description: "Cardano preprod provider project ID",
          networks: Object.freeze(["preprod"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  ltc: Object.freeze({
    code: "ltc",
    family: "btc",
    label: "Litecoin",
    nativeAssetSymbol: "LTC",
    defaultNetwork: "mainnet",
    decimals: 8,
    baseUnitName: "litoshi",
    send: true,
    history: true,
    internalTransfer: false,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://litecoinspace.org/address/",
          transactionBaseUrl: "https://litecoinspace.org/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "LTC_DEFAULT_NETWORK",
          description: "Default Litecoin network",
          pattern: /^(mainnet)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "LTC_MAINNET_API_URL",
          description: "Litecoin mainnet API URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
      ]),
    }),
    enabled: true,
  }),
  sui: Object.freeze({
    code: "sui",
    family: "sui",
    label: "Sui",
    nativeAssetSymbol: "SUI",
    defaultNetwork: "mainnet",
    decimals: 9,
    baseUnitName: "mist",
    send: true,
    history: true,
    internalTransfer: false,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://explorer.sui.io/address/",
          transactionBaseUrl: "https://explorer.sui.io/txblock/",
          querySuffix: "?network=mainnet",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "SUI_DEFAULT_NETWORK",
          description: "Default Sui network",
          pattern: /^(mainnet)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "SUI_MAINNET_RPC_URL",
          description: "Sui mainnet fullnode RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
      ]),
    }),
    enabled: true,
  }),
  aptos: Object.freeze({
    code: "aptos",
    family: "aptos",
    label: "Aptos",
    nativeAssetSymbol: "APT",
    defaultNetwork: "mainnet",
    decimals: 8,
    baseUnitName: "octa",
    send: true,
    history: true,
    internalTransfer: true,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
      Object.freeze({ code: "testnet", label: "Testnet" }),
      Object.freeze({ code: "devnet", label: "Devnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: resolveExplorerBaseUrl(
            "APTOS_MAINNET_EXPLORER_ADDRESS_BASE_URL",
            "https://explorer.aptoslabs.com/account/",
          ),
          transactionBaseUrl: resolveExplorerBaseUrl(
            "APTOS_MAINNET_EXPLORER_TRANSACTION_BASE_URL",
            "https://explorer.aptoslabs.com/txn/",
          ),
          querySuffix: "",
        }),
        testnet: Object.freeze({
          addressBaseUrl: resolveExplorerBaseUrl(
            "APTOS_TESTNET_EXPLORER_ADDRESS_BASE_URL",
            "https://explorer.aptoslabs.com/account/",
          ),
          transactionBaseUrl: resolveExplorerBaseUrl(
            "APTOS_TESTNET_EXPLORER_TRANSACTION_BASE_URL",
            "https://explorer.aptoslabs.com/txn/",
          ),
          querySuffix: "?network=testnet",
        }),
        devnet: Object.freeze({
          addressBaseUrl: resolveExplorerBaseUrl(
            "APTOS_DEVNET_EXPLORER_ADDRESS_BASE_URL",
            "https://explorer.aptoslabs.com/account/",
          ),
          transactionBaseUrl: resolveExplorerBaseUrl(
            "APTOS_DEVNET_EXPLORER_TRANSACTION_BASE_URL",
            "https://explorer.aptoslabs.com/txn/",
          ),
          querySuffix: "?network=devnet",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      autoProvisionImport: true,
      networks: Object.freeze(["mainnet", "testnet", "devnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "APTOS_DEFAULT_NETWORK",
          description: "Default Aptos network",
          pattern: /^(mainnet|testnet|devnet)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "APTOS_MAINNET_URL",
          description: "Aptos mainnet fullnode URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "APTOS_TESTNET_URL",
          description: "Aptos testnet fullnode URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["testnet"]),
        }),
        Object.freeze({
          name: "APTOS_DEVNET_URL",
          description: "Aptos devnet fullnode URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["devnet"]),
        }),
        Object.freeze({
          name: "APTOS_MAINNET_EXPLORER_ADDRESS_BASE_URL",
          description: "Optional Aptos mainnet explorer address base URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          default: "https://explorer.aptoslabs.com/account/",
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "APTOS_MAINNET_EXPLORER_TRANSACTION_BASE_URL",
          description: "Optional Aptos mainnet explorer transaction base URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          default: "https://explorer.aptoslabs.com/txn/",
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "APTOS_TESTNET_EXPLORER_ADDRESS_BASE_URL",
          description: "Optional Aptos testnet explorer address base URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          default: "https://explorer.aptoslabs.com/account/",
          networks: Object.freeze(["testnet"]),
        }),
        Object.freeze({
          name: "APTOS_TESTNET_EXPLORER_TRANSACTION_BASE_URL",
          description: "Optional Aptos testnet explorer transaction base URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          default: "https://explorer.aptoslabs.com/txn/",
          networks: Object.freeze(["testnet"]),
        }),
        Object.freeze({
          name: "APTOS_DEVNET_EXPLORER_ADDRESS_BASE_URL",
          description: "Optional Aptos devnet explorer address base URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          default: "https://explorer.aptoslabs.com/account/",
          networks: Object.freeze(["devnet"]),
        }),
        Object.freeze({
          name: "APTOS_DEVNET_EXPLORER_TRANSACTION_BASE_URL",
          description: "Optional Aptos devnet explorer transaction base URL",
          pattern: HTTP_URL_PATTERN,
          optional: true,
          default: "https://explorer.aptoslabs.com/txn/",
          networks: Object.freeze(["devnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  ton: Object.freeze({
    code: "ton",
    family: "ton",
    label: "Toncoin",
    nativeAssetSymbol: "TON",
    defaultNetwork: "mainnet",
    decimals: 9,
    baseUnitName: "nanoton",
    send: true,
    history: true,
    internalTransfer: false,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://tonviewer.com/",
          transactionBaseUrl: "https://tonviewer.com/transaction/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "TON_DEFAULT_NETWORK",
          description: "Default TON network",
          pattern: /^(mainnet)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "TON_MAINNET_RPC_URL",
          description: "TON mainnet RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "TON_MAINNET_API_KEY",
          description: "Optional TON mainnet RPC API key",
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  xtz: Object.freeze({
    code: "xtz",
    family: "tezos",
    label: "Tezos",
    nativeAssetSymbol: "XTZ",
    defaultNetwork: "mainnet",
    decimals: 6,
    baseUnitName: "mutez",
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
      Object.freeze({ code: "ghostnet", label: "Ghostnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://tzkt.io/",
          transactionBaseUrl: "https://tzkt.io/",
        }),
        ghostnet: Object.freeze({
          addressBaseUrl: "https://ghostnet.tzkt.io/",
          transactionBaseUrl: "https://ghostnet.tzkt.io/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet", "ghostnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "XTZ_DEFAULT_NETWORK",
          description: "Default Tezos network",
          pattern: /^(mainnet|ghostnet)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "XTZ_MAINNET_RPC_URL",
          description: "Tezos mainnet RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "XTZ_GHOSTNET_RPC_URL",
          description: "Tezos Ghostnet RPC URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["ghostnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  hbar: Object.freeze({
    code: "hbar",
    family: "hedera",
    label: "Hedera",
    nativeAssetSymbol: "HBAR",
    defaultNetwork: "mainnet",
    decimals: 8,
    baseUnitName: "tinybar",
    send: true,
    receive: true,
    history: true,
    internalTransfer: false,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
      Object.freeze({ code: "testnet", label: "Testnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: true,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://hashscan.io/mainnet/account/",
          transactionBaseUrl: "https://hashscan.io/mainnet/transaction/",
        }),
        testnet: Object.freeze({
          addressBaseUrl: "https://hashscan.io/testnet/account/",
          transactionBaseUrl: "https://hashscan.io/testnet/transaction/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: false,
      autoProvisionImport: true,
      networks: Object.freeze(["mainnet", "testnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "HBAR_DEFAULT_NETWORK",
          description: "Default Hedera network",
          pattern: /^(mainnet|testnet)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "HBAR_MAINNET_MIRROR_API_URL",
          description: "Hedera mainnet mirror node API URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "HBAR_TESTNET_MIRROR_API_URL",
          description: "Hedera testnet mirror node API URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["testnet"]),
        }),
        Object.freeze({
          name: "HBAR_MAINNET_OPERATOR_ID",
          description: "Hedera mainnet operator account ID",
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "HBAR_MAINNET_OPERATOR_KEY",
          description: "Hedera mainnet operator private key",
          optional: true,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "HBAR_TESTNET_OPERATOR_ID",
          description: "Hedera testnet operator account ID",
          optional: true,
          networks: Object.freeze(["testnet"]),
        }),
        Object.freeze({
          name: "HBAR_TESTNET_OPERATOR_KEY",
          description: "Hedera testnet operator private key",
          optional: true,
          networks: Object.freeze(["testnet"]),
        }),
        Object.freeze({
          name: "HBAR_ACCOUNT_CREATE_INITIAL_BALANCE",
          description:
            "Initial HBAR balance to fund newly created Hedera accounts",
          pattern: /^\d+(\.\d+)?$/,
          optional: true,
          networks: Object.freeze(["mainnet", "testnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  tron: Object.freeze({
    code: "tron",
    family: "tron",
    label: "Tron",
    nativeAssetSymbol: "TRX",
    defaultNetwork: "mainnet",
    decimals: 6,
    baseUnitName: "sun",
    send: true,
    history: true,
    internalTransfer: false,
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
      Object.freeze({ code: "testnet", label: "Testnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://tronscan.org/#/address/",
          transactionBaseUrl: "https://tronscan.org/#/transaction/",
        }),
        testnet: Object.freeze({
          addressBaseUrl: "https://nile.tronscan.org/#/address/",
          transactionBaseUrl: "https://nile.tronscan.org/#/transaction/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet", "testnet"]),
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "TRON_DEFAULT_NETWORK",
          description: "Default TRON network",
          pattern: /^(mainnet|testnet)$/i,
          default: "mainnet",
        }),
        Object.freeze({
          name: "TRON_MAINNET_URL",
          description: "TRON mainnet full node URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
          productionValidator: "mainnetUrl",
        }),
        Object.freeze({
          name: "TRON_MAINNET_FALLBACKS",
          description:
            "Optional comma-separated TRON mainnet fallback RPC URLs",
          optional: true,
          pattern: /^(https?:\/\/[^,\s]+)(\s*,\s*https?:\/\/[^,\s]+)*$/,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "TRON_TESTNET_URL",
          description: "TRON testnet full node URL",
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["testnet"]),
        }),
        Object.freeze({
          name: "TRON_TESTNET_FALLBACKS",
          description:
            "Optional comma-separated TRON testnet fallback RPC URLs",
          optional: true,
          pattern: /^(https?:\/\/[^,\s]+)(\s*,\s*https?:\/\/[^,\s]+)*$/,
          networks: Object.freeze(["testnet"]),
        }),
        Object.freeze({
          name: "TRON_API_KEY",
          description: "Optional TRON provider API key",
          optional: true,
          networks: Object.freeze(["mainnet", "testnet"]),
        }),
        Object.freeze({
          name: "TRON_EXPLORER_API_URL",
          description: "Optional TRON explorer API URL for history sync",
          optional: true,
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "TRON_TRC20_EXPLORER_API_URL",
          description: "Optional TRON TRC20 explorer API URL for history sync",
          optional: true,
          pattern: HTTP_URL_PATTERN,
          networks: Object.freeze(["mainnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
  doge: Object.freeze({
    code: "doge",
    family: "bitcoin",
    label: "Dogecoin",
    nativeAssetSymbol: "DOGE",
    defaultNetwork: "mainnet",
    decimals: 8,
    baseUnitName: "koinu",
    supportedNetworks: Object.freeze([
      Object.freeze({ code: "mainnet", label: "Mainnet" }),
    ]),
    addressExtras: Object.freeze({
      destinationTag: false,
      memo: false,
      extraParams: Object.freeze([]),
    }),
    explorer: Object.freeze({
      supported: true,
      networks: Object.freeze({
        mainnet: Object.freeze({
          addressBaseUrl: "https://dogechain.info/address/",
          transactionBaseUrl: "https://dogechain.info/tx/",
        }),
      }),
    }),
    provisioning: Object.freeze({
      autoProvision: true,
      networks: Object.freeze(["mainnet"]),
    }),
    features: Object.freeze({
      create: true,
      import: true,
      send: true,
      receive: true,
      qr: true,
      explorer: true,
      history: true,
      internalTransfer: false,
    }),
    toggles: Object.freeze({
      enabled: false,
      sendEnabled: true,
      receiveEnabled: true,
      importEnabled: true,
      createEnabled: true,
      maintenance: false,
    }),
    env: Object.freeze({
      vars: Object.freeze([
        Object.freeze({
          name: "DOGE_RPC_URL",
          description: "Dogecoin Core JSON-RPC URL",
          pattern: /^(https?:\/\/)/,
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "DOGE_RPC_USERNAME",
          description: "Dogecoin Core RPC username",
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "DOGE_RPC_PASSWORD",
          description: "Dogecoin Core RPC password",
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "DOGE_DEFAULT_FEE_PER_KB",
          description: "Dogecoin default fee in DOGE per KB",
          pattern: /^\d+(\.\d+)?$/,
          default: "0.01",
          networks: Object.freeze(["mainnet"]),
        }),
        Object.freeze({
          name: "DOGE_DUST_LIMIT",
          description: "Dogecoin dust threshold in DOGE",
          pattern: /^\d+(\.\d+)?$/,
          default: "0.01",
          networks: Object.freeze(["mainnet"]),
        }),
      ]),
    }),
    enabled: true,
  }),
});

function normalizeNetworkCode(networkCode) {
  if (networkCode === undefined || networkCode === null || networkCode === "") {
    return "";
  }

  return String(networkCode).toLowerCase();
}

function pickObjectKeys(source = {}, keys = []) {
  return keys.reduce((result, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }

    return result;
  }, {});
}

function toBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return Boolean(value);
}

function normalizeFeatureMap(input = {}, derived = {}) {
  return Object.freeze({
    ...DEFAULT_CHAIN_FEATURES,
    ...(input && typeof input === "object" ? input : {}),
    ...derived,
  });
}

function normalizeToggleMap(input = {}, fallbackEnabled = true) {
  const merged = {
    ...DEFAULT_CHAIN_TOGGLES,
    ...(input && typeof input === "object" ? input : {}),
  };

  return Object.freeze({
    enabled: toBoolean(merged.enabled, fallbackEnabled),
    sendEnabled: toBoolean(merged.sendEnabled, true),
    receiveEnabled: toBoolean(merged.receiveEnabled, true),
    importEnabled: toBoolean(merged.importEnabled, true),
    createEnabled: toBoolean(merged.createEnabled, true),
    maintenance: toBoolean(merged.maintenance, false),
  });
}

function mergeNetworkToggles(chainToggles, networkToggles = {}) {
  return Object.freeze({
    enabled: Boolean(
      chainToggles.enabled && toBoolean(networkToggles.enabled, true),
    ),
    sendEnabled: Boolean(
      chainToggles.sendEnabled && toBoolean(networkToggles.sendEnabled, true),
    ),
    receiveEnabled: Boolean(
      chainToggles.receiveEnabled &&
      toBoolean(networkToggles.receiveEnabled, true),
    ),
    importEnabled: Boolean(
      chainToggles.importEnabled &&
      toBoolean(networkToggles.importEnabled, true),
    ),
    createEnabled: Boolean(
      chainToggles.createEnabled &&
      toBoolean(networkToggles.createEnabled, true),
    ),
    maintenance: Boolean(
      chainToggles.maintenance || toBoolean(networkToggles.maintenance, false),
    ),
  });
}

function normalizeSupportedNetworks(baseChain, chainFeatures, chainToggles) {
  const supportedNetworks = Array.isArray(baseChain.supportedNetworks)
    ? baseChain.supportedNetworks
    : [];

  return Object.freeze(
    supportedNetworks
      .map((network) => {
        const rawNetwork =
          network && typeof network === "object" ? network : { code: network };
        const code = normalizeNetworkCode(rawNetwork.code);

        if (!code) {
          return null;
        }

        const networkFeatures = {
          ...pickObjectKeys(rawNetwork, CHAIN_FEATURE_KEYS),
          ...(rawNetwork.features && typeof rawNetwork.features === "object"
            ? rawNetwork.features
            : {}),
        };
        const networkToggles = mergeNetworkToggles(chainToggles, {
          ...pickObjectKeys(rawNetwork, CHAIN_TOGGLE_KEYS),
          ...(rawNetwork.toggles && typeof rawNetwork.toggles === "object"
            ? rawNetwork.toggles
            : {}),
        });

        return Object.freeze({
          ...rawNetwork,
          code,
          label: rawNetwork.label || code,
          features: Object.freeze({
            ...chainFeatures,
            ...networkFeatures,
          }),
          toggles: networkToggles,
          enabled: networkToggles.enabled,
          maintenance: networkToggles.maintenance,
        });
      })
      .filter(Boolean),
  );
}

function filterRuntimeNetworks(supportedNetworks = []) {
  const enabledNetworks = supportedNetworks.filter(
    (network) => network?.enabled,
  );

  if (!MAINNET_ONLY) {
    return enabledNetworks;
  }

  return enabledNetworks.filter(
    (network) => network.code === MAINNET_NETWORK_CODE,
  );
}

function filterProvisioningNetworks(provisioning, runtimeNetworks) {
  const requestedNetworks = Array.isArray(provisioning?.networks)
    ? provisioning.networks
    : Array.isArray(provisioning?.targets)
      ? provisioning.targets.map((target) =>
          target && typeof target === "object"
            ? target.network || target.code
            : target,
        )
      : runtimeNetworks.map((network) => network.code);
  const runtimeNetworkCodes = new Set(
    runtimeNetworks.map((network) => network.code),
  );

  return requestedNetworks
    .map((network) => normalizeNetworkCode(network))
    .filter((network) => runtimeNetworkCodes.has(network));
}

function normalizeProvisioningTargets(
  chainCode,
  provisioning,
  supportedNetworks = [],
) {
  const supportedNetworkCodes = new Set(
    supportedNetworks.map((network) => network.code),
  );
  const configuredTargets =
    Array.isArray(provisioning?.targets) && provisioning.targets.length
      ? provisioning.targets
      : Array.isArray(provisioning?.networks) && provisioning.networks.length
        ? provisioning.networks
        : supportedNetworks.map((network) => ({ network: network.code }));

  return Object.freeze(
    configuredTargets
      .map((entry, index) => {
        const rawEntry =
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? entry
            : { network: entry };
        const network = normalizeNetworkCode(
          rawEntry.network || rawEntry.code || rawEntry.target,
        );

        if (!network || !supportedNetworkCodes.has(network)) {
          return null;
        }

        const priority = Number(rawEntry.priority);

        return Object.freeze({
          chain: normalizeNetworkCode(rawEntry.chain) || chainCode,
          network,
          priority: Number.isFinite(priority) ? priority : index,
          enabled: rawEntry.enabled !== false,
        });
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        return a.network.localeCompare(b.network);
      }),
  );
}

function filterProvisioningTargets(
  provisioningTargets = [],
  runtimeNetworks = [],
) {
  const runtimeNetworkCodes = new Set(
    runtimeNetworks.map((network) => network.code),
  );

  return Object.freeze(
    provisioningTargets.filter(
      (target) =>
        target?.enabled !== false && runtimeNetworkCodes.has(target.network),
    ),
  );
}

function filterExplorerNetworks(explorer, supportedNetworks = []) {
  if (!explorer || typeof explorer !== "object") {
    return Object.freeze({
      supported: false,
      networks: Object.freeze({}),
    });
  }

  const allowedNetworkCodes = new Set(
    supportedNetworks
      .filter((network) => network?.features?.explorer !== false)
      .map((network) => network.code),
  );
  const rawNetworks =
    explorer.networks && typeof explorer.networks === "object"
      ? explorer.networks
      : {};
  const filteredNetworks = Object.freeze(
    Object.fromEntries(
      Object.entries(rawNetworks).filter(([networkCode]) =>
        allowedNetworkCodes.has(normalizeNetworkCode(networkCode)),
      ),
    ),
  );

  return Object.freeze({
    ...explorer,
    supported:
      Boolean(explorer.supported) && Object.keys(filteredNetworks).length > 0,
    networks: filteredNetworks,
  });
}

function resolveDefaultNetwork(chain, supportedNetworks = []) {
  const requestedDefault = normalizeNetworkCode(chain.defaultNetwork);
  const supportedCodes = supportedNetworks.map((network) => network.code);

  if (supportedCodes.includes(requestedDefault)) {
    return requestedDefault;
  }

  if (supportedCodes.includes(MAINNET_NETWORK_CODE)) {
    return MAINNET_NETWORK_CODE;
  }

  return supportedCodes[0] || "";
}

function createConfiguredChainConfig(baseChain) {
  const chainFeatureOverrides = {
    ...pickObjectKeys(baseChain, CHAIN_FEATURE_KEYS),
    ...(baseChain.features && typeof baseChain.features === "object"
      ? baseChain.features
      : {}),
  };
  const chainToggleOverrides = {
    ...pickObjectKeys(baseChain, CHAIN_TOGGLE_KEYS),
    ...(baseChain.toggles && typeof baseChain.toggles === "object"
      ? baseChain.toggles
      : {}),
  };
  const chainFeatures = normalizeFeatureMap(chainFeatureOverrides, {
    explorer:
      chainFeatureOverrides.explorer !== undefined
        ? Boolean(chainFeatureOverrides.explorer)
        : Boolean(baseChain.explorer?.supported),
  });
  const chainToggles = normalizeToggleMap(
    chainToggleOverrides,
    baseChain.enabled !== false,
  );
  const supportedNetworks = normalizeSupportedNetworks(
    baseChain,
    chainFeatures,
    chainToggles,
  );

  return Object.freeze({
    ...baseChain,
    code: normalizeNetworkCode(baseChain.code) || "",
    enabled: chainToggles.enabled,
    maintenance: chainToggles.maintenance,
    features: chainFeatures,
    toggles: chainToggles,
    supportedNetworks,
    explorer: filterExplorerNetworks(baseChain.explorer, supportedNetworks),
    provisioning: Object.freeze({
      ...(baseChain.provisioning || {}),
      autoProvision: baseChain.provisioning?.autoProvision !== false,
      priority: Number(baseChain.provisioning?.priority) || 0,
      networks: filterProvisioningNetworks(
        baseChain.provisioning,
        supportedNetworks,
      ),
      targets: normalizeProvisioningTargets(
        baseChain.code,
        baseChain.provisioning,
        supportedNetworks,
      ),
    }),
    defaultNetwork: resolveDefaultNetwork(baseChain, supportedNetworks),
  });
}

function createRuntimeChainConfig(configuredChain) {
  const runtimeNetworks = Object.freeze(
    filterRuntimeNetworks(configuredChain.supportedNetworks),
  );

  return Object.freeze({
    ...configuredChain,
    supportedNetworks: runtimeNetworks,
    explorer: filterExplorerNetworks(configuredChain.explorer, runtimeNetworks),
    provisioning: Object.freeze({
      ...(configuredChain.provisioning || {}),
      networks: filterProvisioningNetworks(
        configuredChain.provisioning,
        runtimeNetworks,
      ),
      targets: filterProvisioningTargets(
        configuredChain.provisioning?.targets,
        runtimeNetworks,
      ),
    }),
    defaultNetwork: resolveDefaultNetwork(configuredChain, runtimeNetworks),
  });
}

const CONFIGURED_CHAIN_CONFIG = Object.freeze(
  Object.fromEntries(
    Object.entries(BASE_CHAIN_CONFIG).map(([code, chain]) => [
      code,
      createConfiguredChainConfig(chain),
    ]),
  ),
);

const RUNTIME_CHAIN_CONFIG = Object.freeze(
  Object.fromEntries(
    Object.entries(CONFIGURED_CHAIN_CONFIG).map(([code, chain]) => [
      code,
      createRuntimeChainConfig(chain),
    ]),
  ),
);

function listConfiguredChains() {
  return Object.values(CONFIGURED_CHAIN_CONFIG);
}

function getConfiguredChainConfig(chainCode = DEFAULT_CHAIN) {
  return CONFIGURED_CHAIN_CONFIG[normalizeChainCode(chainCode)] || null;
}

function listEnabledChains() {
  return Object.values(RUNTIME_CHAIN_CONFIG).filter(
    (chain) => chain.toggles.enabled && chain.supportedNetworks.length > 0,
  );
}

function getEnabledChains() {
  return listEnabledChains();
}

function getDefaultChain() {
  const normalizedDefault = normalizeNetworkCode(DEFAULT_CHAIN);

  if (listEnabledChains().some((chain) => chain.code === normalizedDefault)) {
    return normalizedDefault;
  }

  if (listEnabledChains().some((chain) => chain.code === "xrp")) {
    return "xrp";
  }

  return listEnabledChains()[0]?.code || normalizedDefault || "xrp";
}

function getChainConfig(chainCode = getDefaultChain()) {
  return RUNTIME_CHAIN_CONFIG[normalizeChainCode(chainCode)] || null;
}

function getBaseChainConfig(chainCode = getDefaultChain()) {
  return BASE_CHAIN_CONFIG[normalizeChainCode(chainCode)] || null;
}

function getConfiguredChainCodes() {
  return listConfiguredChains().map((chain) => chain.code);
}

function getEnabledChainCodes() {
  return listEnabledChains().map((chain) => chain.code);
}

function getSupportedChainCodes() {
  return getEnabledChainCodes();
}

function getConfiguredNetworkCodes(chainCode) {
  if (chainCode) {
    return (
      getConfiguredChainConfig(chainCode)?.supportedNetworks.map(
        (network) => network.code,
      ) || []
    );
  }

  return Array.from(
    new Set(
      listConfiguredChains().flatMap((chain) =>
        chain.supportedNetworks.map((network) => network.code),
      ),
    ),
  );
}

function getEnabledNetworks(chainCode = getDefaultChain()) {
  const chain = getChainConfig(chainCode);
  if (!chain || !chain.toggles.enabled) {
    return [];
  }

  return chain.supportedNetworks;
}

function getEnabledNetworksForChain(chainCode = getDefaultChain()) {
  return getEnabledNetworks(chainCode);
}

function getChainNetworkCodes(chainCode = getDefaultChain()) {
  return getEnabledNetworks(chainCode).map((network) => network.code);
}

function getBaseChainNetworkCodes(chainCode = getDefaultChain()) {
  return getConfiguredNetworkCodes(chainCode);
}

function getSupportedNetworkCodes() {
  return Array.from(
    new Set(
      listEnabledChains().flatMap((chain) =>
        chain.supportedNetworks.map((network) => network.code),
      ),
    ),
  );
}

function getNetworkConfig(chainCode, networkCode) {
  const normalizedNetwork = normalizeNetworkCode(networkCode);
  if (!normalizedNetwork) {
    return null;
  }

  return (
    getChainConfig(chainCode)?.supportedNetworks.find(
      (network) => network.code === normalizedNetwork,
    ) || null
  );
}

function getConfiguredNetworkConfig(chainCode, networkCode) {
  const normalizedNetwork = normalizeNetworkCode(networkCode);
  if (!normalizedNetwork) {
    return null;
  }

  return (
    getConfiguredChainConfig(chainCode)?.supportedNetworks.find(
      (network) => network.code === normalizedNetwork,
    ) || null
  );
}

function getChainProvisioningConfig(chainCode = getDefaultChain()) {
  const chain = getChainConfig(chainCode);
  if (!chain || !chain.toggles.enabled) {
    return {
      autoProvision: false,
      networks: [],
    };
  }

  return {
    autoProvision: chain.provisioning?.autoProvision !== false,
    autoProvisionImport: chain.provisioning?.autoProvisionImport === true,
    priority: Number(chain.provisioning?.priority) || 0,
    networks: Array.isArray(chain.provisioning?.networks)
      ? [...chain.provisioning.networks]
      : getChainNetworkCodes(chain.code),
    targets: Array.isArray(chain.provisioning?.targets)
      ? chain.provisioning.targets.map((target) => ({ ...target }))
      : [],
  };
}

function getChainEnvironmentConfig(chainCode = getDefaultChain()) {
  const configuredChain = getConfiguredChainConfig(chainCode);
  return configuredChain?.env || { vars: [] };
}

function getDefaultNetworkForChain(chainCode = getDefaultChain()) {
  return getChainConfig(chainCode)?.defaultNetwork || "";
}

function isChainConfigured(chainCode) {
  return Boolean(getConfiguredChainConfig(chainCode));
}

function isChainEnabled(chainCode) {
  const chain = getChainConfig(chainCode);
  return Boolean(chain?.toggles?.enabled && chain.supportedNetworks.length > 0);
}

function isSupportedChain(chainCode) {
  return isChainEnabled(chainCode);
}

function isNetworkEnabled(chainCode, networkCode) {
  const normalizedNetwork = normalizeNetworkCode(networkCode);
  if (!normalizedNetwork || !isChainEnabled(chainCode)) {
    return false;
  }

  return getChainNetworkCodes(chainCode).includes(normalizedNetwork);
}

function isSupportedNetworkForChain(chainCode, networkCode) {
  return isNetworkEnabled(chainCode, networkCode);
}

function isKnownNetworkForChain(chainCode, networkCode) {
  const normalizedNetwork = normalizeNetworkCode(networkCode);
  if (!normalizedNetwork) {
    return false;
  }

  return getConfiguredNetworkCodes(chainCode).includes(normalizedNetwork);
}

function getChainFeatures(chainCode, networkCode) {
  const chain = getChainConfig(chainCode);
  if (!chain) {
    return null;
  }

  if (!networkCode) {
    return chain.features;
  }

  const network = getNetworkConfig(chain.code, networkCode);
  return network ? network.features : null;
}

function getChainToggles(chainCode, networkCode) {
  const chain = getChainConfig(chainCode);
  if (!chain) {
    return null;
  }

  if (!networkCode) {
    return chain.toggles;
  }

  const network = getNetworkConfig(chain.code, networkCode);
  return network ? network.toggles : null;
}

function getRuntimeChainNetworkPairs() {
  return listEnabledChains().flatMap((chain) =>
    chain.supportedNetworks.map((network) => ({
      chain: chain.code,
      network: network.code,
    })),
  );
}

function buildRuntimeChainNetworkFilter({
  chainField = "chain",
  networkField = "network",
} = {}) {
  const pairs = getRuntimeChainNetworkPairs();
  if (!pairs.length) {
    return {
      [chainField]: { $exists: false },
      [networkField]: { $exists: false },
    };
  }

  return {
    $or: pairs.map((pair) => ({
      [chainField]: { $in: getChainMatchCodes(pair.chain) },
      [networkField]: pair.network,
    })),
  };
}

function assertSupportedChain(chainCode) {
  const configuredChain = getConfiguredChainConfig(chainCode);
  if (!configuredChain) {
    const configured = getConfiguredChainCodes().join(", ");
    throw new Error(
      `Unsupported chain "${chainCode}". Configured chains: ${configured}`,
    );
  }

  const chain = getChainConfig(chainCode);
  if (
    !chain ||
    !chain.toggles.enabled ||
    chain.supportedNetworks.length === 0
  ) {
    const enabled = getEnabledChainCodes().join(", ");
    throw new Error(
      `Chain "${configuredChain.code}" is currently disabled. Enabled chains: ${enabled}`,
    );
  }

  return chain;
}

function assertSupportedChainNetwork(chainCode, networkCode) {
  const chain = assertSupportedChain(chainCode);
  const normalizedNetwork =
    normalizeNetworkCode(networkCode) || chain.defaultNetwork;

  if (!isSupportedNetworkForChain(chain.code, normalizedNetwork)) {
    const supportedNetworks = getChainNetworkCodes(chain.code).join(", ");
    const knownButDisabled = isKnownNetworkForChain(
      chain.code,
      normalizedNetwork,
    );
    const message = knownButDisabled
      ? `Network "${normalizedNetwork}" is currently disabled for chain "${chain.code}". Allowed networks: ${supportedNetworks}`
      : `Unsupported network "${normalizedNetwork}" for chain "${chain.code}". Allowed networks: ${supportedNetworks}`;

    throw new Error(message);
  }

  return {
    ...chain,
    network: normalizedNetwork,
  };
}

module.exports = {
  MAINNET_ONLY,
  MAINNET_NETWORK_CODE,
  defaultChain: getDefaultChain(),
  supportedChains: listEnabledChains(),
  chainConfig: RUNTIME_CHAIN_CONFIG,
  baseChainConfig: BASE_CHAIN_CONFIG,
  configuredChainConfig: CONFIGURED_CHAIN_CONFIG,
  getDefaultChain,
  getChainConfig,
  getConfiguredChainConfig,
  getBaseChainConfig,
  listConfiguredChains,
  listEnabledChains,
  getEnabledChains,
  getConfiguredChainCodes,
  getEnabledChainCodes,
  getSupportedChainCodes,
  getConfiguredNetworkCodes,
  getEnabledNetworks,
  getEnabledNetworksForChain,
  getChainNetworkCodes,
  getBaseChainNetworkCodes,
  getSupportedNetworkCodes,
  getNetworkConfig,
  getConfiguredNetworkConfig,
  getChainProvisioningConfig,
  getChainEnvironmentConfig,
  getDefaultNetworkForChain,
  getChainFeatures,
  getChainToggles,
  getRuntimeChainNetworkPairs,
  buildRuntimeChainNetworkFilter,
  isChainConfigured,
  isChainEnabled,
  isSupportedChain,
  isNetworkEnabled,
  isSupportedNetworkForChain,
  isKnownNetworkForChain,
  assertSupportedChain,
  assertSupportedChainNetwork,
};
