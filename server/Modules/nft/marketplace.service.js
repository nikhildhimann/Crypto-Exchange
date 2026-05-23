const marketplaceProvider = require("./marketplace.provider");
const { getChainConfig, getSupportedChains } = require("./marketplace.chainConfig");
const NftListing = require("./nftListing.model");
const NFTOrder = require("./nftOrder.model");
const NFTAsset = require("./model");
const Wallet = require("../wallet/model");
const Transaction = require("../transaction/model");
const { AppError } = require("../../helpers/errors");
const logger = require("../../common/utils/logger");
const paginate = require("../../helpers/pagination");
const signingService = require("../security/signing.service");
const { Seaport } = require("@opensea/seaport-js");
const { ethers } = require("ethers");
const { getClient } = require("../chainAdapters/polygon/client");
const polygonWallet = require("../chainAdapters/polygon/wallet");
const socket = require("../../lib/socket");
const { buildWalletVisibilityFilter, isWalletArchived } = require("../../common/utils/walletState");
const { scheduleWalletNftRefresh } = require("./refresh.service");

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const SUPPORTED_CHAIN = "polygon";
const SUPPORTED_STANDARDS = new Set(["erc721", "erc1155"]);

// ─── Private Normalizers ──────────────────────────────────────────────────────

/**
 * Normalizes and validates a chain name.
 */
function normalizeChain(value) {
  const defaultChain = process.env.NFT_MARKETPLACE_DEFAULT_CHAIN || "polygon";
  const normalized = String(value || defaultChain).trim().toLowerCase();
  getChainConfig(normalized);
  return normalized;
}

function normalizePage(value) {
  const parsed = parseInt(String(value || 1).trim(), 10);
  return isNaN(parsed) || parsed <= 0 ? 1 : parsed;
}

function normalizeLimit(value, max = MAX_LIST_LIMIT) {
  const parsed = parseInt(String(value || DEFAULT_LIST_LIMIT).trim(), 10);
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_LIST_LIMIT : Math.min(parsed, max);
}

function normalizeContractAddress(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) throw AppError.validation("contractAddress is required");
  return normalized;
}

/**
 * Resolves a wallet owned by the user.
 * Pattern matched from transfer.service.js
 */
async function resolveOwnedWallet({ userId, walletId }) {
  const wallet = await Wallet.findOne({
    _id: walletId,
    userId,
    ...buildWalletVisibilityFilter({ includeHidden: true }),
  }).lean();

  if (!wallet) throw AppError.notFound("Wallet not found");
  if (isWalletArchived(wallet)) throw AppError.validation("Wallet is archived");
  if (!wallet.address) throw AppError.validation("Wallet address is missing");

  return wallet;
}

/**
 * Resolves an NFT asset that can be listed.
 * Pattern matched from transfer.service.js
 */
async function resolveTransferableNft({ userId, nftId, wallet }) {
  const nft = await NFTAsset.findOne({ _id: nftId, userId }).lean();

  if (!nft) throw AppError.notFound("NFT not found");
  if (String(nft.walletId) !== String(wallet._id)) throw AppError.validation("NFT does not belong to the selected wallet");
  if (String(nft.chain || "").toLowerCase() !== SUPPORTED_CHAIN) throw AppError.validation(`NFT listings currently support ${SUPPORTED_CHAIN} only`);

  const standard = String(nft.standard || "erc721").toLowerCase();
  if (!SUPPORTED_STANDARDS.has(standard)) throw AppError.validation("NFT listings are only supported for ERC-721 and ERC-1155 tokens");
  if (!String(nft.contractAddress || "").trim()) throw AppError.validation("NFT contract address is missing");
  if (nft.tokenId === undefined || nft.tokenId === null || String(nft.tokenId).trim() === "") throw AppError.validation("NFT token id is missing");

  return nft;
}

// ─── Exported Service Functions ───────────────────────────────────────────────

/**
 * Browses active marketplace listings for a contract.
 */
const getMarketplaceListings = async ({ contractAddress, chain, page, limit, sortBy, minPrice, maxPrice }) => {
  const normalizedAddr = normalizeContractAddress(contractAddress);
  const chainName = normalizeChain(chain);
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);

  const items = await marketplaceProvider.fetchListings({
    contractAddress: normalizedAddr,
    chainName,
    page: normalizedPage,
    limit: normalizedLimit,
    sortBy,
    minPrice,
    maxPrice,
  });

  return {
    items,
    page: normalizedPage,
    limit: normalizedLimit,
    total: items.length,
    hasMore: false,
  };
};

/**
 * Fetches the collection floor price.
 */
