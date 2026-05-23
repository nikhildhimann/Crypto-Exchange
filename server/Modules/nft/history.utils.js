const { normalizeTxHash } = require("../../common/utils/txHash");
const { AppError } = require("../../helpers/errors");

const NFT_PENDING_HISTORY_KEY_REGEX =
  /^[^:]+:pending:[^:]+:[^:]+:(incoming|outgoing):[A-Za-z0-9-]+:\d+$/;

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function normalizeNftDirection(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (normalized !== "incoming" && normalized !== "outgoing") {
    throw AppError.validation("NFT history unique key requires a valid direction");
  }

  return normalized;
}

function normalizeNftStandard(value, fallback = "erc721") {
  const normalized = normalizeString(value, fallback)
    .toLowerCase()
    .replace(/-/g, "");

  if (!normalized) {
    return fallback;
  }

  return normalized;
}

function normalizeNftContractAddress(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (!normalized) {
    throw AppError.validation(
      "NFT history unique key requires a contract address",
    );
  }

  return normalized;
}

function normalizeNftTokenId(value) {
  const normalized = normalizeString(value);

  if (!normalized) {
    throw AppError.validation("NFT history unique key requires a token id");
  }

  if (/^0x[0-9a-f]+$/i.test(normalized)) {
    return BigInt(normalized).toString();
  }

  if (/^-?\d+$/.test(normalized)) {
    return BigInt(normalized).toString();
  }

  return normalized;
}

function normalizeNftQuantity(value, fallback = "1") {
  const normalized = normalizeString(value, fallback);

  if (!normalized) {
    return fallback;
  }

  return normalized;
}

