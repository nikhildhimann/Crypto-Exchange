const { buildAdapterMetadata } = require("./metadata");

const DEFAULT_CAPABILITIES = Object.freeze([
  "amount",
  "wallet",
  "balance",
  "transaction",
  "deposit",
  "withdrawal",
  "qr",
]);

function buildCapabilities(sections = {}) {
  const capabilities = [...DEFAULT_CAPABILITIES];

  if (sections.nft) {
    capabilities.push("nft");
  }

  if (sections.nftTransfer) {
    capabilities.push("nftTransfer");
  }

  return capabilities;
}

function createChainAdapter(code, sections) {
  return Object.freeze({
    metadata: buildAdapterMetadata(code, {
      capabilities: buildCapabilities(sections),
      ...(sections.metadata || {}),
    }),
    client: sections.client,
    amount: sections.amount,
    wallet: sections.wallet,
    transaction: sections.transaction,
    balance: sections.balance,
    deposit: sections.deposit,
    withdrawal: sections.withdrawal,
    qr: sections.qr,
    mapper: sections.mapper,
    nft: sections.nft,
    nftTransfer: sections.nftTransfer,
  });
}

module.exports = {
  DEFAULT_CAPABILITIES,
  buildCapabilities,
  createChainAdapter,
};
