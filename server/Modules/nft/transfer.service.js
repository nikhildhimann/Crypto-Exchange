const Wallet = require("../wallet/model");
const NFTAsset = require("./model");
const NFTSyncState = require("./nftSyncState.model");
const Transaction = require("../transaction/model");
const signingService = require("../security/signing.service");
const socket = require("../../lib/socket");
const logger = require("../../common/utils/logger");
const { normalizeAddress } = require("./mapper");
const { mapNftTransferResponse } = require("./response.mapper");
const { normalizeTxHash } = require("../../common/utils/txHash");
const { assertChainFeature } = require("../../common/utils/chain");
const {
  buildPendingNftHistoryUniqueKey,
  getNftStandardStorageVariants,
  normalizeNftDirection,
  normalizeNftHistoryIdentity,
  normalizeNftContractAddress,
  normalizeNftStandard,
  normalizeNftTokenId,
} = require("./history.utils");
const {
  buildWalletVisibilityFilter,
  isWalletArchived,
} = require("../../common/utils/walletState");
const { scheduleWalletNftRefresh } = require("./refresh.service");
const { AppError } = require("../../helpers/errors");

const SUPPORTED_TRANSFER_CHAIN = "polygon";
const SUPPORTED_STANDARDS = new Set(["erc721", "erc1155"]);
const DUPLICATE_TRANSFER_WINDOW_MS = 10 * 60 * 1000;
const DUPLICATE_PENDING_SYSTEM_STATUSES = Object.freeze([
  "submitting",
  "submitted_to_chain",
]);
const DUPLICATE_PENDING_CHAIN_STATUSES = Object.freeze([
  "pending_submission",
  "submitted",
]);

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveAssetLabel(nft) {
  return (
    String(
      nft?.collectionSymbol || nft?.collectionName || nft?.name || "NFT",
    ).trim() || "NFT"
  );
}

function buildTransferMetadata({ nft, wallet }) {
  const normalizedContractAddress = normalizeNftContractAddress(
    nft.contractAddress,
  );
  const normalizedTokenId = normalizeNftTokenId(nft.tokenId);
  const normalizedStandard = normalizeNftStandard(nft.standard || "erc721");

  return {
    source: "nft_transfer",
    nft: {
      nftId: String(nft._id),
      appId: nft.appId || null,
      standard: normalizedStandard,
      contractAddress: normalizedContractAddress,
      tokenId: normalizedTokenId,
      ownerAddress: nft.ownerAddress || wallet.address,
      collectionName: nft.collectionName || "",
      collectionSymbol: nft.collectionSymbol || "",
      name: nft.name || "",
      imageUrl: nft.imageUrl || nft.thumbnailUrl || null,
      metadataUrl: nft.metadataUrl || null,
    },
  };
}

function serializeError(error) {
  return {
    message: error?.message || "Unknown error",
    reason: error?.reason || null,
    shortMessage: error?.shortMessage || null,
    code: error?.code || null,
    status: error?.status || null,
    txHash:
      error?.transactionHash || error?.hash || error?.receipt?.hash || null,
  };
}

async function resolveOwnedWallet({ userId, walletId }) {
  const wallet = await Wallet.findOne({
    _id: walletId,
    userId,
    ...buildWalletVisibilityFilter({ includeHidden: true }),
  }).lean();

  if (!wallet) {
    throw AppError.notFound("Wallet not found");
  }

  if (isWalletArchived(wallet)) {
    throw AppError.validation("Wallet is archived");
  }

  if (!wallet.address) {
    throw AppError.validation("Wallet address is missing");
  }

  return wallet;
}

