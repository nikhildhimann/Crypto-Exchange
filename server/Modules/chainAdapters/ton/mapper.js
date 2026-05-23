const amount = require("./amount");
const wallet = require("./wallet");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeOptionalAddress(value, network) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  try {
    return wallet.normalizeAddress(normalized, network);
  } catch (_error) {
    return "";
  }
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  const timestamp = new Date(numeric * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function resolveOutgoingMessages(raw = {}, walletAddress, network) {
  return (Array.isArray(raw.outMessages) ? raw.outMessages : [])
    .map((entry) => ({
      ...entry,
      sourceAddress: normalizeOptionalAddress(entry?.sourceAddress, network),
      destinationAddress: normalizeOptionalAddress(
        entry?.destinationAddress,
        network,
      ),
      valueBaseUnits: String(entry?.valueBaseUnits || "0"),
    }))
    .filter((entry) => {
      try {
        return (
          entry.destinationAddress &&
          entry.destinationAddress !== walletAddress &&
          BigInt(entry.valueBaseUnits) > 0n
        );
      } catch (_error) {
        return false;
      }
    });
}

function resolveTonStatus({
  raw,
  direction,
  amountBaseUnits,
  normalizedWalletAddress,
}) {path
  const description = raw?.description || {};
  const inMessage = raw?.inMessage || {};
  const oldStatus = normalizeString(raw?.oldStatus).toLowerCase();
  const endStatus = normalizeString(raw?.endStatus).toLowerCase();
  const bounced = inMessage?.bounced === true;
  const bounce = inMessage?.bounce === true;

  const hasIncomingCredit =
    direction === "incoming" &&
    BigInt(String(amountBaseUnits || "0")) > 0n &&
    normalizeString(inMessage?.destinationAddress) !== "" &&
    normalizeString(inMessage?.destinationAddress) === normalizedWalletAddress;

  const computeExplicitFailure = description?.computeSuccess === false;
  const actionExplicitFailure = description?.actionSuccess === false;
  const aborted = description?.aborted === true;

  const isPendingActivationIncoming =
    hasIncomingCredit &&
    bounced === false &&
    bounce === false &&
    oldStatus === "non-existing" &&
    endStatus === "uninitialized";

  if (isPendingActivationIncoming) {
    return {
      chainStatus: "pending_activation",
      succeeded: false,
      credited: true,
      pendingActivation: true,
      statusReason:
        "Funds credited to inactive/uninitialized TON account. Wallet contract not deployed yet.",
    };
  }

  const isConfirmedIncoming =
    hasIncomingCredit &&
    endStatus === "active" &&
    !aborted &&
    !computeExplicitFailure &&
    !actionExplicitFailure;

  if (isConfirmedIncoming) {
    return {
      chainStatus: "confirmed",
      succeeded: true,
      credited: true,
      pendingActivation: false,
      statusReason: "Incoming TON transfer confirmed on active account.",
    };
  }

  const isConfirmedOutgoing =
    direction === "outgoing" &&
    !aborted &&
    !computeExplicitFailure &&
    !actionExplicitFailure;

  if (isConfirmedOutgoing) {
    return {
      chainStatus: "confirmed",
      succeeded: true,
      credited: false,
      pendingActivation: false,
      statusReason: "Outgoing TON transfer confirmed.",
    };
  }

  return {
    chainStatus: "failed",
    succeeded: false,
    credited: false,
    pendingActivation: false,
    statusReason:
      "TON transaction execution failed or could not be treated as credited/pending activation.",
  };
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    const network = normalizeString(raw.network);
    const normalizedWalletAddress = normalizeOptionalAddress(
      walletAddress,
      network,
    );
    const txHash = normalizeString(raw.txHash);

    if (!normalizedWalletAddress || !txHash) {
      return null;
    }

    const inMessage =
      raw.inMessage && typeof raw.inMessage === "object" ? raw.inMessage : null;
    const incomingSourceAddress = normalizeOptionalAddress(
      inMessage?.sourceAddress,
      network,
    );
    const incomingDestinationAddress = normalizeOptionalAddress(
      inMessage?.destinationAddress,
      network,
    );
    const outgoingMessages = resolveOutgoingMessages(
      raw,
      normalizedWalletAddress,
      network,
    );

    let direction = null;
    let amountBaseUnits = "0";
    let fromAddress = "";
    let toAddress = "";

    try {
      if (
        inMessage?.type === "internal" &&
        incomingDestinationAddress === normalizedWalletAddress &&
        BigInt(String(inMessage?.valueBaseUnits || "0")) > 0n
      ) {
        direction = "incoming";
        amountBaseUnits = String(inMessage.valueBaseUnits);
        fromAddress = incomingSourceAddress;
        toAddress = normalizedWalletAddress;
      } else if (outgoingMessages.length) {
        const totalOutgoingBaseUnits = outgoingMessages.reduce(
          (sum, entry) => sum + BigInt(entry.valueBaseUnits),
          0n,
        );

        direction = "outgoing";
        amountBaseUnits = totalOutgoingBaseUnits.toString();
        fromAddress = normalizedWalletAddress;
        toAddress = outgoingMessages[0].destinationAddress;
      }
    } catch (_error) {
      return null;
    }

    if (!direction || BigInt(amountBaseUnits || "0") <= 0n) {
      return null;
    }

    const chainTimestamp = normalizeTimestamp(raw.now);
    const networkFeeBaseUnits = String(raw.totalFeesBaseUnits || "0");

    const status = resolveTonStatus({
      raw,
      direction,
      amountBaseUnits,
      normalizedWalletAddress,
    });

    return {
      tx: raw,
      meta: {
        lt: raw.lt || null,
        oldStatus: raw.oldStatus || null,
        endStatus: raw.endStatus || null,
        description: raw.description || {},
        statusReason: status.statusReason,
      },
      txHash,
      amount: amount.fromBaseUnits(amountBaseUnits),
      amountBaseUnits,
      direction,
      fromAddress,
      toAddress,
      validated: true,
      confirmations: 1,
      network: network || undefined,
      networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
      networkFeeBaseUnits,
      executionParams: {},
      chainStatus: status.chainStatus,
      succeeded: status.succeeded,
      credited: status.credited,
      pendingActivation: status.pendingActivation,
      ledgerIndex: undefined,
      chainTimestamp,
      confirmedAt: chainTimestamp,
    };
  },
};
