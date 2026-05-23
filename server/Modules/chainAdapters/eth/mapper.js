const amount = require("./amount");

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
};
