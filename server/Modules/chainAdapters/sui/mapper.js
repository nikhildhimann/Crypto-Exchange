const amount = require("./amount");
const wallet = require("./wallet");

const SUI_COIN_TYPE = "0x2::sui::SUI";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeAddressSet(raw = {}, walletAddress = "") {
  const values = new Set();

  const candidates = [
    walletAddress,
    raw.walletAddress,
    ...(Array.isArray(raw.walletAddresses) ? raw.walletAddresses : []),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOptionalAddress(candidate);
    if (normalized) {
      values.add(normalized);
    }
  }

  return values;
}

function normalizeOptionalAddress(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  try {
    return wallet.normalizeAddress(normalized);
  } catch (_error) {
    return "";
  }
}

function resolveBalanceOwner(balanceChange = {}) {
  const owner = balanceChange?.owner;

  if (typeof owner === "string") {
    return normalizeOptionalAddress(owner);
  }

  if (owner && typeof owner === "object") {
    if (typeof owner.AddressOwner === "string") {
      return normalizeOptionalAddress(owner.AddressOwner);
    }

    if (typeof owner.ObjectOwner === "string") {
      return normalizeOptionalAddress(owner.ObjectOwner);
    }
  }

  return "";
}

function normalizeNativeBalanceChanges(raw = {}) {
  return (Array.isArray(raw.balanceChanges) ? raw.balanceChanges : [])
    .map((entry, index) => ({
      owner: resolveBalanceOwner(entry),
      amount: BigInt(String(entry?.amount || "0")),
      coinType: normalizeString(entry?.coinType).toLowerCase(),
      index,
    }))
    .filter((entry) => entry.owner && entry.coinType === SUI_COIN_TYPE.toLowerCase());
}

function normalizeTimestamp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  const timestamp = new Date(parsed);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function computeNetworkFeeBaseUnits(raw = {}) {
  const gasUsed = raw.effects?.gasUsed || {};
  const computationCost = BigInt(String(gasUsed?.computationCost || "0"));
  const storageCost = BigInt(String(gasUsed?.storageCost || "0"));
  const storageRebate = BigInt(String(gasUsed?.storageRebate || "0"));

  return (computationCost + storageCost - storageRebate).toString();
}

function sortPositiveEntries(entries = []) {
  return [...entries].sort((left, right) => {
    if (left.amount !== right.amount) {
      return left.amount > right.amount ? -1 : 1;
    }

    return left.owner.localeCompare(right.owner);
  });
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    const txHash = normalizeString(raw.digest || raw.txHash);
    const walletAddressSet = normalizeAddressSet(raw, walletAddress);

    if (!txHash || !walletAddressSet.size) {
      return null;
    }

    const senderAddress = normalizeOptionalAddress(raw.transaction?.data?.sender || raw.sender);
    const nativeBalanceChanges = normalizeNativeBalanceChanges(raw);

    if (!nativeBalanceChanges.length) {
      return null;
    }

    const walletPositiveEntries = nativeBalanceChanges.filter(
      (entry) => walletAddressSet.has(entry.owner) && entry.amount > 0n,
    );
    const externalPositiveEntries = sortPositiveEntries(
      nativeBalanceChanges.filter(
        (entry) => !walletAddressSet.has(entry.owner) && entry.amount > 0n,
      ),
    );

    const walletPositiveTotal = walletPositiveEntries.reduce(
      (total, entry) => total + entry.amount,
      0n,
    );
    const outgoingAmountBaseUnits = externalPositiveEntries.reduce(
      (total, entry) => total + entry.amount,
      0n,
    ).toString();
    const incomingAmountBaseUnits = walletPositiveTotal.toString();

    let direction = null;
    let amountBaseUnits = "0";
    let fromAddress = senderAddress;
    let toAddress = normalizeOptionalAddress(walletAddress || raw.walletAddress);

    if (walletPositiveTotal > 0n && (!senderAddress || !walletAddressSet.has(senderAddress))) {
      direction = "incoming";
      amountBaseUnits = incomingAmountBaseUnits;
      fromAddress =
        normalizeOptionalAddress(
          nativeBalanceChanges.find(
            (entry) => !walletAddressSet.has(entry.owner) && entry.amount < 0n,
          )?.owner,
        ) || senderAddress;
      toAddress = normalizeOptionalAddress(walletAddress || raw.walletAddress);
    } else if (senderAddress && walletAddressSet.has(senderAddress) && externalPositiveEntries.length) {
      direction = "outgoing";
      amountBaseUnits = outgoingAmountBaseUnits;
      fromAddress = senderAddress;
      toAddress = externalPositiveEntries[0].owner;
    }

    if (!direction || BigInt(amountBaseUnits || "0") <= 0n) {
      return null;
    }

    const networkFeeBaseUnits = computeNetworkFeeBaseUnits(raw);
    const succeeded = normalizeString(raw.effects?.status?.status).toLowerCase() === "success";
    const chainTimestamp = normalizeTimestamp(raw.timestampMs);
    const validated = Boolean(raw.checkpoint || chainTimestamp || raw.effects?.status);

    return {
      tx: raw.transaction || raw,
      meta: {
        checkpoint: raw.checkpoint,
        digest: txHash,
        status: raw.effects?.status || null,
      },
      txHash,
      amount: amount.fromBaseUnits(amountBaseUnits),
      amountBaseUnits,
      direction,
      fromAddress,
      toAddress,
      validated,
      confirmations: validated ? 1 : 0,
      network: raw.network || undefined,
      networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
      networkFeeBaseUnits,
      executionParams: {},
      chainStatus: succeeded
        ? validated
          ? "confirmed"
          : "submitted"
        : "failed",
      succeeded,
      ledgerIndex: Number.isFinite(Number(raw.checkpoint))
        ? Number(raw.checkpoint)
        : undefined,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },
};