function normalizeOptionalDate(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function buildPendingNftHistoryUniqueKey({
  walletId,
  contractAddress,
  tokenId,
  direction,
  standard,
  createdAt = Date.now(),
}) {
  const normalizedWalletId = normalizeString(walletId);
  if (!normalizedWalletId) {
    throw AppError.validation(
      "Pending NFT history unique key requires a wallet id",
    );
  }

  const createdAtMs =
    createdAt instanceof Date ? createdAt.getTime() : Number(createdAt);
  const suffix = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();

  return [
    normalizedWalletId,
    "pending",
    normalizeNftContractAddress(contractAddress),
    normalizeNftTokenId(tokenId),
    normalizeNftDirection(direction),
    normalizeNftStandard(standard),
    String(suffix),
  ].join(":");
}

function buildNftHistoryUniqueKey({
  chain,
  txHash,
  logIndex,
  contractAddress,
  tokenId,
  direction,
}) {
  const normalizedTxHash = normalizeTxHash(txHash);
  if (!normalizedTxHash) {
    throw AppError.validation("NFT history unique key requires a tx hash");
  }

  const normalizedContractAddress = normalizeNftContractAddress(contractAddress);
  if (!normalizedContractAddress) {
    throw AppError.validation("NFT history unique key requires a contract address");
  }

  const normalizedTokenId = normalizeNftTokenId(tokenId);
  if (!normalizedTokenId && normalizedTokenId !== "0") {
    throw AppError.validation("NFT history unique key requires a token ID");
  }

  const normalizedDirection = normalizeNftDirection(direction);
  if (!normalizedDirection) {
    throw AppError.validation("NFT history unique key requires a direction");
  }

  const normalizedChain = chain ? String(chain).trim().toLowerCase() : "polygon";
  const normalizedLogIndex = logIndex !== undefined && logIndex !== null ? String(logIndex).trim().toLowerCase() : "0";

  return [
    normalizedChain,
    normalizedTxHash,
    normalizedLogIndex,
    normalizedContractAddress,
    normalizedTokenId,
    normalizedDirection,
  ].join(":");
}

function getNftTokenIdQueryVariants(value) {
  const variants = new Set();
  const rawValue = normalizeString(value);

  if (rawValue) {
    variants.add(rawValue);
  }

  const normalizedValue = normalizeNftTokenId(value);
  variants.add(normalizedValue);

  if (/^\d+$/.test(normalizedValue)) {
    variants.add(`0x${BigInt(normalizedValue).toString(16)}`);
  }

  return Array.from(variants);
}

function getNftStandardStorageVariants(value, fallback = "erc721") {
  const normalizedValue = normalizeNftStandard(value, fallback);
  return Array.from(
    new Set([normalizedValue, normalizedValue.toUpperCase()]),
  );
}

function isPendingNftHistoryUniqueKey(value) {
  return NFT_PENDING_HISTORY_KEY_REGEX.test(normalizeString(value));
}

function hasRealNftTxHash(value) {
  return Boolean(normalizeTxHash(value));
}

function normalizeNftHistoryIdentity(source = {}, options = {}) {
  const normalizedContractAddress = normalizeNftContractAddress(
    source?.contractAddress || source?.metadata?.nft?.contractAddress,
  );
  const normalizedTokenId = normalizeNftTokenId(
    source?.metadata?.nft?.tokenId || source?.tokenId,
  );
  const normalizedDirection = normalizeNftDirection(
    source?.direction || options.defaultDirection,
  );
  const normalizedStandard = normalizeNftStandard(
    source?.standard || source?.metadata?.nft?.standard || options.defaultStandard,
  );
  const normalizedTxHash = normalizeTxHash(source?.txHash);

  return {
    txHash: normalizedTxHash || null,
    contractAddress: normalizedContractAddress,
    tokenId: normalizedTokenId,
    direction: normalizedDirection,
    standard: normalizedStandard,
    tokenIdQueryVariants: getNftTokenIdQueryVariants(
      source?.metadata?.nft?.tokenId || source?.tokenId,
    ),
    standardQueryVariants: getNftStandardStorageVariants(
      source?.standard || source?.metadata?.nft?.standard || options.defaultStandard,
    ),
    canonicalHistoryUniqueKey: normalizedTxHash
      ? buildNftHistoryUniqueKey({
        chain: source?.chain,
        txHash: normalizedTxHash,
        logIndex: source?.logIndex,
        contractAddress: normalizedContractAddress,
        tokenId: normalizedTokenId,
        direction: normalizedDirection,
      })
      : null,
  };
}

function normalizeNftMetadata(metadata = {}, normalizedFields = {}) {
  const baseMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};
  const baseNftMetadata =
    baseMetadata.nft &&
      typeof baseMetadata.nft === "object" &&
      !Array.isArray(baseMetadata.nft)
      ? baseMetadata.nft
      : {};

  const merged = {
    ...baseMetadata,
    nft: {
      ...baseNftMetadata,
      contractAddress: normalizedFields.contractAddress,
      tokenId: normalizedFields.tokenId,
      standard: normalizedFields.standard,
    },
  };

  if (normalizedFields.collectionName !== undefined) {
    merged.nft.collectionName = normalizedFields.collectionName;
  }

  if (normalizedFields.name !== undefined) {
    merged.nft.name = normalizedFields.name;
  }

  if (normalizedFields.image !== undefined) {
    merged.nft.image = normalizedFields.image;
  }

  if (normalizedFields.amount !== undefined) {
    merged.nft.amount = normalizedFields.amount;
  }

  return merged;
}

