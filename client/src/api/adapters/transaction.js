import { normalizeChainCode } from "../../config/chains";

function normalizeDirection(direction) {
  if (direction === "incoming" || direction === "credit" || direction === "received") {
    return "incoming";
  }

  return "outgoing";
}

function normalizeTimestampValue(value) {
  if (!value) {
    return null;
  }

  const parsedTimestamp = new Date(value).getTime();
  if (Number.isNaN(parsedTimestamp)) {
    return null;
  }

  return new Date(parsedTimestamp).toISOString();
}

function normalizeConsensusTimestampValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const parsedSeconds = Number.parseFloat(normalized);
  if (!Number.isFinite(parsedSeconds)) {
    return null;
  }

  return normalizeTimestampValue(new Date(parsedSeconds * 1000));
}

export function resolveTransactionDisplayTimestamp(transaction = {}) {
  return (
    normalizeTimestampValue(transaction.timestamp) ||
    normalizeConsensusTimestampValue(transaction.consensus_timestamp) ||
    normalizeTimestampValue(transaction.block_time) ||
    normalizeTimestampValue(transaction.chainTimestamp) ||
    normalizeTimestampValue(transaction.confirmed_at) ||
    normalizeTimestampValue(transaction.confirmedAt) ||
    normalizeTimestampValue(transaction.createdAt) ||
    normalizeTimestampValue(transaction.updatedAt) ||
    null
  );
}

function normalizeExecutionParamsForRequest(payload = {}) {
  const chain = normalizeChainCode(payload.chain);
  const executionParams =
    payload.executionParams && typeof payload.executionParams === "object"
      ? payload.executionParams
      : {};

  if (chain === "xrp") {
    const rawDestinationTag =
      payload.destinationTag ?? executionParams.destinationTag ?? null;

    if (rawDestinationTag === null || rawDestinationTag === undefined || rawDestinationTag === "") {
      return undefined;
    }

    return {
      destinationTag:
        typeof rawDestinationTag === "string" ? rawDestinationTag.trim() : rawDestinationTag,
    };
  }

  if (chain === "solana") {
    return undefined;
  }

  if (chain === "aptos") {
    return undefined;
  }

  if (!Object.keys(executionParams).length) {
    return undefined;
  }

  return executionParams;
}

export function buildCanonicalTransactionRequest(payload = {}) {
  const request = {
    walletId: String(payload.walletId || ""),
    destinationAddress: String(payload.destinationAddress || "").trim(),
  };

  const asset = String(payload.asset || "").trim();
  if (asset) {
    request.asset = asset;
  }

  if (payload.sendMax !== undefined) {
    request.sendMax = Boolean(payload.sendMax);
  }

  if (payload.amount !== undefined && payload.amount !== null && payload.amount !== "") {
    request.amount = String(payload.amount);
  }

  const executionParams = normalizeExecutionParamsForRequest(payload);

  if (executionParams && Object.keys(executionParams).length) {
    request.executionParams = executionParams;
  }

  return request;
}

