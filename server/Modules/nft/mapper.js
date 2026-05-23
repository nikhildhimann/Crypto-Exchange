const logger = require("../../common/utils/logger");

function safeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function safeNullableString(value) {
  const normalized = safeString(value, "");
  return normalized || null;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAddress(value) {
  const normalized = safeString(value).toLowerCase();
  return normalized || "";
}

function normalizeTokenId(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return "";
  }

  // Hex token IDs are common in some NFT APIs.
  if (/^0x[0-9a-fA-F]+$/.test(normalized)) {
    try {
      return BigInt(normalized).toString(10);
    } catch (_error) {
      return normalized.toLowerCase();
    }
  }

  // Decimal string
  if (/^\d+$/.test(normalized)) {
    try {
      return BigInt(normalized).toString(10);
    } catch (_error) {
      return normalized;
    }
  }

  return normalized;
}

function normalizeStandard(value) {
  const normalized = safeString(value).toUpperCase();
  if (normalized === "ERC1155") {
    return "ERC1155";
  }

  if (normalized === "ERC721") {
    return "ERC721";
  }

  return normalized || "ERC721";
}

function normalizeBalance(value, standard = "ERC721") {
  if (value === undefined || value === null || value === "") {
    return standard === "ERC1155" ? "0" : "1";
  }

  const normalized = String(value).trim();

  if (/^\d+$/.test(normalized)) {
    try {
      return BigInt(normalized).toString(10);
    } catch (_error) {
      return standard === "ERC1155" ? "0" : "1";
    }
  }

  if (/^0x[0-9a-fA-F]+$/.test(normalized)) {
    try {
      return BigInt(normalized).toString(10);
    } catch (_error) {
      return standard === "ERC1155" ? "0" : "1";
    }
  }

  return standard === "ERC1155" ? "0" : "1";
}

function safeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const normalized = safeNullableString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeIpfsUrl(url) {
  const normalized = safeNullableString(url);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("ipfs://ipfs/")) {
    return `https://ipfs.io/ipfs/${normalized.slice("ipfs://ipfs/".length)}`;
  }

  if (normalized.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${normalized.slice("ipfs://".length)}`;
  }

  return normalized;
}

function pickImageUrl(raw = {}) {
  const media = safeArray(raw.media);
  const metadata = safeObject(raw.metadata) || {};
  const contract = safeObject(raw.contract) || {};
  const openSea = safeObject(raw.openSeaMetadata) || {};
  const contractOpenSea = safeObject(contract.openSeaMetadata) || {};

  const firstMedia = safeObject(media[0]) || {};

  return normalizeIpfsUrl(
    pickFirstNonEmpty(
      firstMedia.thumbnail,
      firstMedia.gateway,
      firstMedia.raw,
      raw.image?.cachedUrl,
      raw.image?.thumbnailUrl,
      raw.image?.pngUrl,
      raw.image?.originalUrl,
      metadata.image,
      metadata.image_url,
      metadata.imageUrl,
      openSea.imageUrl,
      contractOpenSea.imageUrl,
    ),
  );
}

function pickThumbnailUrl(raw = {}) {
  const media = safeArray(raw.media);
  const metadata = safeObject(raw.metadata) || {};
  const firstMedia = safeObject(media[0]) || {};

  return normalizeIpfsUrl(
    pickFirstNonEmpty(
      firstMedia.thumbnail,
      raw.image?.thumbnailUrl,
      raw.image?.cachedUrl,
      raw.image?.pngUrl,
      metadata.image,
      metadata.image_url,
    ),
  );
}

function pickOriginalImageUrl(raw = {}) {
  const media = safeArray(raw.media);
  const metadata = safeObject(raw.metadata) || {};
  const firstMedia = safeObject(media[0]) || {};

  return normalizeIpfsUrl(
    pickFirstNonEmpty(
      firstMedia.raw,
      raw.image?.originalUrl,
      raw.image?.cachedUrl,
      metadata.image,
      metadata.image_url,
      metadata.imageUrl,
    ),
  );
}

function pickMetadataUrl(raw = {}) {
  return normalizeIpfsUrl(
    pickFirstNonEmpty(
      raw.tokenUri,
      raw.tokenURI,
      raw.metadataUrl,
      raw.metadata_url,
      raw.raw?.tokenUri,
    ),
  );
}

function normalizeAttributes(raw = {}) {
  const metadata = safeObject(raw.metadata) || {};
  const attributes = safeArray(metadata.attributes);

  return attributes
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({ ...item }));
}

function mapCompositeId({ chain, ownerAddress, contractAddress, tokenId }) {
  const normalizedChain = safeString(chain).toLowerCase();
  const normalizedOwnerAddress = normalizeAddress(ownerAddress);
  const normalizedContractAddress = normalizeAddress(contractAddress);
  const normalizedTokenId = normalizeTokenId(tokenId);

  return `${normalizedChain}:${normalizedOwnerAddress}:${normalizedContractAddress}:${normalizedTokenId}`;
}

function extractCollectionName(raw = {}) {
  return safeString(
    raw.contract?.openSeaMetadata?.collectionName ||
      raw.collection?.name ||
      raw.contractMetadata?.name ||
      raw.metadata?.collection ||
      "",
  );
}

function extractCollectionSymbol(raw = {}) {
  return safeString(
    raw.contract?.symbol ||
      raw.contractMetadata?.symbol ||
      raw.collection?.symbol ||
      "",
  );
}

function extractName(raw = {}) {
  return safeString(raw.name || raw.title || raw.metadata?.name || "");
}

function extractDescription(raw = {}) {
  return safeString(
    raw.description ||
      raw.metadata?.description ||
      raw.contract?.openSeaMetadata?.description ||
      "",
  );
}

function parseOptionalDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapAlchemyNFTToAsset(raw = {}, context = {}) {
  const chain = safeString(context.chain, "polygon").toLowerCase();
  const contractAddress = normalizeAddress(
    raw.contract?.address || raw.contractAddress || raw.address,
  );
  const tokenId = normalizeTokenId(
    raw.tokenId || raw.id?.tokenId || raw.token?.tokenId,
  );
  const standard = normalizeStandard(
    raw.tokenType || raw.standard || raw.contract?.tokenType,
  );
  const ownerAddress = normalizeAddress(
    context.ownerAddress || raw.owner || raw.ownedNfts?.owner,
  );

  const appId = mapCompositeId({
    chain,
    ownerAddress,
    contractAddress,
    tokenId,
  });

  if (context.debug === true) {
    logger.info("Mapping NFT item", {
      event: "nft_mapping_item",
      appId,
      contractAddress,
      tokenId,
      standard,
      balance: normalizeBalance(raw.balance, standard),
    });
  }

  return {
    userId: context.userId || null,
    walletId: context.walletId || null,
    accountId: context.accountId || null,

    appId,

    chain,
    contractAddress,
    tokenId,
    standard,
    balance: normalizeBalance(raw.balance, standard),

    ownerAddress,

    collectionName: extractCollectionName(raw),
    collectionSymbol: extractCollectionSymbol(raw),

    name: extractName(raw),
    description: extractDescription(raw),

    imageUrl: pickImageUrl(raw),
    thumbnailUrl: pickThumbnailUrl(raw),
    imageOriginalUrl: pickOriginalImageUrl(raw),
    metadataUrl: pickMetadataUrl(raw),

    attributes: normalizeAttributes(raw),
    rawMetadata: safeObject(raw.metadata),
    rawProviderData: raw,

    provider: "alchemy",
    isVerified: false,
    isSpam: Boolean(raw.spamInfo?.isSpam || raw.contract?.isSpam || false),
    isHidden: false,

    mintedAt: parseOptionalDate(
      raw.timeLastUpdated || raw.acquiredAt?.blockTimestamp || null,
    ),
    lastTransferAt: parseOptionalDate(raw.acquiredAt?.blockTimestamp || null),
    lastSyncedAt: new Date(),
  };
}

function mapAlchemyCollection(raw = {}, chain = "polygon") {
  const contractAddress = normalizeAddress(
    raw.contract?.address || raw.address || raw.contractAddress,
  );

  const contract = safeObject(raw.contract) || {};
  const openSea = safeObject(contract.openSeaMetadata) || {};

  return {
    chain: safeString(chain, "polygon").toLowerCase(),
    contractAddress,
    name: safeString(
      openSea.collectionName ||
        raw.collection?.name ||
        raw.contractMetadata?.name ||
        "",
    ),
    symbol: safeString(
      contract.symbol ||
        raw.collection?.symbol ||
        raw.contractMetadata?.symbol ||
        "",
    ),
    logoUrl: normalizeIpfsUrl(
      pickFirstNonEmpty(
        openSea.imageUrl,
        raw.image?.cachedUrl,
        raw.image?.thumbnailUrl,
        raw.media?.[0]?.thumbnail,
      ),
    ),
    bannerUrl: normalizeIpfsUrl(
      pickFirstNonEmpty(openSea.bannerImageUrl, raw.bannerImageUrl),
    ),
    description: safeString(openSea.description || raw.description || ""),
    provider: "alchemy",
    isVerified: false,
    isSpam: Boolean(raw.spamInfo?.isSpam || false),
    isHidden: false,
    rawProviderData: raw,
    lastSyncedAt: new Date(),
  };
}

function parseCompositeId(value) {
  const normalized = safeString(value);
  const parts = normalized.split(":");

  if (parts.length < 3) {
    return null;
  }

  if (parts.length >= 4) {
    const [chain, ownerAddress, contractAddress, ...tokenParts] = parts;
    const tokenId = tokenParts.join(":");

    const normalizedChain = safeString(chain).toLowerCase();
    const normalizedOwnerAddress = normalizeAddress(ownerAddress);
    const normalizedContractAddress = normalizeAddress(contractAddress);
    const normalizedTokenId = normalizeTokenId(tokenId);

    if (
      !normalizedChain ||
      !normalizedOwnerAddress ||
      !normalizedContractAddress ||
      !normalizedTokenId
    ) {
      return null;
    }

    return {
      chain: normalizedChain,
      ownerAddress: normalizedOwnerAddress,
      contractAddress: normalizedContractAddress,
      tokenId: normalizedTokenId,
      appId: mapCompositeId({
        chain: normalizedChain,
        ownerAddress: normalizedOwnerAddress,
        contractAddress: normalizedContractAddress,
        tokenId: normalizedTokenId,
      }),
    };
  }

  const [chain, contractAddress, ...tokenParts] = parts;
  const tokenId = tokenParts.join(":");

  const normalizedChain = safeString(chain).toLowerCase();
  const normalizedContractAddress = normalizeAddress(contractAddress);
  const normalizedTokenId = normalizeTokenId(tokenId);

  if (!normalizedChain || !normalizedContractAddress || !normalizedTokenId) {
    return null;
  }

  return {
    chain: normalizedChain,
    ownerAddress: "",
    contractAddress: normalizedContractAddress,
    tokenId: normalizedTokenId,
    appId: "",
  };
}

module.exports = {
  safeString,
  safeNullableString,
  safeArray,
  safeObject,
  normalizeAddress,
  normalizeTokenId,
  normalizeStandard,
  normalizeBalance,
  normalizeIpfsUrl,
  pickImageUrl,
  pickThumbnailUrl,
  pickOriginalImageUrl,
  pickMetadataUrl,
  normalizeAttributes,
  mapCompositeId,
  parseCompositeId,
  mapAlchemyNFTToAsset,
  mapAlchemyCollection,
};
