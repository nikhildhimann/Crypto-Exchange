const amount = require("./amount");

function extractTransferInstruction(parsedTransaction, walletAddress) {
  const instructions = parsedTransaction?.transaction?.message?.instructions || [];

  for (const instruction of instructions) {
    if (instruction?.program !== "system" || instruction?.parsed?.type !== "transfer") {
      continue;
    }

    const info = instruction.parsed.info || {};
    const source = String(info.source || "");
    const destination = String(info.destination || "");

    if (source !== walletAddress && destination !== walletAddress) {
      continue;
    }

    return {
      source,
      destination,
      lamports: String(info.lamports || "0"),
    };
  }

  return null;
}

function normalizeBlockTime(blockTime) {
  if (typeof blockTime !== "number") {
    return undefined;
  }

  const timestamp = new Date(blockTime * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    const parsedTransaction = raw.parsedTransaction;
    const signatureInfo = raw.signatureInfo || {};

    if (!parsedTransaction) {
      return null;
    }

    const transfer = extractTransferInstruction(parsedTransaction, walletAddress);
    if (!transfer) {
      return null;
    }

    const txHash = signatureInfo.signature || parsedTransaction.transaction?.signatures?.[0];
    if (!txHash) {
      return null;
    }

    const direction =
      transfer.destination === walletAddress
        ? "incoming"
        : transfer.source === walletAddress
          ? "outgoing"
          : null;

    if (!direction) {
      return null;
    }

    const meta = parsedTransaction.meta || {};
    const confirmationStatus = signatureInfo.confirmationStatus || "confirmed";
    const validated = confirmationStatus === "confirmed" || confirmationStatus === "finalized";
    const succeeded = !meta.err;
    const chainTimestamp = normalizeBlockTime(parsedTransaction.blockTime);

    return {
      tx: parsedTransaction,
      meta,
      txHash,
      amount: amount.fromBaseUnits(transfer.lamports),
      amountBaseUnits: transfer.lamports,
      direction,
      fromAddress: transfer.source,
      toAddress: transfer.destination,
      validated,
      networkFee: amount.fromBaseUnits(String(meta.fee || 0)),
      networkFeeBaseUnits: String(meta.fee || 0),
      executionParams: {},
      chainStatus: succeeded ? confirmationStatus : "failed",
      succeeded,
      ledgerIndex:
        typeof parsedTransaction.slot === "number"
          ? parsedTransaction.slot
          : typeof signatureInfo.slot === "number"
            ? signatureInfo.slot
            : undefined,
      chainTimestamp,
      confirmedAt: chainTimestamp,
    };
  },
};
