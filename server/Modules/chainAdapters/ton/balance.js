const { AppError } = require("../../../helpers/errors");
const client = require("./client");
const wallet = require("./wallet");

function normalizeBaseUnitBalance(value) {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) ? normalized : "0";
}

function resolveExists(accountState, baseUnitBalance) {
  if (accountState === "active" || accountState === "frozen") {
    return true;
  }

  if (accountState === "uninitialized") {
    return BigInt(baseUnitBalance || "0") > 0n;
  }

  return BigInt(baseUnitBalance || "0") > 0n;
}

async function fetchBalance(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const address = wallet.normalizeAddress(input.address, normalizedNetwork);
  const addressFormats = wallet.getAddressFormats(address, normalizedNetwork);

  try {
    const response = await client.getClient(normalizedNetwork).getAddressInfo(address);
    const baseUnitBalance = normalizeBaseUnitBalance(response?.balance);
    const accountState = client.normalizeAccountState(response?.state);
    const exists = resolveExists(accountState, baseUnitBalance);

    return {
      exists,
      confirmed: true,
      baseUnitBalance,
      availableBaseUnits: baseUnitBalance,
      rentExemptMinimumBaseUnits: "0",
      tokenBalances: [],
      raw: {
        address: addressFormats.raw,
        displayAddress: addressFormats.display,
        bounceableAddress: addressFormats.bounceable,
        nonBounceableAddress: addressFormats.nonBounceable,
        network: normalizedNetwork,
        accountState,
        deployed: accountState === "active",
        initialized: accountState !== "uninitialized",
        hasBalance: BigInt(baseUnitBalance || "0") > 0n,
        sdkBalance: baseUnitBalance,
        lastTransactionLt: response?.lastTransaction?.lt || null,
        lastTransactionHash: response?.lastTransaction?.hash || null,
        blockSeqno:
          response?.blockId?.seqno === undefined || response?.blockId?.seqno === null
            ? null
            : Number(response.blockId.seqno),
        blockWorkchain:
          response?.blockId?.workchain === undefined || response?.blockId?.workchain === null
            ? null
            : Number(response.blockId.workchain),
        blockShard:
          response?.blockId?.shard === undefined || response?.blockId?.shard === null
            ? null
            : String(response.blockId.shard),
        timestamp:
          response?.timestamp === undefined || response?.timestamp === null
            ? null
            : Number(response.timestamp),
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to fetch TON balance", {
      status: 502,
      errors: {
        address: addressFormats.raw,
        network: normalizedNetwork,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

module.exports = {
  fetchBalance,
};
