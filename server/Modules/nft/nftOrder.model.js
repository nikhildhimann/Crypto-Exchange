/**
 * NFT Order Model
 *
 * This model serves as a completed record of a marketplace buy or sell order.
 * It acts as the bridge between a listing/offer and the final on-chain Transaction.
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
  type: {
    type: String,
    enum: ["buy", "sell"],
    required: true,
    index: true,
  },
  nftId: {
    type: Schema.Types.ObjectId,
    ref: "NFTAsset",
    required: true,
    index: true,
  },
  listingId: {
    type: Schema.Types.ObjectId,
    ref: "NFTListing",
    default: null,
    index: true,
  },
  offerId: {
    type: Schema.Types.ObjectId,
    ref: "NFTOffer",
    default: null,
    index: true,
  },
  transactionId: {
    type: Schema.Types.ObjectId,
    ref: "Transaction",
    default: null,
    index: true,
  },
  chain: {
    type: String, // e.g., 'polygon', 'ethereum', 'base'
    required: true,
    lowercase: true,
    trim: true,
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
  },
  tokenId: {
    type: String,
    required: true,
    trim: true,
  },
  standard: {
    type: String,
    enum: ["ERC721", "ERC1155"],
    required: true,
    default: "ERC721",
  },
  fromAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  toAddress: {
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
  platformFeeWei: {
    type: String,
    default: "0",
  },
  royaltyFeeWei: {
    type: String,
    default: "0",
  },
  txHash: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "failed"],
    required: true,
    default: "pending",
    index: true,
  },
  confirmedAt: {
    type: Date,
    default: null,
  },
  failedAt: {
    type: Date,
    default: null,
  },
  failReason: {
    type: String,
    default: null,
  },
  rawOrderData: {
    type: Schema.Types.Mixed,
    default: null,
  },
};

module.exports = new ajModel("NFTOrder", schema)
  .index({ userId: 1, type: 1, createdAt: -1 }, { name: "idx_nft_order_user_type" })
  .index({ txHash: 1 }, { unique: false, sparse: true, name: "idx_nft_order_txhash" })
  .index({ contractAddress: 1, tokenId: 1, createdAt: -1 }, { name: "idx_nft_order_contract_token" })
  .getModel();
