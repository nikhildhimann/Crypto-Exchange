const Wallet = require("../wallet/model");
const NFTSyncState = require("./nftSyncState.model");
const Transaction = require("../transaction/model");
const socket = require("../../lib/socket");
const logger = require("../../common/utils/logger");
const { normalizeAddress } = require("./mapper");
const { assertChainFeature } = require("../../common/utils/chain");
const { normalizeTxHash } = require("../../common/utils/txHash");
const {
  normalizeNftContractAddress,
  normalizeNftHistoryIdentity,
  normalizeNftStandard,
  normalizeNftTokenId,
} = require("./history.utils");
const { scheduleWalletNftRefresh } = require("./refresh.service");
const { AppError } = require("../../helpers/errors");

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 100;
const SUPPORTED_STANDARDS = new Set(["erc721", "erc1155"]);
const SUPPORTED_STANDARD_QUERY_VALUES = ["erc721", "erc1155", "ERC721", "ERC1155"];
const PENDING_SYSTEM_STATUSES = Object.freeze([
  "submitting",
  "submitted_to_chain",
]);
const PENDING_CHAIN_STATUSES = Object.freeze([
  "pending_submission",
  "submitted",
]);

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function normalizeBatchLimit(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_BATCH_LIMIT).trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BATCH_LIMIT;
  }

  return Math.min(parsed, MAX_BATCH_LIMIT);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeReconciliationError(error) {
  return {
    message: normalizeString(error?.message, "Unknown reconciliation error"),
    status: error?.status || null,
    code: normalizeString(error?.code) || null,
  };
}

function buildPendingNftTransferQuery(filters = {}) {
  const query = {
    assetType: "nft",
    standard: { $in: SUPPORTED_STANDARD_QUERY_VALUES },
    direction: "outgoing",
    txHash: {
      $exists: true,
      $type: "string",
      $gt: "",
    },
    $or: [
      { status: "pending" },
      { systemStatus: { $in: Array.from(PENDING_SYSTEM_STATUSES) } },
      { chainStatus: { $in: Array.from(PENDING_CHAIN_STATUSES) } },
    ],
  };

  if (filters.chain) {
    query.chain = normalizeString(filters.chain).toLowerCase();
  }

  if (filters.network) {
    query.network = normalizeString(filters.network).toLowerCase();
  }

  if (filters.txHash) {
    query.txHash = normalizeTxHash(filters.txHash);
  }

  if (filters._id) {
    query._id = filters._id;
  }

  return query;
}

function isEligibleNftTransferTransaction(transaction = {}) {
  const txHash = normalizeTxHash(transaction.txHash);
  const status = normalizeString(transaction.status).toLowerCase();
  const systemStatus = normalizeString(transaction.systemStatus).toLowerCase();
  const chainStatus = normalizeString(transaction.chainStatus).toLowerCase();

  if (
    normalizeString(transaction.assetType).toLowerCase() !== "nft" ||
    !SUPPORTED_STANDARDS.has(
      normalizeNftStandard(transaction.metadata?.nft?.standard || transaction.standard),
    ) ||
    normalizeString(transaction.direction).toLowerCase() !== "outgoing" ||
    !txHash
  ) {
    return false;
  }

  return (
    status === "pending" ||
    PENDING_SYSTEM_STATUSES.includes(systemStatus) ||
    PENDING_CHAIN_STATUSES.includes(chainStatus)
  );
}

function buildMergedRawResponse(transaction = {}, statusPayload = {}) {
  const existingRawResponse =
    transaction.rawResponse &&
    typeof transaction.rawResponse === "object" &&
    !Array.isArray(transaction.rawResponse)
      ? transaction.rawResponse
      : {};

  return {
    ...existingRawResponse,
    transaction: statusPayload.transaction || existingRawResponse.transaction || {},
    receipt: statusPayload.receipt || existingRawResponse.receipt || {},
    reconciliation: {
      checkedAt: new Date(),
      pendingState: statusPayload.pendingState || null,
      currentBlockNumber:
        statusPayload.currentBlockNumber === undefined
          ? null
          : statusPayload.currentBlockNumber,
      chainStatus: statusPayload.chainStatus || null,
      validated: statusPayload.validated === true,
      succeeded: statusPayload.succeeded === true,
    },
  };
}

