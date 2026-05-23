const Deposit = require("../deposit/model");
const Withdrawal = require("../withdrawal/model");

const HISTORY_DEPOSIT_FALLBACK_CHAINS = Object.freeze(["eth", "arbitrum", "polygon", "bnb", "avax", "tron"]);

function toPlainDocument(value) {
  if (value && typeof value.toObject === "function") {
    return value.toObject();
  }

  return value || null;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeTxHash(value) {
  return normalizeString(value);
}

function normalizeOptionalDate(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function buildTransactionReference(transaction) {
  const transactionId = transaction?._id ? String(transaction._id) : "";
  if (transactionId) {
    return `tx:${transactionId}`;
  }

  const txHash = normalizeTxHash(transaction?.txHash);
  return txHash ? `txhash:${txHash}` : "";
}

function deriveDepositStatus(transaction = {}) {
  const status = normalizeString(transaction.status).toLowerCase();
  if (status === "failed") {
    return "failed";
  }

  if (status === "success" || normalizeString(transaction.chainStatus).toLowerCase() === "confirmed") {
    return "confirmed";
  }

  return "pending";
}

function deriveWithdrawalStatus(transaction = {}) {
  const status = normalizeString(transaction.status).toLowerCase();
  if (status === "failed") {
    return "failed";
  }

  if (status === "success") {
    return "completed";
  }

  return normalizeTxHash(transaction.txHash) ? "processing" : "created";
}

function shouldBackfillDepositFromHistory(chain) {
  return HISTORY_DEPOSIT_FALLBACK_CHAINS.includes(normalizeString(chain).toLowerCase());
}

async function findExistingWithdrawal({
  transactionId,
  walletId,
  txHash,
  reference,
}) {
  if (transactionId) {
    const byTransactionId = await Withdrawal.findOne({ transactionId }).lean();
    if (byTransactionId) {
      return byTransactionId;
    }
  }

  if (walletId && txHash) {
    const byTxHash = await Withdrawal.findOne({ walletId, txHash }).lean();
    if (byTxHash) {
      return byTxHash;
    }
  }

  if (reference) {
    return Withdrawal.findOne({ reference }).lean();
  }

  return null;
}

async function upsertWithdrawalFromTransaction(rawTransaction, options = {}) {
  const transaction = toPlainDocument(rawTransaction);
  if (!transaction) {
    return { created: false, updated: false, skipped: true };
  }

  if (
    normalizeString(transaction.type).toLowerCase() !== "transfer" ||
    normalizeString(transaction.direction).toLowerCase() !== "outgoing" ||
    normalizeString(transaction.transactionType).toLowerCase() !== "external" ||
    transaction.isSystemManaged === true
  ) {
    return { created: false, updated: false, skipped: true };
  }

  const transactionId = transaction._id || null;
  const txHash = normalizeTxHash(transaction.txHash);
  const reference =
    options.reference ||
    buildTransactionReference(transaction) ||
    normalizeString(options.fallbackReference);

  if (!transactionId && !reference) {
    return { created: false, updated: false, skipped: true };
  }

  const existing = await findExistingWithdrawal({
    transactionId,
    walletId: transaction.walletId || null,
    txHash,
    reference,
  });
  const confirmed_at =
    deriveWithdrawalStatus(transaction) === "completed"
      ? normalizeOptionalDate(transaction.confirmed_at || transaction.confirmedAt || transaction.block_time || transaction.chainTimestamp) || new Date()
      : null;
  const block_time = normalizeOptionalDate(transaction.block_time || transaction.chainTimestamp) || confirmed_at;
  const failedAt =
    deriveWithdrawalStatus(transaction) === "failed"
      ? normalizeOptionalDate(transaction.updatedAt) || new Date()
      : null;

  const payload = {
    userId: transaction.userId,
    accountId: transaction.accountId,
    walletId: transaction.walletId,
    chain: transaction.chain,
    network: transaction.network,
    asset: transaction.asset || transaction.currency || "",
    amount: transaction.recipientGets || transaction.amount || "0",
    destinationAddress: transaction.toAddress || "",
    executionParams:
      transaction.executionParams && typeof transaction.executionParams === "object"
        ? transaction.executionParams
        : {},
    status: deriveWithdrawalStatus(transaction),
    reference: existing?.reference || reference,
    transactionId,
    txHash: txHash || undefined,
    chainStatus: transaction.chainStatus || null,
    systemStatus: transaction.systemStatus || null,
    confirmed_at: confirmed_at || undefined,
    confirmedAt: confirmed_at || undefined,
    block_time: block_time || undefined,
    failedAt: failedAt || undefined,
    metadata: {
      ...(existing?.metadata || {}),
      source: options.source || existing?.metadata?.source || "transaction",
      transactionStatus: transaction.status || "",
      transactionType: transaction.transactionType || "",
      direction: transaction.direction || "",
      relatedTransactionId: transaction.relatedTransactionId
        ? String(transaction.relatedTransactionId)
        : null,
    },
  };

  if (existing) {
    await Withdrawal.updateOne({ _id: existing._id }, { $set: payload });
    return {
      created: false,
      updated: true,
      withdrawalId: String(existing._id),
    };
  }

  const created = await Withdrawal.create(payload);
  return {
    created: true,
    updated: false,
    withdrawalId: String(created._id),
  };
}

async function upsertDepositFromTransaction(rawTransaction, options = {}) {
  const transaction = toPlainDocument(rawTransaction);
  if (!transaction) {
    return { created: false, updated: false, skipped: true };
  }

  if (
    normalizeString(transaction.direction).toLowerCase() !== "incoming" ||
    normalizeString(transaction.transactionType).toLowerCase() !== "external"
  ) {
    return { created: false, updated: false, skipped: true };
  }

  const txHash = normalizeTxHash(transaction.txHash);
  if (!txHash) {
    return { created: false, updated: false, skipped: true };
  }

  if (options.historyFallbackOnly && !shouldBackfillDepositFromHistory(transaction.chain)) {
    return { created: false, updated: false, skipped: true };
  }

  const detailedDeposit = await Deposit.findOne({
    walletId: transaction.walletId,
    txHash,
    vout: { $exists: true },
  }).lean();
  if (detailedDeposit) {
    return {
      created: false,
      updated: false,
      skipped: true,
      depositId: String(detailedDeposit._id),
    };
  }

  const filter = { walletId: transaction.walletId, txHash };
  const existing = await Deposit.findOne(filter).lean();
  const status = deriveDepositStatus(transaction);
  const confirmed_at =
    status === "confirmed"
      ? normalizeOptionalDate(transaction.confirmed_at || transaction.confirmedAt || transaction.block_time || transaction.chainTimestamp) || new Date()
      : null;
  const block_time = normalizeOptionalDate(transaction.block_time || transaction.chainTimestamp) || confirmed_at;

  const payload = {
    userId: transaction.userId,
    accountId: transaction.accountId,
    walletId: transaction.walletId,
    chain: transaction.chain,
    network: transaction.network,
    asset: transaction.asset || transaction.currency || "",
    address: transaction.toAddress || "",
    txHash,
    amount: transaction.recipientGets || transaction.amount || "0",
    confirmations: Number(transaction.confirmations || 0) || 0,
    status,
    transactionId: transaction._id || null,
    chainStatus: transaction.chainStatus || null,
    confirmed_at: confirmed_at || undefined,
    confirmedAt: confirmed_at || undefined,
    block_time: block_time || undefined,
    metadata: {
      ...(existing?.metadata || {}),
      source: options.source || existing?.metadata?.source || "transaction",
      transactionStatus: transaction.status || "",
      transactionType: transaction.transactionType || "",
    },
  };

  if (existing) {
    await Deposit.updateOne({ _id: existing._id }, { $set: payload });
    return {
      created: false,
      updated: true,
      depositId: String(existing._id),
    };
  }

  const created = await Deposit.create(payload);
  return {
    created: true,
    updated: false,
    depositId: String(created._id),
  };
}

module.exports = {
  normalizeTxHash,
  shouldBackfillDepositFromHistory,
  upsertDepositFromTransaction,
  upsertWithdrawalFromTransaction,
};