async function resolveTransferableNft({ userId, nftId, wallet }) {
  const nft = await NFTAsset.findOne({
    _id: nftId,
    userId,
  }).lean();

  if (!nft) {
    throw AppError.notFound("NFT not found");
  }

  if (String(nft.walletId) !== String(wallet._id)) {
    throw AppError.validation("NFT does not belong to the selected wallet");
  }

  if (String(nft.chain || "").toLowerCase() !== SUPPORTED_TRANSFER_CHAIN) {
    throw AppError.validation("NFT transfers currently support Polygon only");
  }

  if (!SUPPORTED_STANDARDS.has(normalizeNftStandard(nft.standard || "erc721"))) {
    throw AppError.validation(
      "NFT transfers are only supported for ERC-721 and ERC-1155 tokens",
    );
  }

  if (!String(nft.contractAddress || "").trim()) {
    throw AppError.validation("NFT contract address is missing");
  }

  if (
    nft.tokenId === undefined ||
    nft.tokenId === null ||
    String(nft.tokenId).trim() === ""
  ) {
    throw AppError.validation("NFT token id is missing");
  }

  const walletAddress = normalizeAddress(wallet.address);
  const nftOwnerAddress = normalizeAddress(nft.ownerAddress);

  if (!nftOwnerAddress || nftOwnerAddress !== walletAddress) {
    throw AppError.validation("NFT is not owned by the selected wallet");
  }

  return nft;
}

function resolveTransferContext(wallet) {
  const context = assertChainFeature(wallet.chain, wallet.network, "send");

  if (context.chain !== SUPPORTED_TRANSFER_CHAIN) {
    throw AppError.validation("NFT transfers currently support Polygon only");
  }

  if (typeof context.adapter?.nftTransfer?.submitTransfer !== "function") {
    throw AppError.notImplemented(
      `NFT transfers are not available for chain "${context.chain}" yet`,
    );
  }

  return context;
}

function validateRecipientAddress(context, toAddress) {
  const normalizedAddress = String(toAddress || "").trim();

  if (!normalizedAddress) {
    throw AppError.validation("Recipient address is required");
  }

  if (!context.adapter.wallet.validateAddress(normalizedAddress)) {
    throw AppError.validation("Invalid Polygon recipient address");
  }

  return normalizedAddress;
}

async function assertNoRecentDuplicateTransfer({
  wallet,
  nft,
  toAddress,
  amount,
}) {
  const normalizedRecipientAddress = String(toAddress || "").trim();
  const normalizedContractAddress = normalizeNftContractAddress(
    nft.contractAddress,
  );
  const normalizedTokenId = normalizeNftTokenId(nft.tokenId);
  const normalizedStandard = normalizeNftStandard(nft.standard || "erc721");
  const createdAfter = new Date(Date.now() - DUPLICATE_TRANSFER_WINDOW_MS);
  const existing = await Transaction.findOne({
    walletId: wallet._id,
    chain: wallet.chain,
    network: wallet.network,
    contractAddress: {
      $regex: `^${escapeRegex(normalizedContractAddress)}$`,
      $options: "i",
    },
    toAddress: {
      $regex: `^${escapeRegex(normalizedRecipientAddress)}$`,
      $options: "i",
    },
    amount: String(amount || "1"),
    assetType: "nft",
    standard: {
      $in: getNftStandardStorageVariants(normalizedStandard),
    },
    direction: "outgoing",
    "metadata.nft.tokenId": normalizedTokenId,
    createdAt: { $gte: createdAfter },
    $or: [
      { status: "pending" },
      {
        systemStatus: {
          $in: Array.from(DUPLICATE_PENDING_SYSTEM_STATUSES),
        },
      },
      {
        chainStatus: {
          $in: Array.from(DUPLICATE_PENDING_CHAIN_STATUSES),
        },
      },
    ],
  })
    .select({
      _id: 1,
      txHash: 1,
      status: 1,
      systemStatus: 1,
      chainStatus: 1,
      createdAt: 1,
    })
    .lean();

  if (!existing) {
    return null;
  }

  throw AppError.conflict(
    "A transfer for this NFT to the same recipient with the same amount is already pending",
  );
}