async function markWalletNftSyncStateStale({ wallet }) {
  const ownerAddress = normalizeAddress(wallet.address);

  await NFTSyncState.updateOne(
    {
      userId: wallet.userId,
      walletId: wallet._id,
      chain: wallet.chain,
    },
    {
      $set: {
        accountId: wallet.accountId || null,
        ownerAddress,
        provider: "alchemy",
        needsRefresh: true,
        status: "stale",
      },
      $setOnInsert: {
        assetCount: 0,
        collectionCount: 0,
        lastSyncedAt: null,
      },
    },
    { upsert: true },
  );
}

function buildReceiverIncomingNftMetadata({
  senderTransaction,
  recipientWallet,
}) {
  const senderMetadata =
    senderTransaction?.metadata &&
    typeof senderTransaction.metadata === "object" &&
    !Array.isArray(senderTransaction.metadata)
      ? senderTransaction.metadata
      : {};
  const senderNftMetadata =
    senderMetadata.nft &&
    typeof senderMetadata.nft === "object" &&
    !Array.isArray(senderMetadata.nft)
      ? senderMetadata.nft
      : {};

  return {
    ...senderMetadata,
    source: "nft_transfer_receiver",
    mirroredFromTransactionId: String(senderTransaction._id),
    nft: {
      ...senderNftMetadata,
      standard: normalizeNftStandard(
        senderNftMetadata.standard || senderTransaction.standard || "erc721",
      ),
      contractAddress: normalizeNftContractAddress(
        senderNftMetadata.contractAddress || senderTransaction.contractAddress,
      ),
      tokenId: normalizeNftTokenId(
        senderNftMetadata.tokenId || senderTransaction.tokenId,
      ),
      ownerAddress: normalizeAddress(recipientWallet.address),
    },
  };
}

async function resolveRecipientWalletForConfirmedSuccess(transaction) {
  const toAddress = normalizeString(transaction.toAddress);

  if (!toAddress) {
    return null;
  }

  return Wallet.findOne({
    chain: transaction.chain,
    network: transaction.network,
    address: {
      $regex: `^${escapeRegex(toAddress)}$`,
      $options: "i",
    },
  }).lean();
}

