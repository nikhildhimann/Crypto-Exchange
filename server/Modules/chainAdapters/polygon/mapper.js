const amount = require("./amount");
const {
  buildNftHistoryUniqueKey,
  normalizeNftContractAddress,
  normalizeNftStandard,
  normalizeNftTokenId,
} = require("../../nft/history.utils");

function serializeValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]),
    );
  }

  return value;
}

function normalizeTimestamp(value) {
  if (!value && value !== 0) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === "number") {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const timestamp = new Date(millis);
    return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") {
      return normalizeTimestamp(numeric);
    }

    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
  }

  return undefined;
}

function normalizeIntegerString(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number"
        ? String(Math.trunc(value))
        : String(value).trim();

  return /^-?\d+$/.test(normalized) ? normalized : null;
}

function resolveTransaction(raw = {}) {
  if (raw.transaction && typeof raw.transaction === "object") {
    return raw.transaction;
  }

  if (raw.tx && typeof raw.tx === "object") {
    return raw.tx;
  }

  return raw;
}

function resolveReceipt(raw = {}) {
  if (raw.receipt && typeof raw.receipt === "object") {
    return raw.receipt;
  }

  if (raw.meta && typeof raw.meta === "object") {
    return raw.meta;
  }

  return null;
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    const transaction = resolveTransaction(raw);
    const receipt = resolveReceipt(raw);
    const txHash =
      (typeof transaction.hash === "string" ? transaction.hash : undefined) ||
      (typeof receipt?.hash === "string" ? receipt.hash : undefined) ||
      (typeof raw.txHash === "string" ? raw.txHash : undefined);

    if (!txHash) {
      return null;
    }

    const fromAddress = String(transaction.from || receipt?.from || raw.fromAddress || "");
    const toAddress = String(transaction.to || receipt?.to || raw.toAddress || "");
    const direction =
      toAddress.toLowerCase() === String(walletAddress || "").toLowerCase()
        ? "incoming"
        : fromAddress.toLowerCase() === String(walletAddress || "").toLowerCase()
          ? "outgoing"
          : null;

    if (!direction) {
      return null;
    }

    const amountBaseUnits =
      normalizeIntegerString(raw.amountBaseUnits) ||
      normalizeIntegerString(transaction.value) ||
      null;
    if (!amountBaseUnits) {
      return null;
    }

    const gasUsed = normalizeIntegerString(receipt?.gasUsed);
    const effectiveGasPrice =
      normalizeIntegerString(receipt?.effectiveGasPrice) ||
      normalizeIntegerString(transaction.gasPrice) ||
      normalizeIntegerString(raw.gasPrice) ||
      "0";
    const networkFeeBaseUnits =
      gasUsed && effectiveGasPrice
        ? (BigInt(gasUsed) * BigInt(effectiveGasPrice)).toString()
        : normalizeIntegerString(raw.networkFeeBaseUnits) || "0";
    const validated =
      Boolean(raw.validated) ||
      typeof receipt?.blockNumber === "number" ||
      typeof transaction.blockNumber === "number";
    const statusValue =
      typeof receipt?.status === "number"
        ? receipt.status
        : typeof raw.status === "number"
          ? raw.status
          : undefined;
    const succeeded =
      typeof raw.succeeded === "boolean"
        ? raw.succeeded
        : statusValue === undefined
          ? validated
          : Number(statusValue) === 1;
    const confirmations =
      typeof raw.confirmations === "number"
        ? raw.confirmations
        : typeof transaction.confirmations === "number"
          ? transaction.confirmations
          : undefined;
    const chainTimestamp =
      normalizeTimestamp(raw.chainTimestamp) ||
      normalizeTimestamp(raw.timestamp) ||
      normalizeTimestamp(raw.blockTimestamp) ||
      normalizeTimestamp(raw.block?.timestamp);

    return {
      tx: serializeValue(transaction),
      meta: serializeValue(receipt || {}),
      txHash,
      amount: amount.fromBaseUnits(amountBaseUnits),
      amountBaseUnits,
      direction,
      fromAddress,
      toAddress,
      validated,
      network: raw.network || undefined,
      confirmations,
      networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
      networkFeeBaseUnits,
      executionParams:
        raw.executionParams && typeof raw.executionParams === "object"
          ? serializeValue(raw.executionParams)
          : {},
      chainStatus:
        typeof raw.chainStatus === "string"
          ? raw.chainStatus
          : validated
            ? succeeded
              ? "confirmed"
              : "failed"
            : "pending",
      succeeded,
      ledgerIndex:
        typeof receipt?.blockNumber === "number"
          ? receipt.blockNumber
          : typeof transaction.blockNumber === "number"
            ? transaction.blockNumber
            : undefined,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },

  mapNftTransaction(raw = {}, walletAddress) {
    const txHash = typeof raw.txHash === "string" ? raw.txHash : undefined;
    const contractAddress =
      typeof raw.contractAddress === "string" ? raw.contractAddress : undefined;
    const tokenId = typeof raw.tokenId === "string" ? raw.tokenId : undefined;
    const direction =
      typeof raw.direction === "string" ? raw.direction : undefined;

    if (!txHash || !contractAddress || !tokenId || !direction) {
      return null;
    }

    const normalizedStandard = normalizeNftStandard(raw.standard || "erc721");
    const normalizedContractAddress = normalizeNftContractAddress(
      contractAddress,
    );
    const normalizedTokenId = normalizeNftTokenId(tokenId);
    
    // Explicitly use the amount provided by the adapter instance without forcing "1"
    const transferAmount = normalizeIntegerString(raw.amount || raw.transferAmount) || "1";
    
    const historyUniqueKey = raw.historyUniqueKey || buildNftHistoryUniqueKey({
      txHash,
      contractAddress: normalizedContractAddress,
      tokenId: normalizedTokenId,
      direction,
      standard: normalizedStandard,
    });

    const fromAddress = typeof raw.fromAddress === "string" ? raw.fromAddress : "";
    const toAddress = typeof raw.toAddress === "string" ? raw.toAddress : "";
    const chainTimestamp = normalizeTimestamp(raw.chainTimestamp);
    const ledgerIndex =
      typeof raw.blockNum === "number" ? raw.blockNum : undefined;

    return {
      txHash,
      logIndex: raw.logIndex, // Preserve logIndex from the adapter
      fromAddress,
      toAddress,
      direction,
      amount: transferAmount,
      amountBaseUnits: transferAmount,
      asset: "NFT",
      currency: "NFT",
      assetType: "nft",
      standard: normalizedStandard,
      contractAddress: normalizedContractAddress,
      tokenId: normalizedTokenId,
      transferAmount,
      networkFee: "0",
      networkFeeBaseUnits: "0",
      networkFeeAsset: "POL",
      networkFeeCurrency: "POL",
      networkFeeAssetType: "native",
      validated: true,
      succeeded: true,
      chainStatus: "confirmed",
      confirmations: 0,
      ledgerIndex,
      chainTimestamp,
      confirmedAt: chainTimestamp,
      historyUniqueKey,
      metadata: {
        nft: {
          tokenId: normalizedTokenId,
          contractAddress: normalizedContractAddress,
          standard: normalizedStandard,
          collectionName: null,
          name: null,
          image: null,
          amount: transferAmount,
        },
      },
    };
  },
};
