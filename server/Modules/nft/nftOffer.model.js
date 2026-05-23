/**
 * NFT Offer Model
 *
 * This model represents a buy offer (bid) that a user has placed on an NFT or a collection.
 * It tracks the offer status, price, expiry, and marketplace-specific order data.
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
  chain: {
    type: String, // e.g., 'polygon', 'ethereum', 'base'
    required: true,
    lowercase: true,
    trim: true,
    default: "polygon",
    index: true,
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
    default: null,
    trim: true,
  },
  standard: {
    type: String,
    enum: ["ERC721", "ERC1155"],
    required: true,
    default: "ERC721",
  },
  offerPriceWei: {
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
    enum: ["pending", "accepted", "cancelled", "expired"],
    required: true,
    default: "pending",
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  acceptedAt: {
    type: Date,
    default: null,
  },
  acceptedByUserId: {
    type: Schema.Types.ObjectId,
    ref: "User",
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

module.exports = new ajModel("NFTOffer", schema, transformFn)
  .index({ userId: 1, status: 1, createdAt: -1 }, { name: "idx_nft_offer_user_status" })
  .index({ contractAddress: 1, tokenId: 1, status: 1 }, { name: "idx_nft_offer_contract_token" })
  .index({ orderId: 1 }, { unique: true, name: "uniq_nft_offer_order_id" })
  .index({ expiresAt: 1, status: 1 }, { name: "idx_nft_offer_expiry" })
  .getModel();
