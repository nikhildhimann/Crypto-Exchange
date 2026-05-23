const { Contract } = require("ethers");

const { listEnabledTokens } = require("../../../config/tokens");

const ERC20_BALANCE_OF_ABI = [
  {
    constant: true,
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

function buildCanonicalTokenBalance({
  token,
  address,
  network,
  blockNumber,
  rpcUrl,
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
      rpcUrl,
      contractAddress: token.contractAddress,
      ...(raw && typeof raw === "object" ? raw : {}),
    },
    ...(error ? { error: String(error) } : {}),
  };
}

function normalizeTokenBalanceValue(value) {
  const normalized =
    value && typeof value.toString === "function"
      ? value.toString()
      : String(value ?? "0");

  if (!/^\d+$/.test(normalized)) {
    throw new Error("ERC-20 contract returned an invalid integer balance");
  }

  return normalized;
}

async function fetchConfiguredErc20TokenBalance({
  provider,
  network,
  address,
  token,
  blockNumber,
  rpcUrl,
}) {
  try {
    const contract = new Contract(token.contractAddress, ERC20_BALANCE_OF_ABI, provider);
    const balanceResult = await contract.balanceOf(address);
    const baseUnitBalance = normalizeTokenBalanceValue(balanceResult);

    return buildCanonicalTokenBalance({
      token,
      address,
      network,
      blockNumber,
      rpcUrl,
      status: "available",
      baseUnitBalance,
      availableBaseUnits: baseUnitBalance,
      confirmed: Number.isInteger(blockNumber) && blockNumber >= 0,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return buildCanonicalTokenBalance({
      token,
      address,
      network,
      blockNumber,
      rpcUrl,
      status: "unavailable",
      confirmed: false,
      raw: {
        reason,
      },
      error: reason,
    });
  }
}

async function fetchConfiguredErc20TokenBalances({
  chain,
  network,
  provider,
  address,
  blockNumber,
  rpcUrl,
}) {
  const tokenConfigs = listEnabledTokens(chain, network).filter(
    (token) =>
      token.standard === "erc20" &&
      token.features?.balance !== false &&
      token.toggles?.balanceEnabled !== false,
  );

  return Promise.all(
    tokenConfigs.map((token) =>
      fetchConfiguredErc20TokenBalance({
        provider,
        network,
        address,
        token,
        blockNumber,
        rpcUrl,
      }),
    ),
  );
}

module.exports = {
  fetchConfiguredErc20TokenBalances,
};
