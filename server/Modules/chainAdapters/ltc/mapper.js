const amount = require("./amount");

function normalizeInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number"
        ? String(Math.trunc(value))
        : String(value).trim();

  return /^\d+$/.test(normalized) ? normalized : null;
}

function normalizeTimestamp(value) {
  if (!value && value !== 0) {
    return undefined;
  }

  const timestamp = new Date(Number(value) * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function serializeValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]),
    );
  }

  return value;
}

function getOutputAddress(output = {}) {
  return String(output.scriptpubkey_address || output.address || "").trim();
}

function getPrevoutAddress(input = {}) {
  return String(input.prevout?.scriptpubkey_address || "").trim();
}

function sumOutputValues(outputs = [], predicate) {
  return outputs.reduce((total, output) => {
    const value = normalizeInteger(output.value);
    if (!value || !predicate(output)) {
      return total;
    }

    return total + BigInt(value);
  }, 0n);
}

function resolveDirection(raw = {}, walletAddress) {
  const targetAddress = String(walletAddress || "").trim().toLowerCase();
  const inputs = Array.isArray(raw.vin) ? raw.vin : [];
  const outputs = Array.isArray(raw.vout) ? raw.vout : [];
  const spendsFromWallet = inputs.some(
    (input) => getPrevoutAddress(input).toLowerCase() === targetAddress,
  );
  const paysToWallet = outputs.some(
    (output) => getOutputAddress(output).toLowerCase() === targetAddress,
  );

  if (spendsFromWallet) {
    return "outgoing";
  }

  if (paysToWallet) {
    return "incoming";
  }

  return null;
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    const txHash = String(raw.txid || raw.txHash || "").trim();
    const direction = resolveDirection(raw, walletAddress);
    const targetAddress = String(walletAddress || "").trim().toLowerCase();
    const inputs = Array.isArray(raw.vin) ? raw.vin : [];
    const outputs = Array.isArray(raw.vout) ? raw.vout : [];

    if (!txHash || !direction) {
      return null;
    }

    const totalToWalletBaseUnits = sumOutputValues(
      outputs,
      (output) => getOutputAddress(output).toLowerCase() === targetAddress,
    );
    const totalToOthersBaseUnits = sumOutputValues(
      outputs,
      (output) => {
        const outputAddress = getOutputAddress(output).toLowerCase();
        return outputAddress && outputAddress !== targetAddress;
      },
    );

    let amountBaseUnits = "0";
    if (direction === "incoming") {
      amountBaseUnits = totalToWalletBaseUnits.toString();
    } else if (totalToOthersBaseUnits > 0n) {
      amountBaseUnits = totalToOthersBaseUnits.toString();
    } else {
      return null;
    }

    const primaryInputAddress = String(
      getPrevoutAddress(inputs[0]) || raw.fromAddress || "",
    ).trim();
    const primaryExternalOutput = outputs.find((output) => {
      const outputAddress = getOutputAddress(output).toLowerCase();
      return outputAddress && outputAddress !== targetAddress;
    });
    const toAddress = direction === "incoming"
      ? String(walletAddress || "").trim()
      : String(getOutputAddress(primaryExternalOutput) || raw.toAddress || "").trim();
    const chainTimestamp = normalizeTimestamp(raw.status?.block_time);
    const validated = raw.status?.confirmed === true;
    const confirmations = validated
      ? Math.max(
          Number(raw.tipHeight || 0) - Number(raw.status?.block_height || 0) + 1,
          1,
        )
      : 0;
    const networkFeeBaseUnits = normalizeInteger(raw.fee) || "0";

    return {
      tx: serializeValue(raw),
      meta: serializeValue(raw.status || {}),
      txHash,
      amount: amount.fromBaseUnits(amountBaseUnits),
      amountBaseUnits,
      direction,
      fromAddress: primaryInputAddress,
      toAddress,
      validated,
      confirmations,
      network: raw.network || undefined,
      networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
      networkFeeBaseUnits,
      executionParams: {},
      chainStatus: validated ? "confirmed" : "pending",
      succeeded: validated,
      ledgerIndex: validated ? Number(raw.status?.block_height || 0) || undefined : undefined,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },
};
