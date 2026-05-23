const amountInfo = require("./amount");

function mapTransaction(raw = {}, walletAddress) {
  const txHash = raw.hash;
  if (!txHash || raw.type !== "transaction") {
    return null;
  }

  const fromAddress = raw.sender?.address || "";
  const toAddress = raw.target?.address || "";

  if (fromAddress !== walletAddress && toAddress !== walletAddress) {
    return null;
  }

  const direction =
    toAddress === walletAddress
      ? "incoming"
      : fromAddress === walletAddress
        ? "outgoing"
        : null;

  if (!direction) {
    return null;
  }

  const succeeded = raw.status === "applied";
  const validated = true; // Block explorer confirms it
  const chainTimestamp = raw.timestamp ? new Date(raw.timestamp) : undefined;
  const amountBaseUnits = String(raw.amount || 0);
  const feeBaseUnits = String(raw.fee || 0);

  return {
    tx: raw,
    meta: {},
    txHash,
    amount: amountInfo.fromBaseUnits(amountBaseUnits),
    amountBaseUnits,
    direction,
    fromAddress,
    toAddress,
    validated, // Fully confirmed since it's from TzKT and status applied/failed
    networkFee: amountInfo.fromBaseUnits(feeBaseUnits),
    networkFeeBaseUnits: feeBaseUnits,
    executionParams: {},
    chainStatus: succeeded ? "confirmed" : "failed",
    succeeded,
    ledgerIndex: typeof raw.level === "number" ? raw.level : undefined,
    chainTimestamp,
    confirmedAt: chainTimestamp,
  };
}

module.exports = {
  mapTransaction
};