function buildNftHistoryTransactionPayload({
  wallet,
  mapped = {},
  rawResponse,
  overrides = {},
}) {
  if (!wallet?._id || !wallet?.userId) {
    throw AppError.validation("Wallet is required for NFT history payload");
  }

  const identity = normalizeNftHistoryIdentity(mapped);
  const normalizedDirection = identity.direction;
  const normalizedContractAddress = identity.contractAddress;
  const normalizedTokenId = identity.tokenId;
  const normalizedStandard = identity.standard;
  const normalizedTxHash = identity.txHash;
  const normalizedLogIndex = normalizeString(mapped.logIndex);
  const normalizedAmountBaseUnits = normalizeNftQuantity(
    mapped.amountBaseUnits || mapped.transferAmount || mapped.amount,
    normalizedStandard === "erc1155" ? "1" : "1",
  );
  const normalizedAmount = normalizeNftQuantity(
    mapped.amount,
    normalizedAmountBaseUnits,
  );
  const chainTimestamp = normalizeOptionalDate(mapped.chainTimestamp);
  const confirmedAt =
    normalizeOptionalDate(mapped.confirmedAt) ||
    (mapped.validated === true ? chainTimestamp : null);
  const historyUniqueKey =
    identity.canonicalHistoryUniqueKey || normalizeString(mapped.historyUniqueKey);

  const metadata = normalizeNftMetadata(mapped.metadata, {
    contractAddress: normalizedContractAddress,
    tokenId: normalizedTokenId,
    standard: normalizedStandard,
    collectionName:
      mapped.metadata?.nft?.collectionName === undefined
        ? null
        : mapped.metadata?.nft?.collectionName,
    name:
      mapped.metadata?.nft?.name === undefined
        ? null
        : mapped.metadata?.nft?.name,
    image:
      mapped.metadata?.nft?.image === undefined
        ? null
        : mapped.metadata?.nft?.image,
    amount: normalizedAmountBaseUnits,
  });

  return {
    userId: wallet.userId,
    accountId: wallet.accountId || null,
    walletId: wallet._id,
    chain: wallet.chain,
    network: wallet.network,
    type: "transfer",
    transactionType: "external",
    direction: normalizedDirection,
    fromAddress: normalizeString(mapped.fromAddress),
    toAddress: normalizeString(mapped.toAddress),
    amount: normalizedAmount,
    amountBaseUnits: normalizedAmountBaseUnits,
    currency: normalizeString(mapped.currency || mapped.asset, "NFT"),
    asset: normalizeString(mapped.asset || mapped.currency, "NFT"),
    assetType: "nft",
    standard: normalizedStandard,
    contractAddress: normalizedContractAddress,
    networkFee: normalizeString(mapped.networkFee, "0"),
    networkFeeBaseUnits: normalizeString(mapped.networkFeeBaseUnits, "0"),
    networkFeeAsset: normalizeString(mapped.networkFeeAsset, "POL"),
    networkFeeCurrency: normalizeString(mapped.networkFeeCurrency, "POL"),
    networkFeeAssetType: normalizeString(mapped.networkFeeAssetType, "native"),
    validated: mapped.validated === true,
    succeeded: mapped.succeeded === true,
    status:
      mapped.chainStatus === "confirmed" && mapped.succeeded === true
        ? "success"
        : normalizeString(mapped.status, "success"),
    systemStatus: normalizeString(mapped.systemStatus, "confirmed"),
    chainStatus: normalizeString(mapped.chainStatus, "confirmed"),
    confirmations: Number(mapped.confirmations || 0),
    ledgerIndex: mapped.ledgerIndex,
    txHash: normalizedTxHash || null,
    logIndex: normalizedLogIndex || null,
    historyUniqueKey,
    rawRequest:
      mapped.rawRequest &&
        typeof mapped.rawRequest === "object" &&
        !Array.isArray(mapped.rawRequest)
        ? mapped.rawRequest
        : {},
    rawResponse:
      mapped.rawResponse &&
        typeof mapped.rawResponse === "object" &&
        !Array.isArray(mapped.rawResponse)
        ? mapped.rawResponse
        : rawResponse || {},
    metadata,
    ...(chainTimestamp ? { chainTimestamp, block_time: chainTimestamp } : {}),
    ...(confirmedAt
      ? {
        confirmedAt,
        confirmed_at: confirmedAt,
      }
      : {}),
    ...overrides,
  };
}

module.exports = {
  normalizeNftDirection,
  normalizeNftStandard,
  normalizeNftContractAddress,
  normalizeNftTokenId,
  buildPendingNftHistoryUniqueKey,
  buildNftHistoryUniqueKey,
  getNftTokenIdQueryVariants,
  getNftStandardStorageVariants,
  isPendingNftHistoryUniqueKey,
  hasRealNftTxHash,
  normalizeNftHistoryIdentity,
  buildNftHistoryTransactionPayload,
};