async function upsertReceiverIncomingNftTransaction({
  senderTransaction,
  recipientWallet,
  statusPayload,
}) {
  if (!senderTransaction?._id || !recipientWallet?._id) {
    return null;
  }

  const txHash = normalizeTxHash(statusPayload.txHash || senderTransaction.txHash);
  if (!txHash) {
    throw AppError.validation("NFT receiver transaction requires a tx hash");
  }

  const identity = normalizeNftHistoryIdentity({
    txHash,
    contractAddress:
      senderTransaction.metadata?.nft?.contractAddress ||
      senderTransaction.contractAddress,
    tokenId:
      senderTransaction.metadata?.nft?.tokenId || senderTransaction.tokenId,
    direction: "incoming",
    standard:
      senderTransaction.metadata?.nft?.standard || senderTransaction.standard,
  });

  const chainTimestamp =
    statusPayload.confirmedAt || statusPayload.chainTimestamp || null;
    
  let existingReceiverTransaction = await Transaction.findOne({
    walletId: recipientWallet._id,
    chain: senderTransaction.chain,
    historyUniqueKey: identity.canonicalHistoryUniqueKey,
  })
    .select({ _id: 1 })
    .lean();



  if (!existingReceiverTransaction) {
    existingReceiverTransaction = await Transaction.findOne({
      walletId: recipientWallet._id,
      chain: senderTransaction.chain,
      txHash,
      contractAddress: {
        $regex: `^${escapeRegex(identity.contractAddress)}$`,
        $options: "i",
      },
      standard: {
        $in: identity.standardQueryVariants,
      },
      direction: identity.direction,
      "metadata.nft.tokenId": {
        $in: identity.tokenIdQueryVariants,
      },
    })
      .select({ _id: 1 })
      .lean();
  }

  const query = existingReceiverTransaction
    ? { _id: existingReceiverTransaction._id }
    : {
        walletId: recipientWallet._id,
        chain: senderTransaction.chain,
        historyUniqueKey: identity.canonicalHistoryUniqueKey,
      };

  const receiverTransaction = await Transaction.findOneAndUpdate(
    query,
    {
      $set: {
        userId: recipientWallet.userId,
        accountId: recipientWallet.accountId || null,
        walletId: recipientWallet._id,
        chain: senderTransaction.chain,
        network: senderTransaction.network,
        type: senderTransaction.type || "transfer",
        transactionType: "external",
        direction: "incoming",
        fromAddress: senderTransaction.fromAddress,
        toAddress: senderTransaction.toAddress,
        amount: senderTransaction.amount || "1",
        amountBaseUnits: senderTransaction.amountBaseUnits || "1",
        currency: senderTransaction.currency || senderTransaction.asset || "NFT",
        asset: senderTransaction.asset || senderTransaction.currency || "NFT",
        assetType: "nft",
        standard: identity.standard,
        contractAddress: identity.contractAddress,
        executionParams:
          senderTransaction.executionParams &&
          typeof senderTransaction.executionParams === "object"
            ? senderTransaction.executionParams
            : {},
        networkFee: "0",
        networkFeeBaseUnits: "0",
        networkFeeAsset: null,
        networkFeeCurrency: null,
        networkFeeAssetType: null,
        platformFee: "0",
        platformFeeBaseUnits: "0",
        totalDebit: "0",
        totalDebitBaseUnits: "0",
        totalDebitAsset: senderTransaction.asset || senderTransaction.currency || "NFT",
        totalDebitCurrency:
          senderTransaction.currency || senderTransaction.asset || "NFT",
        totalDebitAssetType: "nft",
        compositeDebit: null,
        recipientGets: senderTransaction.recipientGets || senderTransaction.amount || "1",
        recipientGetsBaseUnits:
          senderTransaction.recipientGetsBaseUnits ||
          senderTransaction.amountBaseUnits ||
          "1",
        txHash,
        historyUniqueKey: identity.canonicalHistoryUniqueKey,
        confirmations: Number(statusPayload.confirmations || 0),
        ledgerIndex: statusPayload.ledgerIndex,
        validated: true,
        succeeded: true,
        status: "success",
        systemStatus: "confirmed",
        chainStatus: "confirmed",
        rawRequest:
          senderTransaction.rawRequest &&
          typeof senderTransaction.rawRequest === "object"
            ? senderTransaction.rawRequest
            : {},
        rawResponse: buildMergedRawResponse(senderTransaction, statusPayload),
        metadata: buildReceiverIncomingNftMetadata({
          senderTransaction,
          recipientWallet,
        }),
        relatedTransactionId: senderTransaction._id,
        chainTimestamp,
        confirmedAt: chainTimestamp,
        confirmed_at: chainTimestamp,
        block_time: chainTimestamp,
      },
      $unset: {
        errorMessage: 1,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  if (receiverTransaction) {
    if (existingReceiverTransaction) {
      socket.emitTransactionUpdate(receiverTransaction);
    } else {
      socket.emitTransactionNew(receiverTransaction);
    }
  }

  return receiverTransaction;
}

async function markRecipientWalletStaleOnConfirmedSuccess(recipientWallet) {
  if (!recipientWallet) {
    return null;
  }

  await markWalletNftSyncStateStale({ wallet: recipientWallet });
  return recipientWallet;
}

function triggerWalletRefreshAfterReconciliation({
  wallet,
  reason,
}) {
  if (!wallet?._id || !wallet?.userId || !wallet?.chain) {
    return;
  }

  scheduleWalletNftRefresh({
    userId: wallet.userId,
    walletId: String(wallet._id),
    chain: wallet.chain,
    reason,
    force: true,
  }).catch((error) => {
    logger.warn("Reconciliation-triggered NFT refresh failed", {
      event: "nft_reconciliation_refresh_failed",
      userId: String(wallet.userId),
      walletId: String(wallet._id),
      chain: wallet.chain,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function resolveChainStatus(transaction) {
  const context = assertChainFeature(
    transaction.chain,
    transaction.network,
    "send",
  );

  if (typeof context.adapter?.transaction?.getTransactionStatusByHash !== "function") {
    throw AppError.notImplemented(
      `NFT transfer reconciliation is not available for chain "${context.chain}" yet`,
    );
  }

  return {
    context,
    statusPayload: await context.adapter.transaction.getTransactionStatusByHash({
      network: transaction.network,
      txHash: transaction.txHash,
    }),
  };
}

async function persistConfirmedSuccess(transaction, context, statusPayload) {
  const identity = normalizeNftHistoryIdentity({
    txHash: statusPayload.txHash || transaction.txHash,
    contractAddress:
      transaction.metadata?.nft?.contractAddress || transaction.contractAddress,
    tokenId: transaction.metadata?.nft?.tokenId || transaction.tokenId,
    direction: transaction.direction || "outgoing",
    standard: transaction.metadata?.nft?.standard || transaction.standard,
  });

  const update = {
    validated: true,
    succeeded: true,
    status: "success",
    systemStatus: "confirmed",
    chainStatus: "confirmed",
    historyUniqueKey: identity.canonicalHistoryUniqueKey,
    txHash: identity.txHash,
    standard: identity.standard,
    contractAddress: identity.contractAddress,
    confirmations: Number(statusPayload.confirmations || 0),
    ledgerIndex: statusPayload.ledgerIndex,
    networkFee: statusPayload.networkFee || "0",
    networkFeeBaseUnits: statusPayload.networkFeeBaseUnits || "0",
    networkFeeAsset: context.assetSymbol,
    networkFeeCurrency: context.assetSymbol,
    networkFeeAssetType: "native",
    rawResponse: buildMergedRawResponse(transaction, statusPayload),
    "metadata.nft.contractAddress": identity.contractAddress,
    "metadata.nft.tokenId": identity.tokenId,
    "metadata.nft.standard": identity.standard,
    errorMessage: undefined,
  };

  if (statusPayload.chainTimestamp) {
    update.chainTimestamp = statusPayload.chainTimestamp;
    update.confirmedAt = statusPayload.confirmedAt || statusPayload.chainTimestamp;
    update.confirmed_at = statusPayload.confirmedAt || statusPayload.chainTimestamp;
    update.block_time = statusPayload.chainTimestamp;
  }

  const updatedTransaction = await Transaction.findByIdAndUpdate(
    transaction._id,
    {
      $set: update,
      $unset: {
        errorMessage: 1,
      },
    },
    { new: true },
  ).lean();

  if (updatedTransaction) {
    socket.emitTransactionUpdate(updatedTransaction);
  }

  return updatedTransaction;
}

async function persistConfirmedFailure(transaction, context, statusPayload) {
  const failureMessage =
    normalizeString(statusPayload.receipt?.status) === "0"
      ? "Polygon NFT transfer failed on-chain"
      : "Polygon NFT transfer was confirmed failed on-chain";

  const identity = normalizeNftHistoryIdentity({
    txHash: statusPayload.txHash || transaction.txHash,
    contractAddress:
      transaction.metadata?.nft?.contractAddress || transaction.contractAddress,
    tokenId: transaction.metadata?.nft?.tokenId || transaction.tokenId,
    direction: transaction.direction || "outgoing",
    standard: transaction.metadata?.nft?.standard || transaction.standard,
  });

  const update = {
    validated: true,
    succeeded: false,
    status: "failed",
    systemStatus: "confirmed_failed",
    chainStatus: "failed",
    historyUniqueKey: identity.canonicalHistoryUniqueKey,
    txHash: identity.txHash,
    standard: identity.standard,
    contractAddress: identity.contractAddress,
    confirmations: Number(statusPayload.confirmations || 0),
    ledgerIndex: statusPayload.ledgerIndex,
    networkFee: statusPayload.networkFee || "0",
    networkFeeBaseUnits: statusPayload.networkFeeBaseUnits || "0",
    networkFeeAsset: context.assetSymbol,
    networkFeeCurrency: context.assetSymbol,
    networkFeeAssetType: "native",
    rawResponse: buildMergedRawResponse(transaction, statusPayload),
    "metadata.nft.contractAddress": identity.contractAddress,
    "metadata.nft.tokenId": identity.tokenId,
    "metadata.nft.standard": identity.standard,
    errorMessage: failureMessage,
  };

  if (statusPayload.chainTimestamp) {
    update.chainTimestamp = statusPayload.chainTimestamp;
    update.confirmedAt = statusPayload.confirmedAt || statusPayload.chainTimestamp;
    update.confirmed_at = statusPayload.confirmedAt || statusPayload.chainTimestamp;
    update.block_time = statusPayload.chainTimestamp;
  }

  const updatedTransaction = await Transaction.findByIdAndUpdate(
    transaction._id,
    { $set: update },
    { new: true },
  ).lean();

  if (updatedTransaction) {
    socket.emitTransactionUpdate(updatedTransaction);
  }

  return updatedTransaction;
}

async function persistStillPending(transaction, statusPayload) {
  const update = {
    confirmations: Number(statusPayload.confirmations || 0),
    rawResponse: buildMergedRawResponse(transaction, statusPayload),
  };

  const updatedTransaction = await Transaction.findByIdAndUpdate(
    transaction._id,
    { $set: update },
    { new: true },
  ).lean();

  if (updatedTransaction) {
    socket.emitTransactionUpdate(updatedTransaction);
  }

  return updatedTransaction;
}

async function reconcileNftTransferTransaction(rawTransaction) {
  const transaction =
    rawTransaction && typeof rawTransaction.toObject === "function"
      ? rawTransaction.toObject()
      : rawTransaction;

  if (!transaction || !transaction._id) {
    throw AppError.validation("NFT transfer transaction is required");
  }

  if (!isEligibleNftTransferTransaction(transaction)) {
    return {
      transactionId: String(transaction._id),
      txHash: normalizeTxHash(transaction.txHash),
      outcome: "skipped",
      reason: "not_pending_nft_transfer",
    };
  }

  const { context, statusPayload } = await resolveChainStatus(transaction);

  if (statusPayload.pendingState) {
    const updatedTransaction = await persistStillPending(transaction, statusPayload);

    return {
      transactionId: String(transaction._id),
      txHash: statusPayload.txHash,
      outcome: statusPayload.pendingState,
      transaction: updatedTransaction,
    };
  }

  if (statusPayload.succeeded === true) {
    const updatedTransaction = await persistConfirmedSuccess(
      transaction,
      context,
      statusPayload,
    );

    await markWalletNftSyncStateStale({
      wallet: {
        _id: transaction.walletId,
        userId: transaction.userId,
        accountId: transaction.accountId || null,
        chain: transaction.chain,
        address: transaction.fromAddress,
      },
    });
    triggerWalletRefreshAfterReconciliation({
      wallet: {
        _id: transaction.walletId,
        userId: transaction.userId,
        chain: transaction.chain,
      },
      reason: "nft_transfer_confirmed_sender",
    });

    const recipientWallet = await resolveRecipientWalletForConfirmedSuccess(
      updatedTransaction || transaction,
    );

    if (recipientWallet) {
      await upsertReceiverIncomingNftTransaction({
        senderTransaction: updatedTransaction || transaction,
        recipientWallet,
        statusPayload,
      });

      await markRecipientWalletStaleOnConfirmedSuccess(recipientWallet);
      triggerWalletRefreshAfterReconciliation({
        wallet: recipientWallet,
        reason: "nft_transfer_confirmed_recipient",
      });
    }

    return {
      transactionId: String(transaction._id),
      txHash: statusPayload.txHash,
      outcome: "confirmed_success",
      transaction: updatedTransaction,
    };
  }

  const updatedTransaction = await persistConfirmedFailure(
    transaction,
    context,
    statusPayload,
  );

  await markWalletNftSyncStateStale({
    wallet: {
      _id: transaction.walletId,
      userId: transaction.userId,
      accountId: transaction.accountId || null,
      chain: transaction.chain,
      address: transaction.fromAddress,
    },
  });
  triggerWalletRefreshAfterReconciliation({
    wallet: {
      _id: transaction.walletId,
      userId: transaction.userId,
      chain: transaction.chain,
    },
    reason: "nft_transfer_confirmed_failed",
  });

  return {
    transactionId: String(transaction._id),
    txHash: statusPayload.txHash,
    outcome: "confirmed_failed",
    transaction: updatedTransaction,
  };
}

async function reconcileNftTransferByHash({ txHash, chain, network }) {
  const transaction = await Transaction.findOne(
    buildPendingNftTransferQuery({ txHash, chain, network }),
  ).lean();

  if (!transaction) {
    throw AppError.notFound("Pending NFT transfer transaction not found");
  }

  return reconcileNftTransferTransaction(transaction);
}

async function reconcilePendingNftTransfers({ chain, network, limit } = {}) {
  const normalizedLimit = normalizeBatchLimit(limit);
  const transactions = await Transaction.find(
    buildPendingNftTransferQuery({ chain, network }),
  )
    .sort({ createdAt: 1 })
    .limit(normalizedLimit)
    .lean();

  const results = [];

  for (const transaction of transactions) {
    try {
      results.push(await reconcileNftTransferTransaction(transaction));
    } catch (error) {
      results.push({
        transactionId: transaction?._id ? String(transaction._id) : null,
        txHash: normalizeTxHash(transaction?.txHash),
        outcome: "error",
        error: serializeReconciliationError(error),
      });
    }
  }

  return {
    count: results.length,
    results,
  };
}

module.exports = {
  buildPendingNftTransferQuery,
  isEligibleNftTransferTransaction,
  reconcileNftTransferTransaction,
  reconcileNftTransferByHash,
  reconcilePendingNftTransfers,
};
