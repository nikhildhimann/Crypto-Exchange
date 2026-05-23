const amount = require("./amount");

const RIPPLE_EPOCH_OFFSET_MS = 946684800000;

function normalizeIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function normalizeRippleTimestamp(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const timestamp = new Date(RIPPLE_EPOCH_OFFSET_MS + value * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function resolveChainTimestamp(raw = {}, txJson = {}) {
  return (
    normalizeIsoTimestamp(raw.close_time_iso) ||
    normalizeRippleTimestamp(
      typeof txJson.date === "number"
        ? txJson.date
        : typeof raw.date === "number"
          ? raw.date
          : undefined,
    )
  );
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    const txJson = raw.tx_json && typeof raw.tx_json === "object" ? raw.tx_json : raw.tx;
    const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : undefined;
    const validated =
      raw.validated === true ||
      (typeof raw.ledger_index === "number" && Number.isFinite(raw.ledger_index)) ||
      typeof raw.close_time_iso === "string";

    if (!txJson || txJson.TransactionType !== "Payment") {
      return null;
    }

    const amountBaseUnits =
      typeof meta?.delivered_amount === "string"
        ? meta.delivered_amount
        : typeof txJson.Amount === "string"
          ? txJson.Amount
          : typeof txJson.DeliverMax === "string"
            ? txJson.DeliverMax
            : null;

    if (!amountBaseUnits) {
      return null;
    }

    const txHash =
      (typeof txJson.hash === "string" ? txJson.hash : undefined) ||
      (typeof raw.hash === "string" ? raw.hash : undefined);
    const fromAddress = String(txJson.Account || "");
    const toAddress = String(txJson.Destination || "");
    const direction =
      toAddress === walletAddress ? "incoming" : fromAddress === walletAddress ? "outgoing" : null;

    if (!direction || !txHash) {
      return null;
    }

    const chainTimestamp = resolveChainTimestamp(raw, txJson);

    return {
      tx: txJson,
      meta,
      txHash,
      amount: amount.fromBaseUnits(String(amountBaseUnits)),
      amountBaseUnits,
      direction,
      fromAddress,
      toAddress,
      validated,
      networkFee: typeof txJson.Fee === "string" ? amount.fromBaseUnits(String(txJson.Fee)) : "0",
      networkFeeBaseUnits: typeof txJson.Fee === "string" ? String(txJson.Fee) : "0",
      executionParams:
        typeof txJson.DestinationTag === "number"
          ? { destinationTag: txJson.DestinationTag }
          : {},
      chainStatus:
        typeof meta?.TransactionResult === "string"
          ? meta.TransactionResult
          : validated
            ? "tesSUCCESS"
            : "pending",
      succeeded:
        (typeof meta?.TransactionResult === "string"
          ? meta.TransactionResult
          : validated
            ? "tesSUCCESS"
            : "pending") === "tesSUCCESS",
      ledgerIndex: typeof raw.ledger_index === "number" ? raw.ledger_index : undefined,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },
};
