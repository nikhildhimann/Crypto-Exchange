const { ajModel } = require("../../common/classes/Model");
const { Schema } = require("mongoose");

const SUPPORTED_NFT_STANDARDS = ["ERC721", "ERC1155"];
const SUPPORTED_NFT_PROVIDERS = ["alchemy"];

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

  appId: {
    type: String,
    required: true,
    trim: true,
  },

  chain: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
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
    enum: SUPPORTED_NFT_STANDARDS,
    default: "ERC721",
    required: true,
    index: true,
  },
  balance: {
    type: String,
    required: true,
    default: "1",
    trim: true,
  },

  ownerAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },

  collectionName: {
    type: String,
    default: "",
    trim: true,
  },
  collectionSymbol: {
    type: String,
    default: "",
    trim: true,
  },

  name: {
    type: String,
    default: "",
    trim: true,
  },
  description: {
    type: String,
    default: "",
    trim: true,
  },

  imageUrl: {
    type: String,
    default: null,
    trim: true,
  },
  thumbnailUrl: {
    type: String,
    default: null,
    trim: true,
  },
  imageOriginalUrl: {
    type: String,
    default: null,
    trim: true,
  },
  metadataUrl: {
    type: String,
    default: null,
    trim: true,
  },

  attributes: {
    type: [Schema.Types.Mixed],
    default: [],
  },
  rawMetadata: {
    type: Schema.Types.Mixed,
    default: null,
  },
  rawProviderData: {
    type: Schema.Types.Mixed,
    default: null,
  },

  provider: {
    type: String,
    enum: SUPPORTED_NFT_PROVIDERS,
    required: true,
    default: "alchemy",
    index: true,
  },

  isVerified: {
    type: Boolean,
    default: false,
    index: true,
  },
  isSpam: {
    type: Boolean,
    default: false,
    index: true,
  },
  isHidden: {
    type: Boolean,
    default: false,
    index: true,
  },

  mintedAt: {
    type: Date,
    default: null,
  },
  lastTransferAt: {
    type: Date,
    default: null,
  },
  lastSyncedAt: {
    type: Date,
    default: null,
    index: true,
  },
};

module.exports = new ajModel("NFTAsset", schema)
  .index(
    { chain: 1, contractAddress: 1, tokenId: 1, ownerAddress: 1 },
    { unique: true, name: "uniq_nft_asset_owner_token" },
  )
  .index(
    { userId: 1, walletId: 1, chain: 1, isHidden: 1, isSpam: 1, createdAt: -1 },
    { name: "idx_nft_asset_user_wallet_chain_visibility" },
  )
  .index(
    { userId: 1, walletId: 1, chain: 1, lastSyncedAt: -1 },
    { name: "idx_nft_asset_user_wallet_chain_sync" },
  )
  .index(
    { walletId: 1, chain: 1, contractAddress: 1 },
    { name: "idx_nft_asset_wallet_collection" },
  )
  .index(
    { appId: 1 },
    { unique: true, name: "uniq_nft_asset_app_id_owner" },
  )
  .index(
    { contractAddress: 1, tokenId: 1 },
    { name: "idx_nft_asset_contract_token" },
  )
  .getModel(); 
