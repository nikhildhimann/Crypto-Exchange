export function formatTokenId(id = "") {
  const normalized = String(id || "").trim();
  if (normalized.length <= 16) return normalized;
  // For very long numeric token IDs, show first 8 and last 8 characters
  return `${normalized.slice(0, 8)}...${normalized.slice(-8)}`;
}

export function getNftDisplayTitle(nft = {}) {
  if (nft.name) return nft.name;
  if (nft.tokenId) return `Token #${formatTokenId(nft.tokenId)}`;
  return "NFT";
}

export function getNftCollectionLabel(nft = {}) {
  return nft.collectionName || nft.collection || nft.contractAddress || "-";
}

export function getNftStandardLabel(standard = "") {
  const normalized = String(standard || "").trim().toLowerCase();

  if (normalized === "erc721") {
    return "ERC-721";
  }

  if (normalized === "erc1155") {
    return "ERC-1155";
  }

  return normalized ? normalized.toUpperCase() : "NFT";
}

export function isErc721Nft(nft = {}) {
  return String(nft?.standard || "").trim().toLowerCase() === "erc721";
}

export function isErc1155Nft(nft = {}) {
  return String(nft?.standard || "").trim().toLowerCase() === "erc1155";
}

export function getNftQuantityValue(nft = {}) {
  const rawValue = nft?.balance;
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return "";
  }

  return String(rawValue).trim();
}

export function getNftQuantityLabel(nft = {}) {
  const quantity = getNftQuantityValue(nft);

  if (!quantity) {
    return "";
  }

  if (isErc1155Nft(nft)) {
    return `Qty ${quantity}`;
  }

  if (quantity !== "1") {
    return `Qty ${quantity}`;
  }

  return "1 of 1";
}

export function getNftInventorySummary(nft = {}) {
  const standardLabel = getNftStandardLabel(nft?.standard);
  const quantityLabel = getNftQuantityLabel(nft);

  return quantityLabel ? `${standardLabel} • ${quantityLabel}` : standardLabel;
}

export function isNftTransferSupportedInUi(nft = {}) {
  const chain = String(nft?.chain || "").trim().toLowerCase();
  return (
    chain === "polygon" &&
    (isErc721Nft(nft) || isErc1155Nft(nft))
  );
}

export function getNftTransferSupportMessage(nft = {}) {
  const normalizedChain = String(nft?.chain || "").trim().toLowerCase();

  if (normalizedChain && normalizedChain !== "polygon") {
    return "This transfer flow is currently available for Polygon NFTs only.";
  }

  if (!isErc721Nft(nft) && !isErc1155Nft(nft)) {
    return "This NFT standard is not yet supported in the frontend transfer flow.";
  }

  return "";
}
