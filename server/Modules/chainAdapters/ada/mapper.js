const amount = require("./amount");
const { normalizeTxHash } = require("../../../common/utils/txHash");

function serializeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeValue(nested),
      ]),
    );
  }

  return value;
}

function normalizeAddress(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function extractAddressValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return String(value.address || value.value || "").trim();
  }

  return "";
}


function sumLovelace(outputs = []) {
  return outputs.reduce(
    (total, output) => total + BigInt(amount.resolveLovelaceBalance(output?.amount)),
    0n,
  );
}

function normalizeQuantity(value, fallback = "0") {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : fallback;
}

function normalizeWalletAddressSet(raw = {}, walletAddress = "") {
  const values = new Set();

  const candidateArrays = [
    raw.walletAddresses,
    raw.managedAddresses,
    raw.changeAddresses,
    raw.addressSet,
    raw.addresses,
  ];

  for (const arr of candidateArrays) {
    if (!Array.isArray(arr)) {
      continue;
    }

    for (const entry of arr) {
      const normalized = normalizeAddress(extractAddressValue(entry));
      if (normalized) {
        values.add(normalized);
      }
    }
  }

  const fallbacks = [walletAddress, raw.walletAddress, raw.address];

  for (const entry of fallbacks) {
    const normalized = normalizeAddress(entry);
    if (normalized) {
      values.add(normalized);
    }
  }

  return values;
}

function resolveDirection(inputs = [], outputs = [], walletAddressSet) {
  const spendsFromWallet = inputs.some((input) =>
    walletAddressSet.has(normalizeAddress(input?.address)),
  );

  const paysToWallet = outputs.some((output) =>
    walletAddressSet.has(normalizeAddress(output?.address)),
  );

  if (spendsFromWallet) {
    return "outgoing";
  }

  if (paysToWallet) {
    return "incoming";
  }

  return null;
}

function resolveRecipientHints(raw = {}) {
  const hints = new Set();

  const values = [
    raw.toAddress,
    raw.destinationAddress,
    raw.recipientAddress,
    raw.counterpartyAddress,
    raw.to,
    raw.destination,
    raw.recipient,
    raw.destinationHintAddress,
    raw.recipientHintAddress,
  ];

  for (const value of values) {
    const normalized = normalizeAddress(value);
    if (normalized) {
      hints.add(normalized);
    }
  }

  return hints;
}

function getWalletOutputs(outputs = [], walletAddressSet) {
  return outputs.filter((output) =>
    walletAddressSet.has(normalizeAddress(output?.address)),
  );
}

function getExternalOutputs(outputs = [], walletAddressSet) {
  return outputs.filter((output) => {
    const outputAddress = normalizeAddress(output?.address);
    return outputAddress && !walletAddressSet.has(outputAddress);
  });
}

function selectPreferredEntry(entries = [], preferredAddresses = []) {
  const normalizedPreferred = preferredAddresses
    .map((entry) => normalizeAddress(entry))
    .filter(Boolean);

  for (const preferred of normalizedPreferred) {
    const match = entries.find(
      (entry) => normalizeAddress(entry?.address) === preferred,
    );
    if (match) {
      return match;
    }
  }

  return entries[0] || null;
}