const getFloorPrice = async ({ contractAddress, chain }) => {
  const normalizedAddr = normalizeContractAddress(contractAddress);
  const chainName = normalizeChain(chain);

  return await marketplaceProvider.fetchFloorPrice({
    contractAddress: normalizedAddr,
    chainName,
  });
};

/**
 * Fetches listings owned by the user.
 */
const getUserListings = async ({ userId, status, chain, page, limit }) => {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const resolvedStatus = String(status || "active").trim().toLowerCase();

  const query = { userId };
  if (resolvedStatus !== "all") query.status = resolvedStatus;
  if (chain) query.chain = normalizeChain(chain);

  const result = await paginate(NftListing, query, {
    page: normalizedPage - 1,
    limit: normalizedLimit,
    sort: { createdAt: -1 },
  });

  return {
    items: result.data,
    page: normalizedPage,
    limit: normalizedLimit,
    total: result.meta.totalRecords,
    hasMore: normalizedPage < result.meta.totalPages,
  };
};

/**
 * Lists an NFT for sale on the OpenSea marketplace using Seaport (Comprehensive).
 */
const listNFTForSale = async ({ userId, walletId, nftId, priceInMatic, expirationDays, chain }) => {
  // Step 1 — Validate inputs
  const resolvedChain = chain || process.env.NFT_MARKETPLACE_DEFAULT_CHAIN || "polygon";
  const chainConfig = getChainConfig(resolvedChain);

  const price = parseFloat(priceInMatic);
  const minPrice = parseFloat(process.env.NFT_LISTING_MIN_PRICE_MATIC || 0.001);
  const maxPrice = parseFloat(process.env.NFT_LISTING_MAX_PRICE_MATIC || 100000);

  if (isNaN(price) || price <= 0) throw AppError.validation("Price must be a positive number");
  if (price < minPrice) throw AppError.validation(`Price must be at least ${minPrice} MATIC`);
  if (price > maxPrice) throw AppError.validation(`Price cannot exceed ${maxPrice} MATIC`);

  const expDays = parseInt(expirationDays) || parseInt(process.env.NFT_LISTING_DEFAULT_EXPIRY_DAYS || 7);
  if (expDays < 1 || expDays > 180) throw AppError.validation("Expiration must be between 1 and 180 days");

  // Step 2 — Check for existing active listing
  const existingListing = await NftListing.findOne({ nftId, userId, status: "active" });
  if (existingListing) throw AppError.conflict("This NFT already has an active listing");

  // Step 3 — Resolve NFT and wallet
  const wallet = await resolveOwnedWallet({ userId, walletId });
  const nft = await resolveTransferableNft({ userId, nftId, wallet });

  // Step 4 — Convert price to wei
  const priceInWei = ethers.parseEther(String(price)).toString();

  // Step 5 — Build Seaport order server-side
  const mnemonic = await signingService.getWalletMnemonic(wallet._id, userId);
  const derived = polygonWallet.deriveWalletFromMnemonic(mnemonic, wallet.derivationPath);
  const provider = getClient("mainnet");
  const signer = new ethers.Wallet(derived.wallet.privateKey, provider);

  const seaport = new Seaport(signer, {
    overrides: { contractAddress: chainConfig.seaportAddress }
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expDays);

  const { executeAllActions } = await seaport.createOrder({
    startTime: Math.floor(Date.now() / 1000).toString(),
    endTime: Math.floor(expiresAt.getTime() / 1000).toString(),
    offer: [{
      itemType: nft.standard.toUpperCase() === "ERC1155" ? 3 : 2,
      token: nft.contractAddress,
      identifier: nft.tokenId,
    }],
    consideration: [{
      amount: priceInWei,
      recipient: wallet.address,
    }],
    conduitKey: chainConfig.conduitKey,
  }, wallet.address);

  const order = await executeAllActions();
  const orderHash = seaport.getOrderHash(order.parameters);

  // Step 6 — Post signed order to OpenSea
  try {
    await marketplaceProvider.postSignedListing({
      parameters: order.parameters,
      signature: order.signature,
      chainName: resolvedChain
    });
  } catch (error) {
    throw AppError.internal("Failed to publish listing to marketplace");
  }

  // Step 7 — Save NftListing to MongoDB
  let listing;
  try {
    listing = await NftListing.create({
      userId, walletId, nftId,
      orderId: orderHash,
      orderData: order,
      priceInWei, currency: chainConfig.nativeCurrency.symbol,
      priceInMatic: String(price),
      expiresAt, status: "active",
      contractAddress: nft.contractAddress.toLowerCase(),
      tokenId: nft.tokenId,
      ownerAddress: wallet.address.toLowerCase(),
      standard: nft.standard,
      chain: resolvedChain, chainId: chainConfig.chainId,
      network: "mainnet", marketplaceName: "opensea"
    });
  } catch (error) {
    if (error.code === 11000) throw AppError.conflict("Listing already exists");
    throw error;
  }

  // Step 8 — Emit socket
  try {
    socket.emit("nft_listed", { listingId: String(listing._id), nftId: String(nftId), priceInMatic: price, chain: resolvedChain });
  } catch (err) {
    logger.warn("Failed to emit listing socket", { userId, error: err.message });
  }

  return {
    listingId: listing._id,
    orderId: orderHash,
    nftId,
    walletId,
    priceInMatic: price,
    priceInWei,
    currency: chainConfig.nativeCurrency.symbol,
    chain: resolvedChain,
    expiresAt,
    status: "active"
  };
};

/**
 * Purchases an NFT from OpenSea via Seaport (Comprehensive).
 */
const buyNFT = async ({ userId, walletId, orderId, chain }) => {
  const resolvedChain = chain || process.env.NFT_MARKETPLACE_DEFAULT_CHAIN || "polygon";
  const chainConfig = getChainConfig(resolvedChain);

  let transaction = null;
  let nftOrder = null;
  let listing = null;

  try {
    // Step 1 — Check own listing
    listing = await NftListing.findOne({ orderId, status: "active" });
    if (listing && String(listing.userId) === String(userId)) throw AppError.validation("Cannot buy your own listing");

    // Step 2 — Fetch live order from OpenSea
    const order = await marketplaceProvider.fetchOrderByHash({ orderId, chainName: resolvedChain });
    if (!order) throw AppError.notFound("Listing is no longer available");

    const priceInWei = order.current_price;
    const protocolData = order.protocol_data;
    const contractAddress = protocolData.parameters.offer[0].token;
    const tokenId = protocolData.parameters.offer[0].identifierOrCriteria;
    const standard = protocolData.parameters.offer[0].itemType === 3 ? "ERC1155" : "ERC721";
    const sellerAddress = order.maker.address;

    // Step 3 — Price safety check
    const floorData = await getFloorPrice({ contractAddress, chain: resolvedChain });
    if (floorData) {
      const multiplier = parseInt(process.env.NFT_BUY_MAX_PRICE_FLOOR_MULTIPLIER || "3");
      const maxAllowed = BigInt(floorData.floorPriceInWei) * BigInt(multiplier);
      if (BigInt(priceInWei) > maxAllowed) throw AppError.validation("Price exceeds safety threshold vs floor price");
    }

    // Step 4 — Resolve wallet + balance check
    const wallet = await resolveOwnedWallet({ userId, walletId });
    const provider = getClient();
    const balanceWei = await provider.getBalance(wallet.address);
    const feeData = await provider.getFeeData();
    const estimatedGasWei = 200000n * (feeData.gasPrice || 100000000000n);

    if (balanceWei < BigInt(priceInWei) + estimatedGasWei) throw AppError.validation("Insufficient MATIC balance");

    // Step 5 — Create pending Transaction document
    transaction = await Transaction.create({
      userId, walletId, accountId: wallet.accountId || null,
      chain: resolvedChain, chainId: chainConfig.chainId, network: "mainnet",
      type: "purchase", transactionType: "external", direction: "incoming",
      fromAddress: sellerAddress, toAddress: wallet.address,
      amount: "1", amountBaseUnits: "1",
      assetType: "nft", standard,
      contractAddress: contractAddress.toLowerCase(),
      status: "pending", chainStatus: "pending_submission", systemStatus: "submitting",
      metadata: { source: "nft_marketplace", orderId, contractAddress, tokenId }
    });

    // Step 6 — Create pending NftOrder document
    nftOrder = await NFTOrder.create({
      userId, walletId, type: "buy",
      nftId: listing ? listing.nftId : null,
      listingId: listing ? listing._id : null,
      transactionId: transaction._id,
      chain: resolvedChain, chainId: chainConfig.chainId,
      contractAddress: contractAddress.toLowerCase(), tokenId,
      standard, fromAddress: sellerAddress, toAddress: wallet.address,
      priceInWei, currency: chainConfig.nativeCurrency.symbol,
      status: "pending"
    });

    // Step 7 — Fulfill via Seaport SDK
    const mnemonic = await signingService.getWalletMnemonic(wallet._id, userId);
    const derived = polygonWallet.deriveWalletFromMnemonic(mnemonic, wallet.derivationPath);
    const signer = new ethers.Wallet(derived.wallet.privateKey, provider);

    const seaport = new Seaport(signer, {
      overrides: { contractAddress: chainConfig.seaportAddress }
    });

    const { executeAllActions } = await seaport.fulfillOrder({
      order: { parameters: protocolData.parameters, signature: protocolData.signature },
      accountAddress: wallet.address,
    });

    const tx = await executeAllActions();
    const receipt = await tx.wait(1);
    const txHash = receipt.hash;

    // Step 8 — Update records on success
    await Transaction.findByIdAndUpdate(transaction._id, { txHash, chainStatus: "submitted", systemStatus: "submitted_to_chain", status: "success" });
    await NFTOrder.findByIdAndUpdate(nftOrder._id, { txHash, status: "pending" }); // Requirement Step 8 says stay pending
    if (listing) await NftListing.findByIdAndUpdate(listing._id, { status: "sold", soldAt: new Date() });

    // Step 10 — Post-success side effects
    scheduleWalletNftRefresh({ userId, walletId, chain: resolvedChain, reason: "nft_purchase", force: true }).catch(e => logger.warn("NFT refresh failed", { error: e.message }));
    try { socket.emit("nft_purchased", { orderId, txHash, contractAddress, tokenId, chain: resolvedChain }); } catch (err) {}

    return {
      orderId, transactionId: transaction._id, nftOrderId: nftOrder._id,
      txHash, status: "pending", contractAddress, tokenId, chain: resolvedChain,
      priceMatic: ethers.formatEther(priceInWei)
    };

  } catch (error) {
    // Step 9 — On failure
    if (transaction) await Transaction.findByIdAndUpdate(transaction._id, { status: "failed", chainStatus: "submission_failed", systemStatus: "submission_failed", errorMessage: error.message });
    if (nftOrder) await NFTOrder.findByIdAndUpdate(nftOrder._id, { status: "failed", failedAt: new Date(), failReason: error.message });
    throw error;
  }
};

/**
 * Cancels an active listing on OpenSea (Comprehensive).
 */
const cancelListing = async ({ userId, walletId, listingId }) => {
  const listing = await NftListing.findOne({ _id: listingId, userId, status: "active" });
  if (!listing) throw AppError.notFound("Active listing not found");

  const chainName = listing.chain || "polygon";
  const chainConfig = getChainConfig(chainName);

  // Step 2 — Off-chain cancel
  try {
    await marketplaceProvider.offChainCancelListing({ orderHash: listing.orderId, chainName });
  } catch (error) {}

  // Step 3 — On-chain cancel
  try {
    const mnemonic = await signingService.getWalletMnemonic(walletId, userId);
    const derived = polygonWallet.deriveWalletFromMnemonic(mnemonic);
    const provider = getClient();
    const signer = new ethers.Wallet(derived.wallet.privateKey, provider);
    const seaport = new Seaport(signer, { overrides: { contractAddress: chainConfig.seaportAddress } });

    if (listing.orderData?.parameters) {
      const { executeAllActions } = await seaport.cancelOrders([listing.orderData.parameters], signer.address);
      const tx = await executeAllActions();
      await tx.wait(1);
    }
  } catch (error) {
    logger.warn("On-chain cancel failed, marking as cancelled in DB anyway", { listingId });
  }

  // Step 4 — Update DB
  const cancelledAt = new Date();
  await NftListing.findByIdAndUpdate(listingId, { status: "cancelled", cancelledAt });

  return { listingId, orderId: listing.orderId, status: "cancelled", cancelledAt };
};

/**
 * Fetches paginated NFT orders (buy/sell) for a specific user.
 */
const getUserNftOrders = async ({ userId, type, status, chain, page, limit }) => {
  const normalizedPage = Math.max(1, parseInt(page) || 1);
  const normalizedLimit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(limit) || DEFAULT_LIST_LIMIT));

  const query = { userId };
  if (type) query.type = type;
  if (status) query.status = status;
  if (chain) query.chain = chain;

  const result = await paginate(NFTOrder, query, {
    page: normalizedPage - 1,
    limit: normalizedLimit,
    sort: { createdAt: -1 },
    populate: [{ path: "nftId", select: "name imageUrl contractAddress tokenId standard collectionName" }],
  });

  return {
    items: result.data,
    page: normalizedPage,
    limit: normalizedLimit,
    total: result.meta.totalRecords,
    hasMore: normalizedPage < result.meta.totalPages,
  };
};

module.exports = {
  getMarketplaceListings,
  getFloorPrice,
  getUserListings,
  listNFTForSale,
  buyNFT,
  cancelListing,
  getUserNftOrders,
};
