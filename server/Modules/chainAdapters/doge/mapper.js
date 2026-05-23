const amount = require("./amount");

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

function normalizeAddress(value) {
  return String(value || "").trim();
}

function normalizeAddressSet(raw = {}, walletContext) {
  const values = new Set();

  if (Array.isArray(raw.walletAddresses)) {
    for (const entry of raw.walletAddresses) {
      const normalized = normalizeAddress(entry).toLowerCase();
      if (normalized) {
        values.add(normalized);
      }
    }
  }

  if (walletContext && typeof walletContext === "object" && !Array.isArray(walletContext)) {
    const fallbackAddress = normalizeAddress(walletContext.address).toLowerCase();
    if (fallbackAddress) {
      values.add(fallbackAddress);
    }
  } else {
    const fallbackAddress = normalizeAddress(walletContext).toLowerCase();
    if (fallbackAddress) {
      values.add(fallbackAddress);
    }
  }

  const rawWalletAddress = normalizeAddress(raw.walletAddress).toLowerCase();
  if (rawWalletAddress) {
    values.add(rawWalletAddress);
  }

  return values;
}

function normalizeDecimalString(value) {
  if (value === undefined || value === null || value === "") {
    return "0";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "0";
    }

    return value
      .toFixed(8)
      .replace(/\.?0+$/, "") || "0";
  }

  const normalized = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return normalized;
  }

  return "0";
}

function decimalToBaseUnits(value) {
  return amount.toBaseUnits(normalizeDecimalString(value).replace(/^-/, ""));
}

function normalizeTimestamp(value) {
  if (!value && value !== 0) {
    return undefined;
  }

  const timestamp = new Date(Number(value) * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function getOutputAddress(output = {}) {
  const direct =
    normalizeAddress(output.scriptpubkey_address) ||
    normalizeAddress(output.scriptPubKey?.address);

  if (direct) {
    return direct;
  }

  if (Array.isArray(output.scriptPubKey?.addresses)) {
    return normalizeAddress(output.scriptPubKey.addresses[0]);
  }

  return "";
}

function getPrevoutAddress(input = {}) {
  return normalizeAddress(
    input.prevout?.scriptpubkey_address ||
      input.prevout?.scriptPubKey?.address ||
      input.prevout?.scriptPubKey?.addresses?.[0],
  );
}

function resolveDirection(raw = {}, walletAddressSet) {
  const inputs = Array.isArray(raw.vin) ? raw.vin : [];
  const outputs = Array.isArray(raw.vout) ? raw.vout : [];
  const spendsFromWallet = inputs.some((input) =>
    walletAddressSet.has(getPrevoutAddress(input).toLowerCase()),
  );
  const paysToWallet = outputs.some((output) =>
    walletAddressSet.has(getOutputAddress(output).toLowerCase()),
  );

  if (spendsFromWallet) {
    return "outgoing";
  }

  if (paysToWallet) {
    return "incoming";
  }

  const category = String(
    raw.walletTransaction?.category || raw.category || "",
  ).trim().toLowerCase();

  if (category === "send") {
    return "outgoing";
  }

  if (["receive", "generate", "immature"].includes(category)) {
    return "incoming";
  }

  return null;
}

module.exports = {
  mapTransaction(raw = {}, walletContext) {
    const txHash = normalizeAddress(raw.txid || raw.txHash || raw.hash);
    if (!txHash) {
      return null;
    }

    const walletAddressSet = normalizeAddressSet(raw, walletContext);
    if (!walletAddressSet.size) {
      return null;
    }

    const direction = resolveDirection(raw, walletAddressSet);
    if (!direction) {
      return null;
    }

    const inputs = Array.isArray(raw.vin) ? raw.vin : [];
    const outputs = Array.isArray(raw.vout) ? raw.vout : [];
    const totalToWalletBaseUnits = outputs.reduce((total, output) => {
      const outputAddress = getOutputAddress(output).toLowerCase();
      if (!outputAddress || !walletAddressSet.has(outputAddress)) {
        return total;
      }

      const outputValue = output?.valueSat ?? decimalToBaseUnits(output?.value);
      return total + BigInt(String(outputValue || "0"));
    }, 0n);
    const totalToOthersBaseUnits = outputs.reduce((total, output) => {
      const outputAddress = getOutputAddress(output).toLowerCase();
      if (!outputAddress || walletAddressSet.has(outputAddress)) {
        return total;
      }

      const outputValue = output?.valueSat ?? decimalToBaseUnits(output?.value);
      return total + BigInt(String(outputValue || "0"));
    }, 0n);

    let amountBaseUnits = "0";
    if (direction === "incoming" && totalToWalletBaseUnits > 0n) {
      amountBaseUnits = totalToWalletBaseUnits.toString();
    } else if (direction === "outgoing" && totalToOthersBaseUnits > 0n) {
      amountBaseUnits = totalToOthersBaseUnits.toString();
    } else {
      const walletTransactionAmount = decimalToBaseUnits(
        raw.walletTransaction?.amount ?? raw.amount,
      );
      if (BigInt(walletTransactionAmount) <= 0n) {
        return null;
      }

      amountBaseUnits = walletTransactionAmount;
    }

    const primaryExternalInput = inputs.find((input) => {
      const inputAddress = getPrevoutAddress(input).toLowerCase();
      return inputAddress && !walletAddressSet.has(inputAddress);
    });
    const primaryExternalOutput = outputs.find((output) => {
      const outputAddress = getOutputAddress(output).toLowerCase();
      return outputAddress && !walletAddressSet.has(outputAddress);
    });
    const fallbackWalletAddress =
      walletContext && typeof walletContext === "object" && !Array.isArray(walletContext)
        ? normalizeAddress(walletContext.address)
        : normalizeAddress(walletContext || raw.walletAddress);
    const confirmations = Number(raw.confirmations || 0) || 0;
    const validated = confirmations > 0;
    const chainTimestamp = normalizeTimestamp(
      raw.blocktime ?? raw.time ?? raw.timereceived,
    );
    const networkFeeBaseUnits = decimalToBaseUnits(
      raw.walletTransaction?.fee ?? raw.fee,
    );

    return {
      tx: serializeValue(raw),
      meta: serializeValue(raw.walletTransaction || {}),
      txHash,
      amount: amount.fromBaseUnits(amountBaseUnits),
      amountBaseUnits,
      direction,
      fromAddress:
        direction === "incoming"
          ? normalizeAddress(
            primaryExternalInput?.prevout?.scriptpubkey_address ||
              primaryExternalInput?.prevout?.scriptPubKey?.address ||
              primaryExternalInput?.prevout?.scriptPubKey?.addresses?.[0] ||
              raw.fromAddress,
          )
          : fallbackWalletAddress,
      toAddress:
        direction === "incoming"
          ? fallbackWalletAddress
          : normalizeAddress(
            getOutputAddress(primaryExternalOutput) ||
              raw.walletTransaction?.address ||
              raw.toAddress,
          ),
      validated,
      confirmations,
      network: raw.network || undefined,
      networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
      networkFeeBaseUnits,
      executionParams: {},
      chainStatus: validated ? "confirmed" : "pending",
      succeeded: validated,
      ledgerIndex: Number(raw.blockheight || 0) || undefined,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },
};