function resolveOutgoingRecipientOutputs(
  outputs = [],
  walletAddressSet,
  raw = {},
) {
  const externalOutputs = getExternalOutputs(outputs, walletAddressSet);

  if (externalOutputs.length === 0) {
    return [];
  }

  const recipientHints = resolveRecipientHints(raw);

  if (recipientHints.size > 0) {
    const hintedOutputs = externalOutputs.filter((output) =>
      recipientHints.has(normalizeAddress(output?.address)),
    );

    if (hintedOutputs.length > 0) {
      const distinctHintedAddresses = new Set(
        hintedOutputs
          .map((output) => normalizeAddress(output?.address))
          .filter(Boolean),
      );

      if (distinctHintedAddresses.size === 1) {
        return hintedOutputs;
      }

      return null;
    }
  }

  if (externalOutputs.length === 1) {
    return externalOutputs;
  }

  const distinctExternalAddresses = new Set(
    externalOutputs
      .map((output) => normalizeAddress(output?.address))
      .filter(Boolean),
  );

  if (distinctExternalAddresses.size === 1) {
    return externalOutputs;
  }

  return null;
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    const tx = raw.tx && typeof raw.tx === "object" ? raw.tx : {};
    const utxos = raw.utxos && typeof raw.utxos === "object" ? raw.utxos : {};
    const inputs = Array.isArray(utxos.inputs) ? utxos.inputs : [];
    const outputs = Array.isArray(utxos.outputs) ? utxos.outputs : [];
    const txHash = normalizeTxHash(
      raw.txHash || tx.hash || tx.tx_hash || raw.hash || raw.tx_hash || "",
    );

    const walletAddressSet = normalizeWalletAddressSet(raw, walletAddress);
    const direction = resolveDirection(inputs, outputs, walletAddressSet);

    if (!txHash || !direction) {
      return null;
    }

    const walletOutputs = getWalletOutputs(outputs, walletAddressSet);
    const externalOutputs = getExternalOutputs(outputs, walletAddressSet);

    let amountBaseUnits = "0";
    let resolvedToAddress = "";
    let resolvedFromAddress = "";
    const preferredWalletAddresses = [
      raw.referenceAddress,
      raw.walletAddress,
      walletAddress,
    ];

    if (direction === "incoming") {
      const totalToWalletBaseUnits = sumLovelace(walletOutputs);

      if (totalToWalletBaseUnits <= 0n) {
        return null;
      }

      amountBaseUnits = totalToWalletBaseUnits.toString();

      const primaryExternalInput = inputs.find((input) => {
        const inputAddress = normalizeAddress(input?.address);
        return inputAddress && !walletAddressSet.has(inputAddress);
      });

      const primaryWalletOutput = selectPreferredEntry(
        walletOutputs,
        preferredWalletAddresses,
      );

      resolvedFromAddress = String(
        primaryExternalInput?.address || inputs[0]?.address || "",
      ).trim();

      resolvedToAddress = String(
        primaryWalletOutput?.address ||
          walletAddress ||
          raw.walletAddress ||
          outputs[0]?.address ||
          "",
      ).trim();
    } else {
      const recipientOutputs = resolveOutgoingRecipientOutputs(
        outputs,
        walletAddressSet,
        raw,
      );

      if (!recipientOutputs || recipientOutputs.length === 0) {
        return null;
      }

      const totalToRecipientBaseUnits = sumLovelace(recipientOutputs);

      if (totalToRecipientBaseUnits <= 0n) {
        return null;
      }

      amountBaseUnits = totalToRecipientBaseUnits.toString();

      const walletInputs = inputs.filter((input) =>
        walletAddressSet.has(normalizeAddress(input?.address)),
      );
      const primaryWalletInput = selectPreferredEntry(
        walletInputs,
        preferredWalletAddresses,
      );
      const primaryRecipientOutput = selectPreferredEntry(
        recipientOutputs,
        [
          raw.toAddress,
          raw.destinationAddress,
          raw.recipientAddress,
          raw.counterpartyAddress,
          raw.destinationHintAddress,
          raw.recipientHintAddress,
        ],
      );

      resolvedFromAddress = String(
        primaryWalletInput?.address ||
          walletAddress ||
          raw.walletAddress ||
          inputs[0]?.address ||
          "",
      ).trim();

      resolvedToAddress = String(
        primaryRecipientOutput?.address ||
          externalOutputs[0]?.address ||
          outputs[0]?.address ||
          "",
      ).trim();
    }

    const chainTimestamp =
      raw.chainTimestamp instanceof Date
        ? raw.chainTimestamp
        : raw.chainTimestamp
          ? new Date(raw.chainTimestamp)
          : undefined;

    const ledgerIndex =
      Number(raw.blockHeight || tx.block_height || 0) || undefined;
    const confirmations = Number(raw.confirmations || 0) || 0;
    const validated = confirmations > 0 || Boolean(ledgerIndex);
    const networkFeeBaseUnits = normalizeQuantity(tx.fees || tx.fee || "0");

    return {
      tx: serializeValue(tx),
      meta: serializeValue(utxos),
      txHash,
      amount: amount.fromBaseUnits(amountBaseUnits),
      amountBaseUnits,
      direction,
      fromAddress: resolvedFromAddress,
      toAddress: resolvedToAddress,
      validated,
      confirmations,
      network: raw.network || undefined,
      networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
      networkFeeBaseUnits,
      executionParams: {},
      chainStatus: validated ? "confirmed" : "pending",
      succeeded: validated,
      ledgerIndex,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },
};