function normalizeExecutionParams(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

export function normalizeNftMetadata(transaction = {}) {
  const metadata = normalizeObject(transaction.metadata);
  const metadataNft = normalizeObject(metadata.nft);
  const directNft = normalizeObject(transaction.nft);

  // Aggressive identifier resolution
  const tokenId = normalizeString(
    directNft.tokenId || 
    metadataNft.tokenId || 
    transaction.tokenId || 
    directNft.nftId || 
    metadataNft.nftId || 
    directNft.id || 
    metadataNft.id ||
    ""
  );

  return {
    id: tokenId,
    nftId: tokenId,
    appId: normalizeString(directNft.appId || metadataNft.appId),
    tokenId,
    contractAddress: normalizeString(
      directNft.contractAddress ||
        metadataNft.contractAddress ||
        transaction.contractAddress,
    ),
    standard: normalizeString(
      directNft.standard || metadataNft.standard || transaction.standard,
    ).toUpperCase(),
    collectionName: normalizeString(
      directNft.collectionName || metadataNft.collectionName,
    ),
    collectionSymbol: normalizeString(
      directNft.collectionSymbol || metadataNft.collectionSymbol,
    ),
    name: normalizeString(directNft.name || metadataNft.name || metadata.name),
    imageUrl: normalizeString(
      directNft.imageUrl ||
        metadataNft.imageUrl ||
        directNft.thumbnailUrl ||
        metadataNft.thumbnailUrl ||
        metadata.imageUrl
    ),
    metadataUrl: normalizeString(directNft.metadataUrl || metadataNft.metadataUrl),
    ownerAddress: normalizeString(
      directNft.ownerAddress || metadataNft.ownerAddress || transaction.fromAddress,
    ),
  };
}

export function isNftTransactionRecord(transaction = {}, metadata = {}, nft = {}) {
  const assetType = normalizeString(transaction.assetType || metadata.assetType).toLowerCase();
  
  // 1. Explicit Indicator from backend
  if (assetType === "nft") {
    return true;
  }

  // 2. Identify from known NFT standards
  const standard = normalizeString(
    transaction.standard || nft?.standard || metadata?.standard
  ).toUpperCase();
  
  const nftStandards = ["ERC721", "ERC1155", "TRC721", "TRC1155", "NFT"];
  if (nftStandards.some(s => standard.includes(s))) {
    return true;
  }

  // 3. Metadata presence check (trusted fallback)
  const metadataNft = normalizeObject(metadata?.nft || transaction.metadata?.nft);
  const directNft = normalizeObject(transaction.nft);
  
  const hasNftObject = Object.keys(metadataNft).length > 0 || Object.keys(directNft).length > 0;
  const hasNftMetadata = Boolean(normalizeString(nft?.name || nft?.imageUrl));

  if (hasNftObject || hasNftMetadata) {
     // Safeguard: Even if metadata objects exist, don't misclassify common native gas tokens.
     // If it has a specific tokenId, it's almost certainly an NFT regardless of standard.
     if (normalizeString(nft?.tokenId)) return true;
     
     const isExplicitFungibleStandard = ["ERC20", "TRC20", "BEP20", "NATIVE", "TOKEN", "XRP"].includes(standard);
     if (!isExplicitFungibleStandard) return true;
     
     // Special case: Some NFTs are wrongly labeled as ERC20 but have NFT names.
     if (hasNftMetadata && standard === "ERC20") return true;
  }

  // 4. Identity combination fallback
  if (normalizeString(nft?.tokenId) && normalizeString(transaction.contractAddress || nft?.contractAddress)) {
    return true;
  }

  return false;
}

export function normalizeDestinationValidation(payload = {}) {
  const executionParams = normalizeExecutionParams(payload.executionParams);

  return {
    ...payload,
    walletId: String(payload.walletId || ""),
    chain: normalizeChainCode(payload.chain),
    network: String(payload.network || "").toLowerCase(),
    destinationAddress: String(payload.destinationAddress || "").trim(),
    executionParams,
    destinationTag: payload.destinationTag ?? executionParams.destinationTag ?? null,
    isInternal: Boolean(payload.isInternal),
    internalWalletId: payload.internalWalletId ? String(payload.internalWalletId) : "",
  };
}

export function normalizeTransactionPreview(payload = {}) {
  const executionParams = normalizeExecutionParams(payload.executionParams);

  return {
    ...payload,
    walletId: String(payload.walletId || ""),
    chain: normalizeChainCode(payload.chain),
    network: String(payload.network || "").toLowerCase(),
    fromAddress: String(payload.fromAddress || ""),
    toAddress: String(payload.toAddress || ""),
    amount: String(payload.amount ?? "0"),
    amountBaseUnits: String(payload.amountBaseUnits ?? "0"),
    asset: String(payload.asset || payload.currency || "").trim(),
    currency: String(payload.currency || payload.asset || "").trim(),
    transactionType: String(payload.transactionType || ""),
    direction: normalizeDirection(payload.direction),
    networkFee: String(payload.networkFee ?? "0"),
    networkFeeBaseUnits: String(payload.networkFeeBaseUnits ?? "0"),
    platformFee: String(payload.platformFee ?? "0"),
    platformFeeBaseUnits: String(payload.platformFeeBaseUnits ?? "0"),
    totalDebit: String(payload.totalDebit ?? "0"),
    totalDebitBaseUnits: String(payload.totalDebitBaseUnits ?? "0"),
    recipientGets: String(payload.recipientGets ?? payload.amount ?? "0"),
    recipientGetsBaseUnits: String(payload.recipientGetsBaseUnits ?? payload.amountBaseUnits ?? "0"),
    availableBalance: String(payload.availableBalance ?? "0"),
    availableBalanceBaseUnits: String(payload.availableBalanceBaseUnits ?? "0"),
    samePlatformRecipient: Boolean(payload.samePlatformRecipient),
    samePlatformRecipientWalletId: String(
      payload.samePlatformRecipientWalletId ??
        payload.platformRecipientWalletId ??
        "",
    ),
    samePlatformRecipientUserId: String(
      payload.samePlatformRecipientUserId ??
        payload.platformRecipientUserId ??
        "",
    ),
    executionParams,
    destinationTag: payload.destinationTag ?? executionParams.destinationTag ?? null,
  };
}

export function normalizeTransactionRecord(transaction = {}) {
  const id = String(transaction.id || transaction._id || transaction.transactionId || transaction.txHash || "");
  const direction = normalizeDirection(transaction.direction);
  const destinationTag =
    transaction.destinationTag ?? transaction.executionParams?.destinationTag ?? null;
  const metadata = normalizeObject(transaction.metadata);
  const nft = normalizeNftMetadata(transaction);
  const assetType = normalizeString(transaction.assetType).toLowerCase();
  const standard = normalizeString(transaction.standard || nft.standard).toUpperCase();
  const block_time = normalizeTimestampValue(transaction.block_time);
  const confirmed_at = normalizeTimestampValue(transaction.confirmed_at);
  const chainTimestamp = normalizeTimestampValue(transaction.chainTimestamp);
  const confirmedAt = normalizeTimestampValue(transaction.confirmedAt);
  const createdAt = normalizeTimestampValue(transaction.createdAt);
  const updatedAt = normalizeTimestampValue(transaction.updatedAt);
  const timestamp = normalizeTimestampValue(transaction.timestamp);
  const consensusTimestamp = normalizeConsensusTimestampValue(transaction.consensus_timestamp);
  const displayTimestamp = resolveTransactionDisplayTimestamp({
    timestamp,
    consensus_timestamp: consensusTimestamp,
    block_time,
    confirmed_at,
    chainTimestamp,
    confirmedAt,
    createdAt,
    updatedAt,
  });

  return {
    ...transaction,
    id,
    _id: id || transaction._id || "",
    walletId: String(transaction.walletId || ""),
    chain: normalizeChainCode(transaction.chain),
    network: String(transaction.network || "").toLowerCase(),
    amount: String(transaction.amount ?? "0"),
    asset: String(transaction.asset || transaction.currency || "").trim(),
    currency: String(transaction.currency || transaction.asset || "").trim(),
    assetType,
    standard,
    status: String(transaction.status || ""),
    systemStatus: normalizeString(transaction.systemStatus).toLowerCase(),
    direction,
    transactionType: String(transaction.transactionType || ""),
    txHash: String(transaction.txHash || ""),
    explorerUrl: normalizeString(transaction.explorerUrl),
    contractAddress: normalizeString(transaction.contractAddress || nft.contractAddress),
    tokenId: normalizeString(transaction.tokenId || nft.tokenId),
    destinationTag,
    block_time,
    confirmed_at,
    chainTimestamp,
    confirmedAt,
    createdAt,
    updatedAt,
    timestamp,
    consensus_timestamp: consensusTimestamp,
    displayTimestamp,
    fromAddress: String(transaction.fromAddress || ""),
    toAddress: String(transaction.toAddress || ""),
    samePlatformRecipient: Boolean(transaction.samePlatformRecipient),
    samePlatformRecipientWalletId: String(
      transaction.samePlatformRecipientWalletId ??
        transaction.platformRecipientWalletId ??
        "",
    ),
    samePlatformRecipientUserId: String(
      transaction.samePlatformRecipientUserId ??
        transaction.platformRecipientUserId ??
        "",
    ),
    executionParams:
      transaction.executionParams && typeof transaction.executionParams === "object"
        ? transaction.executionParams
        : {},
    metadata,
    nft,
    isNft: isNftTransactionRecord(transaction, metadata, nft),
    validated: Boolean(transaction.validated ?? false),
    succeeded: Boolean(transaction.succeeded ?? false),
    confirmations: Number(transaction.confirmations ?? 0),
    chainStatus: String(transaction.chainStatus || "").trim().toLowerCase(),
    networkFeeAsset: String(transaction.networkFeeAsset || "").trim(),
    networkFeeCurrency: String(transaction.networkFeeCurrency || "").trim(),
    networkFeeAssetType: String(transaction.networkFeeAssetType || "").trim(),
  };
}

export function normalizeTransactionList(payload) {
  const items = Array.isArray(payload) ? payload : payload?.data;

  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((transaction) => normalizeTransactionRecord(transaction));
}

export function normalizeTransactionDetail(payload) {
  return normalizeTransactionRecord(payload);
}

export function normalizeTransactionSyncResult(payload) {
  const result = payload && typeof payload === "object" ? payload : {};

  return {
    created: Number(result.created || 0),
    updated: Number(result.updated || 0),
    scanned: Number(result.scanned || 0),
  };
}
