const { mapTransactionSummary } = require("../transaction/response.mapper");

function toIdString(value) {
  return value ? String(value) : null;
}

function mapNftTransferResponse({ transaction, nft, wallet, submission }) {
  const mappedTransaction = transaction
    ? mapTransactionSummary(transaction)
    : {};

  return {
    transactionId: mappedTransaction.id || toIdString(transaction?._id),
    walletId:
      toIdString(wallet?._id) || toIdString(transaction?.walletId),
    nftId: toIdString(nft?._id),
    chain: mappedTransaction.chain,
    network: mappedTransaction.network,
    direction: mappedTransaction.direction,
    status: mappedTransaction.status,
    chainStatus:
      mappedTransaction.chainStatus || submission?.chainStatus || "submitted",
    txHash: mappedTransaction.txHash || submission?.txHash || "",
    fromAddress:
      mappedTransaction.fromAddress || submission?.fromAddress || "",
    toAddress: mappedTransaction.toAddress || submission?.toAddress || "",
    submittedAt:
      submission?.submittedAt ||
      mappedTransaction.chainTimestamp ||
      mappedTransaction.createdAt ||
      null,
    explorerUrl: mappedTransaction.explorerUrl || null,
    nft: {
      _id: toIdString(nft?._id),
      id: toIdString(nft?._id),
      appId: nft?.appId || null,
      standard: nft?.standard || submission?.standard || "ERC721",
      contractAddress:
        nft?.contractAddress || submission?.contractAddress || "",
      tokenId: nft?.tokenId || submission?.tokenId || "",
      name: nft?.name || "",
      collectionName: nft?.collectionName || "",
      collectionSymbol: nft?.collectionSymbol || "",
      imageUrl: nft?.imageUrl || nft?.thumbnailUrl || null,
    },
    transaction: mappedTransaction,
  };
}

module.exports = {
  mapNftTransferResponse,
};
