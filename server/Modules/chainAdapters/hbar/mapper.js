const amount = require("./amount");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeConsensusTimestamp(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  const parsedSeconds = Number.parseFloat(normalized);
  if (!Number.isFinite(parsedSeconds)) {
    return undefined;
  }

  const timestamp = new Date(parsedSeconds * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function decodeMemo(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  try {
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch (_error) {
    return "";
  }
}

function normalizeAccountSet(raw = {}, walletAddress = "") {
  const values = new Set();

  if (Array.isArray(raw.walletAddresses)) {
    for (const entry of raw.walletAddresses) {
      const normalized = normalizeString(entry).toLowerCase();
      if (normalized) {
        values.add(normalized);
      }
    }
  }

  const fallback = normalizeString(walletAddress).toLowerCase();
  if (fallback) {
    values.add(fallback);
  }

  return values;
}

function normalizeTransfers(raw = {}) {
  return Array.isArray(raw.transfers) ? raw.transfers : [];
}

function toBigIntAmount(value) {
  try {
    return BigInt(String(value ?? "0"));
  } catch (_error) {
    return 0n;
  }
}

function resolveWalletEntries(transfers, walletAddressSet) {
  return transfers.filter((entry) =>
    walletAddressSet.has(normalizeString(entry?.account).toLowerCase()),
  );
}

function resolveExternalPositiveEntries(transfers, walletAddressSet) {
  return transfers
    .filter((entry) => {
      const account = normalizeString(entry?.account).toLowerCase();
      const amountValue = BigInt(String(entry?.amount ?? "0"));
      return account && !walletAddressSet.has(account) && amountValue > 0n;
    })
    .sort((left, right) => {
      const leftAmount = BigInt(String(left?.amount ?? "0"));
      const rightAmount = BigInt(String(right?.amount ?? "0"));
      if (leftAmount === rightAmount) {
        return normalizeString(left?.account).localeCompare(normalizeString(right?.account));
      }

      return leftAmount > rightAmount ? -1 : 1;
    });
}

function resolvePrimaryOutgoingRecipient(
  transfers,
  walletAddressSet,
  walletNetAmount,
  networkFeeBaseUnits,
) {
  const externalPositiveEntries = resolveExternalPositiveEntries(
    transfers,
    walletAddressSet,
  );
  if (!externalPositiveEntries.length) {
    return null;
  }

  if (externalPositiveEntries.length === 1) {
    return externalPositiveEntries[0];
  }

  const totalDebitBaseUnits = walletNetAmount < 0n ? walletNetAmount * -1n : 0n;
  const chargedFeeBaseUnits = toBigIntAmount(networkFeeBaseUnits);
  const expectedRecipientBaseUnits =
    totalDebitBaseUnits > chargedFeeBaseUnits
      ? totalDebitBaseUnits - chargedFeeBaseUnits
      : 0n;

  if (expectedRecipientBaseUnits > 0n) {
    const exactMatches = externalPositiveEntries.filter(
      (entry) => toBigIntAmount(entry?.amount) === expectedRecipientBaseUnits,
    );

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    if (exactMatches.length > 1) {
      return exactMatches.sort((left, right) =>
        normalizeString(left?.account).localeCompare(normalizeString(right?.account)),
      )[0];
    }
  }

  return externalPositiveEntries[0];
}

function resolvePrimaryIncomingSender(transfers, walletAddressSet) {
  return (
    transfers
      .filter((entry) => {
        const account = normalizeString(entry?.account).toLowerCase();
        return account && !walletAddressSet.has(account) && toBigIntAmount(entry?.amount) < 0n;
      })
      .sort((left, right) => {
        const leftAmount = toBigIntAmount(left?.amount) * -1n;
        const rightAmount = toBigIntAmount(right?.amount) * -1n;
        if (leftAmount === rightAmount) {
          return normalizeString(left?.account).localeCompare(normalizeString(right?.account));
        }

        return leftAmount > rightAmount ? -1 : 1;
      })[0] || null
  );
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    const txId = normalizeString(raw.transaction_id || raw.transactionId || raw.txHash);
    const walletAddressSet = normalizeAccountSet(raw, walletAddress);
    const transfers = normalizeTransfers(raw);
    const walletEntries = resolveWalletEntries(transfers, walletAddressSet);

    if (!txId || !walletEntries.length) {
      return null;
    }

    const walletNetAmount = walletEntries.reduce((total, entry) => {
      return total + BigInt(String(entry?.amount ?? "0"));
    }, 0n);

    if (walletNetAmount === 0n) {
      return null;
    }

    const direction = walletNetAmount > 0n ? "incoming" : "outgoing";
    const networkFeeBaseUnits = String(raw.charged_tx_fee || "0").trim();
    const primaryIncomingSender = resolvePrimaryIncomingSender(
      transfers,
      walletAddressSet,
    );
    const primaryOutgoingRecipient = resolvePrimaryOutgoingRecipient(
      transfers,
      walletAddressSet,
      walletNetAmount,
      networkFeeBaseUnits,
    );
    const externalPositiveEntries = resolveExternalPositiveEntries(
      transfers,
      walletAddressSet,
    );

    if (
      direction === "outgoing" &&
      !primaryOutgoingRecipient &&
      externalPositiveEntries.length === 0 &&
      toBigIntAmount(networkFeeBaseUnits) > 0n &&
      walletNetAmount * -1n <= toBigIntAmount(networkFeeBaseUnits)
    ) {
      return null;
    }

    const amountBaseUnits =
      direction === "incoming"
        ? walletNetAmount.toString()
        : (primaryOutgoingRecipient
            ? toBigIntAmount(primaryOutgoingRecipient.amount)
            : walletNetAmount * -1n
          ).toString();
    const consensusTimestamp = normalizeString(raw.consensus_timestamp);
    const chainTimestamp = normalizeConsensusTimestamp(consensusTimestamp);
    const status = normalizeString(raw.result || raw.status || "UNKNOWN") || "UNKNOWN";
    const validated = Boolean(consensusTimestamp);
    const fromAddress =
      direction === "incoming"
        ? normalizeString(primaryIncomingSender?.account || "")
        : normalizeString(walletAddress || raw.walletAddress || "");
    const toAddress =
      direction === "incoming"
        ? normalizeString(walletAddress || raw.walletAddress || "")
        : normalizeString(primaryOutgoingRecipient?.account || "");
    const memo = decodeMemo(raw.memo_base64);

    return {
      tx: raw,
      meta: {
        memo,
        transactionHash: normalizeString(raw.transaction_hash),
        consensusTimestamp,
      },
      txHash: txId,
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
      executionParams: memo ? { memo } : {},
      chainStatus: status,
      succeeded: status === "SUCCESS",
      ledgerIndex: undefined,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },
};