async function createPendingTransaction({ wallet, nft, toAddress, amount }) {
  const assetLabel = resolveAssetLabel(nft);
  const nftStandard = normalizeNftStandard(nft.standard || "ERC721");
  // ERC721 always transfers exactly 1. ERC1155 uses the caller-supplied amount.
  const transferAmount = nftStandard === "erc1155" ? String(amount) : "1";

  const contractAddressLowerCase = normalizeNftContractAddress(
    nft.contractAddress,
  );
  const normalizedTokenId = normalizeNftTokenId(nft.tokenId);
  const historyUniqueKey = buildPendingNftHistoryUniqueKey({
    walletId: wallet._id,
    contractAddress: contractAddressLowerCase,
    tokenId: normalizedTokenId,
    direction: "outgoing",
    standard: nftStandard,
    createdAt: Date.now(),
  });

  return Transaction.create({
    userId: wallet.userId,
    accountId: wallet.accountId || null,
    walletId: wallet._id,
    chain: wallet.chain,
    network: wallet.network,
    type: "transfer",
    transactionType: "external",
    direction: "outgoing",
    fromAddress: wallet.address,
    toAddress,
    executionParams: {},
    amount: transferAmount,
    amountBaseUnits: transferAmount,
    currency: assetLabel,
    asset: assetLabel,
    assetType: "nft",
    standard: nftStandard,
    contractAddress: contractAddressLowerCase,
    networkFee: "0",
    networkFeeBaseUnits: "0",
    networkFeeAsset: wallet.asset || null,
    networkFeeCurrency: wallet.asset || null,
    networkFeeAssetType: "native",
    platformFee: "0",
    platformFeeBaseUnits: "0",
    totalDebit: transferAmount,
    totalDebitBaseUnits: transferAmount,
    totalDebitAsset: assetLabel,
    totalDebitCurrency: assetLabel,
    totalDebitAssetType: "nft",
    recipientGets: transferAmount,
    recipientGetsBaseUnits: transferAmount,
    validated: false,
    succeeded: false,
    confirmations: 0,
    chainStatus: "pending_submission",
    systemStatus: "submitting",
    status: "pending",
    historyUniqueKey,
    rawRequest: {
      nftId: String(nft._id),
      contractAddress: contractAddressLowerCase,
      tokenId: normalizedTokenId,
      standard: nftStandard,
      toAddress,
      amount: transferAmount,
    },
    metadata: buildTransferMetadata({ nft, wallet }),
  });
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

function isFinalizedNftTransaction(transaction = {}) {
  return (
    transaction?.validated === true ||
    ["success", "failed"].includes(
      String(transaction?.status || "").trim().toLowerCase(),
    ) ||
    ["confirmed", "confirmed_failed", "submission_failed"].includes(
      String(transaction?.systemStatus || "").trim().toLowerCase(),
    ) ||
    ["confirmed", "failed", "submission_failed"].includes(
      String(transaction?.chainStatus || "").trim().toLowerCase(),
    )
  );
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function buildMergedSubmissionMetadata({
  existingTransaction,
  pendingTransaction,
  identity,
}) {
  const existingMetadata = normalizeObject(existingTransaction?.metadata);
  const pendingMetadata = normalizeObject(pendingTransaction?.metadata);
  const existingNftMetadata = normalizeObject(existingMetadata.nft);
  const pendingNftMetadata = normalizeObject(pendingMetadata.nft);

  return {
    ...existingMetadata,
    ...pendingMetadata,
    nft: {
      ...existingNftMetadata,
      ...pendingNftMetadata,
      contractAddress: identity.contractAddress,
      tokenId: identity.tokenId,
      standard: identity.standard,
      ownerAddress:
        pendingNftMetadata.ownerAddress ||
        existingNftMetadata.ownerAddress ||
        pendingTransaction?.fromAddress ||
        existingTransaction?.fromAddress ||
        null,
      submittedTxHash:
        identity.txHash ||
        existingNftMetadata.submittedTxHash ||
        pendingNftMetadata.submittedTxHash ||
        null,
    },
  };
}

async function findCanonicalConflictTransaction({
  pendingTransaction,
  canonicalHistoryUniqueKey,
  normalizedTxHash,
}) {
  return Transaction.findOne({
    walletId: pendingTransaction.walletId,
    chain: pendingTransaction.chain,
    assetType: "nft",
    _id: { $ne: pendingTransaction._id },
    $or: [
      { historyUniqueKey: canonicalHistoryUniqueKey },
      { txHash: normalizedTxHash },
    ],
  })
    .sort({ validated: -1, succeeded: -1, chainTimestamp: -1, createdAt: 1 })
    .lean();
}

async function mergeSubmittedTransferIntoExisting({
  pendingTransaction,
  existingTransaction,
  identity,
  submission,
  submittedAt,
}) {
  const existingFinalized = isFinalizedNftTransaction(existingTransaction);
  const mergedMetadata = buildMergedSubmissionMetadata({
    existingTransaction,
    pendingTransaction,
    identity,
  });
  const mergedRawRequest = {
    ...normalizeObject(existingTransaction?.rawRequest),
    ...normalizeObject(pendingTransaction?.rawRequest),
    ...normalizeObject(submission?.rawRequest),
    contractAddress: identity.contractAddress,
    tokenId: identity.tokenId,
    standard: identity.standard,
    toAddress:
      submission?.toAddress ||
      pendingTransaction?.toAddress ||
      existingTransaction?.toAddress ||
      "",
  };
  const mergedRawResponse = {
    ...normalizeObject(existingTransaction?.rawResponse),
    ...normalizeObject(pendingTransaction?.rawResponse),
    ...normalizeObject(submission?.rawResponse),
  };
  const update = {
    txHash: identity.txHash,
    historyUniqueKey: identity.canonicalHistoryUniqueKey,
    standard: identity.standard,
    contractAddress: identity.contractAddress,
    rawRequest: mergedRawRequest,
    rawResponse: mergedRawResponse,
    metadata: mergedMetadata,
    chainTimestamp:
      existingTransaction?.chainTimestamp ||
      pendingTransaction?.chainTimestamp ||
      submittedAt,
  };

  if (!existingFinalized) {
    update.validated = false;
    update.succeeded = false;
    update.chainStatus = submission?.chainStatus || "submitted";
    update.systemStatus = "submitted_to_chain";
    update.status = "pending";
  }

  let mergedTransaction = null;

  try {
    mergedTransaction = await Transaction.findByIdAndUpdate(
      existingTransaction._id,
      {
        $set: update,
        $unset: {
          errorMessage: 1,
        },
      },
      { new: true },
    ).lean();
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    mergedTransaction = await findCanonicalConflictTransaction({
      pendingTransaction,
      canonicalHistoryUniqueKey: identity.canonicalHistoryUniqueKey,
      normalizedTxHash: identity.txHash,
    });
  }

  await Transaction.deleteOne({ _id: pendingTransaction._id }).catch(() => null);

  if (mergedTransaction) {
    socket.emitTransactionUpdate(mergedTransaction);
    return mergedTransaction;
  }

  throw AppError.internal("Failed to merge duplicate NFT transfer transaction");
}

async function markTransferSubmitted({ transactionId, submission }) {
  const pendingTransaction = await Transaction.findById(transactionId)
    .select({
      _id: 1,
      walletId: 1,
      chain: 1,
      network: 1,
      historyUniqueKey: 1,
      txHash: 1,
      fromAddress: 1,
      toAddress: 1,
      rawRequest: 1,
      rawResponse: 1,
      status: 1,
      chainStatus: 1,
      systemStatus: 1,
      validated: 1,
      succeeded: 1,
      chainTimestamp: 1,
      contractAddress: 1,
      tokenId: 1,
      direction: 1,
      standard: 1,
      metadata: 1,
    })
    .lean();

  if (!pendingTransaction) {
    throw AppError.internal("Failed to persist NFT transfer transaction");
  }

  const normalizedTxHash = normalizeTxHash(submission?.txHash);
  if (!normalizedTxHash) {
    throw AppError.validation("NFT transfer submission requires a tx hash");
  }

  const submittedAt = submission?.submittedAt
    ? new Date(submission.submittedAt)
    : new Date();
  const identity = normalizeNftHistoryIdentity({
    txHash: normalizedTxHash,
    contractAddress:
      pendingTransaction.metadata?.nft?.contractAddress ||
      pendingTransaction.contractAddress,
    tokenId:
      pendingTransaction.metadata?.nft?.tokenId || pendingTransaction.tokenId,
    direction:
      pendingTransaction.direction || normalizeNftDirection("outgoing"),
    standard:
      pendingTransaction.metadata?.nft?.standard || pendingTransaction.standard,
  });
  const existingCanonicalTransaction = await findCanonicalConflictTransaction({
    pendingTransaction,
    canonicalHistoryUniqueKey: identity.canonicalHistoryUniqueKey,
    normalizedTxHash,
  });

  if (existingCanonicalTransaction) {
    return mergeSubmittedTransferIntoExisting({
      pendingTransaction,
      existingTransaction: existingCanonicalTransaction,
      identity,
      submission,
      submittedAt,
    });
  }

  let transaction = null;

  try {
    transaction = await Transaction.findByIdAndUpdate(
      transactionId,
      {
        $set: {
          txHash: normalizedTxHash,
          historyUniqueKey: identity.canonicalHistoryUniqueKey,
          chainStatus: submission.chainStatus || "submitted",
          systemStatus: "submitted_to_chain",
          status: "pending",
          chainTimestamp: submittedAt,
          standard: identity.standard,
          contractAddress: identity.contractAddress,
          rawRequest: {
            ...normalizeObject(pendingTransaction.rawRequest),
            ...normalizeObject(submission.rawRequest),
            contractAddress: identity.contractAddress,
            tokenId: identity.tokenId,
            standard: identity.standard,
          },
          rawResponse: {
            ...normalizeObject(pendingTransaction.rawResponse),
            ...normalizeObject(submission.rawResponse),
          },
          "metadata.nft.contractAddress": identity.contractAddress,
          "metadata.nft.tokenId": identity.tokenId,
          "metadata.nft.standard": identity.standard,
          "metadata.nft.submittedTxHash": identity.txHash,
        },
        $unset: {
          errorMessage: 1,
        },
      },
      { new: true },
    ).lean();
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const racedCanonicalTransaction = await findCanonicalConflictTransaction({
      pendingTransaction,
      canonicalHistoryUniqueKey: identity.canonicalHistoryUniqueKey,
      normalizedTxHash,
    });

    if (!racedCanonicalTransaction) {
      throw error;
    }

    return mergeSubmittedTransferIntoExisting({
      pendingTransaction,
      existingTransaction: racedCanonicalTransaction,
      identity,
      submission,
      submittedAt,
    });
  }

  if (transaction) {
    socket.emitTransactionUpdate(transaction);
    return transaction;
  }

  throw AppError.internal("Failed to persist NFT transfer transaction");
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

async function markTransferFailed({ transactionId, error }) {
  const transaction = await Transaction.findByIdAndUpdate(
    transactionId,
    {
      $set: {
        validated: false,
        succeeded: false,
        chainStatus: "submission_failed",
        systemStatus: "submission_failed",
        status: "failed",
        errorMessage: error.message,
        rawResponse: {
          error: serializeError(error),
        },
      },
    },
    { new: true },
  ).lean();

  if (transaction) {
    socket.emitTransactionUpdate(transaction);
  }

  return transaction;
}

async function estimateNFTTransferFee({ userId, walletId, nftId, toAddress, amount }) {
  const wallet = await resolveOwnedWallet({ userId, walletId });
  const context = resolveTransferContext(wallet);
  const recipientAddress = validateRecipientAddress(context, toAddress);
  const normalizedSenderAddress = normalizeAddress(wallet.address);
  const normalizedRecipientAddress = normalizeAddress(recipientAddress);

  if (normalizedSenderAddress === normalizedRecipientAddress) {
    throw AppError.validation(
      "Cannot transfer an NFT to the same wallet address",
    );
  }

  const nft = await resolveTransferableNft({ userId, nftId, wallet });
  const nftStandard = normalizeNftStandard(nft.standard || "erc721");

  let resolvedAmount;
  if (nftStandard === "erc1155") {
    const parsedAmount = String(amount || "").trim();
    if (!parsedAmount) {
      throw AppError.validation("Amount is required for ERC-1155 transfers");
    }
    let amountBigInt;
    try {
      amountBigInt = BigInt(parsedAmount);
    } catch {
      throw AppError.validation("Amount must be a valid integer");
    }
    if (amountBigInt <= 0n) {
      throw AppError.validation("Amount must be greater than zero");
    }
    const balanceBigInt = BigInt(String(nft.balance || "0"));
    if (amountBigInt > balanceBigInt) {
      throw AppError.validation("Amount exceeds available NFT balance");
    }
    resolvedAmount = parsedAmount;
  } else {
    resolvedAmount = "1";
  }

  if (typeof context.adapter?.nftTransfer?.estimateTransferFee !== "function") {
    throw AppError.notImplemented("Fee estimation is not available for this chain");
  }

  return await context.adapter.nftTransfer.estimateTransferFee({
    network: wallet.network,
    fromAddress: wallet.address,
    toAddress: recipientAddress,
    contractAddress: nft.contractAddress,
    tokenId: nft.tokenId,
    standard: nft.standard,
    amount: resolvedAmount,
  });
}

async function transferNFT({ userId, walletId, nftId, toAddress, amount }) {
  const wallet = await resolveOwnedWallet({ userId, walletId });
  const context = resolveTransferContext(wallet);
  const recipientAddress = validateRecipientAddress(context, toAddress);
  const normalizedSenderAddress = normalizeAddress(wallet.address);
  const normalizedRecipientAddress = normalizeAddress(recipientAddress);

  if (normalizedSenderAddress === normalizedRecipientAddress) {
    throw AppError.validation(
      "Cannot transfer an NFT to the same wallet address",
    );
  }

  const nft = await resolveTransferableNft({ userId, nftId, wallet });
  const nftStandard = normalizeNftStandard(nft.standard || "erc721");

  // --- Resolve and validate amount by standard ---
  let resolvedAmount;
  if (nftStandard === "erc1155") {
    const parsedAmount = String(amount || "").trim();
    if (!parsedAmount) {
      throw AppError.validation("Amount is required for ERC-1155 transfers");
    }
    let amountBigInt;
    try {
      amountBigInt = BigInt(parsedAmount);
    } catch {
      throw AppError.validation("Amount must be a valid integer");
    }
    if (amountBigInt <= 0n) {
      throw AppError.validation("Amount must be greater than zero");
    }
    const balanceBigInt = BigInt(String(nft.balance || "0"));
    if (amountBigInt > balanceBigInt) {
      throw AppError.validation("Amount exceeds available NFT balance");
    }
    resolvedAmount = parsedAmount;
  } else {
    // ERC721: amount is always 1, input is ignored
    resolvedAmount = "1";
  }

  await assertNoRecentDuplicateTransfer({
    wallet,
    nft,
    toAddress: recipientAddress,
    amount: resolvedAmount,
  });
  const mnemonic = await signingService.getWalletMnemonic(wallet._id, userId);
  const pendingTransaction = await createPendingTransaction({
    wallet,
    nft,
    toAddress: recipientAddress,
    amount: resolvedAmount,
  });

  socket.emitTransactionNew(pendingTransaction);

  try {
    const submission = await context.adapter.nftTransfer.submitTransfer({
      network: wallet.network,
      mnemonic,
      fromAddress: wallet.address,
      toAddress: recipientAddress,
      contractAddress: nft.contractAddress,
      tokenId: nft.tokenId,
      standard: nft.standard,
      amount: resolvedAmount,
    });

    const transaction = await markTransferSubmitted({
      transactionId: pendingTransaction._id,
      submission,
    });
    await markWalletNftSyncStateStale({ wallet });

    scheduleWalletNftRefresh({
      userId: wallet.userId,
      walletId: String(wallet._id),
      chain: wallet.chain,
      reason: "nft_transfer_submitted",
      force: true,
    }).catch((refreshError) => {
      logger.warn("Post-transfer NFT refresh scheduling failed", {
        event: "nft_post_transfer_refresh_failed",
        userId: String(wallet.userId),
        walletId: String(wallet._id),
        chain: wallet.chain,
        reason: "nft_transfer_submitted",
        error:
          refreshError instanceof Error
            ? refreshError.message
            : String(refreshError),
      });
    });

    return mapNftTransferResponse({
      transaction,
      nft,
      wallet,
      submission,
    });
  } catch (error) {
    await markTransferFailed({
      transactionId: pendingTransaction._id,
      error,
    });
    throw error;
  }
}

module.exports = {
  estimateNFTTransferFee,
  transferNFT,
};
