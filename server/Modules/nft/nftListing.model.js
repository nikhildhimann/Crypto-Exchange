/**
 * NFT Listing Model
 *
 * This model represents an NFT that a user has listed for sale on a marketplace (Reservoir/Seaport).
 * It tracks the listing details including price, expiry, status, and provider-specific order data.
 */

const { ajModel } = require("../../common/classes/Model");
const { Schema } = require("mongoose");

const schema = {
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  walletId: {
    type: Schema.Types.ObjectId,
    ref: "Wallet",
    required: true,
    index: true,
  },
  accountId: {
    type: Schema.Types.ObjectId,
    ref: "Account",
    default: null,
    index: true,
  },
  nftId: {
    type: Schema.Types.ObjectId,
    ref: "NFTAsset",
    required: true,
    index: true,
  },
  chain: {
    type: String, // e.g., 'polygon', 'ethereum', 'base'
    required: true,
    lowercase: true,
    trim: true,
    index: true,
    default: "polygon",
  },
  chainId: {
    type: Number,
    required: false,
    default: null,
  },
  network: {
    type: String,
    required: true,
    default: "mainnet",
  },
  contractAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  tokenId: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  standard: {
    type: String,
    enum: ["ERC721", "ERC1155"],
    required: true,
    default: "ERC721",
  },
  ownerAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  priceInWei: {
    type: String,
    required: true,
    trim: true,
  },
  currency: {
    type: String,
    required: true,
    default: "MATIC",
  },
  marketplaceName: {
    type: String,
    required: true,
    default: "opensea",
    enum: ["opensea", "reservoir", "blur", "looksrare"],
  },
  orderId: {
    type: String,
    required: true,
    trim: true,
  },
  orderData: {
    type: Schema.Types.Mixed,
    default: {},
    select: false,
  },
  status: {
    type: String,
    enum: ["active", "sold", "cancelled", "expired"],
    required: true,
    default: "active",
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  soldAt: {
    type: Date,
    default: null,
  },
  cancelledAt: {
    type: Date,
    default: null,
  },
};

/**
 * Transform function to ensure sensitive order data is never returned in API responses.
 */
const transformFn = (ret) => {
  delete ret.orderData;
  return ret;
};

module.exports = new ajModel("NFTListing", schema, transformFn)
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: "idx_nft_listing_user_status" })
  .index(
    { contractAddress: 1, tokenId: 1, status: 1 },
    { unique: false, name: "idx_nft_listing_contract_token_status" },
  )
  .index({ orderId: 1 }, { unique: true, name: "uniq_nft_listing_order_id" })
  .index({ expiresAt: 1, status: 1 }, { name: "idx_nft_listing_expiry" })
  .getModel();
