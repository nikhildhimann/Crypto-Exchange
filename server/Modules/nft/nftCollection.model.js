const { ajModel } = require("../../common/classes/Model");
const { Schema } = require("mongoose");

const schema = {
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
  name: {
    type: String,
    default: "",
    trim: true,
  },
  symbol: {
    type: String,
    default: "",
    trim: true,
  },
  logoUrl: {
    type: String,
    default: null,
    trim: true,
  },
  bannerUrl: {
    type: String,
    default: null,
    trim: true,
  },
  description: {
    type: String,
    default: "",
    trim: true,
  },
  provider: {
    type: String,
    enum: ["alchemy"],
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
  rawProviderData: {
    type: Schema.Types.Mixed,
    default: null,
  },
  lastSyncedAt: {
    type: Date,
    default: null,
    index: true,
  },
};

module.exports = new ajModel("NFTCollection", schema)
  .index(
    { chain: 1, contractAddress: 1 },
    { unique: true, name: "uniq_nft_collection_chain_contract" },
  )
  .index({ chain: 1, isHidden: 1, isSpam: 1, name: 1 }, { name: "idx_nft_collection_visibility_name" })
  .getModel();
