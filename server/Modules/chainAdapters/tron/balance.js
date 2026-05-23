const client = require("./client");
const wallet = require("./wallet");
const { listEnabledTokens } = require("../../../config/tokens");

const TRC20_BALANCE_OF_ABI = [
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

function buildCanonicalBalance({
  baseUnitBalance = "0",
  availableBaseUnits = "0",
  rentExemptMinimumBaseUnits = "0",
  exists = false,
  confirmed = false,
  tokenBalances = [],
  raw = {},
} = {}) {
  return {
    baseUnitBalance: String(baseUnitBalance),
    availableBaseUnits: String(availableBaseUnits),
    rentExemptMinimumBaseUnits: String(rentExemptMinimumBaseUnits),
    exists: Boolean(exists),
    confirmed: Boolean(confirmed),
    tokenBalances: Array.isArray(tokenBalances) ? tokenBalances : [],
    raw: raw && typeof raw === "object" ? raw : {},
  };
}

function buildCanonicalTokenBalance({
  token,
  address,
  network,
  blockNumber,
  status = "available",
  baseUnitBalance = "0",
  availableBaseUnits = "0",
  confirmed = false,
  raw = {},
  error = null,
} = {}) {
  return {
    code: token.code,
    asset: token.asset,
    currency: token.symbol,
    symbol: token.symbol,
    label: token.label,
    assetType: "token",
    standard: token.standard,
    contractAddress: token.contractAddress,
    decimals: token.decimals,
    baseUnitName: token.baseUnitName,
    metadata: token.metadata || {},
    status,
    exists: true,
    confirmed: Boolean(confirmed),
    baseUnitBalance: String(baseUnitBalance),
    availableBaseUnits: String(availableBaseUnits),
    raw: {
      address,
      network,
      blockNumber,
      contractAddress: token.contractAddress,
      ...(raw && typeof raw === "object" ? raw : {}),
    },
    ...(error ? { error: String(error) } : {}),
  };
}

function normalizeTokenBalanceValue(value) {
  const normalized = value && typeof value.toString === "function"
    ? value.toString()
    : String(value ?? "0");

  if (!/^\d+$/.test(normalized)) {
    throw new Error("TRC20 contract returned an invalid integer balance");
  }

  return normalized;
}

async function fetchTrc20TokenBalance({ tronClient, network, address, token, blockNumber }) {
  try {
    const contract = await client.withRpcRetry(
      network,
      `loading ${token.symbol} contract`,
      () => tronClient.contract(TRC20_BALANCE_OF_ABI, token.contractAddress),
    );
    const balanceResult = await client.withRpcRetry(
      network,
      `fetching ${token.symbol} balance`,
      () => contract.balanceOf(address).call({ from: address }),
    );
    const baseUnitBalance = normalizeTokenBalanceValue(balanceResult);

    return buildCanonicalTokenBalance({
      token,
      address,
      network,
      blockNumber,
      status: "available",
      baseUnitBalance,
      availableBaseUnits: baseUnitBalance,
      confirmed: Number.isFinite(blockNumber),
    });
  } catch (error) {
    return buildCanonicalTokenBalance({
      token,
      address,
      network,
      blockNumber,
      status: "unavailable",
      confirmed: false,
      raw: {
        reason: error instanceof Error ? error.message : String(error),
      },
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function fetchBalance(input) {
  const address = String(input.address || "").trim();

  if (!wallet.validateAddress(address)) {
    throw new Error("Failed to fetch TRON balance: invalid TRON address");
  }

  try {
    const { balance, network, fullHost, blockNumber, tokenBalances } =
      await client.withClientFallback(
        input.network,
        "fetching TRON balance",
        async ({ client: tronClient, network, fullHost, blockNumber }) => {
          const resolvedBalance = await client.withRpcRetry(
            network,
            "fetching TRON native balance",
            () => tronClient.trx.getBalance(address),
          );
          const tokenConfigs = listEnabledTokens("tron", network).filter(
            (token) =>
              token.standard === "trc20" &&
              token.features?.balance !== false &&
              token.toggles?.balanceEnabled !== false,
          );
          const resolvedTokenBalances = await Promise.all(
            tokenConfigs.map((token) =>
              fetchTrc20TokenBalance({
                tronClient,
                network,
                address,
                token,
                blockNumber,
              })),
          );

          return {
            balance: resolvedBalance,
            network,
            fullHost,
            blockNumber,
            tokenBalances: resolvedTokenBalances,
          };
        },
      );

    return buildCanonicalBalance({
      baseUnitBalance: String(balance || 0),
      availableBaseUnits: String(balance || 0),
      rentExemptMinimumBaseUnits: "0",
      exists: true,
      confirmed: Number.isFinite(blockNumber),
      tokenBalances,
      raw: {
        address,
        network,
        fullHost,
        blockNumber,
        tokenCount: tokenBalances.length,
      },
    });
  } catch (error) {
    throw new Error(`Failed to fetch TRON balance: ${error.message}`);
  }
}

module.exports = {
  fetchBalance,
};
