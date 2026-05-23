const { mongoose } = require("../../common/classes/Model");

const marketPriceCacheSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    quoteCurrency: {
      type: String,
      required: true,
      lowercase: true,
      default: "usd",
      index: true,
    },
    providerId: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      default: null,
    },
    sourceType: {
      type: String,
      default: "live",
    },
    priceUsd: {
      type: Number,
      required: true,
    },
    change24h: {
      type: Number,
      default: 0,
    },
    fallbackPriceUsed: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

marketPriceCacheSchema.index(
  { symbol: 1, quoteCurrency: 1 },
  { unique: true, name: "market_price_symbol_quote" },
);

module.exports =
  mongoose.models.MarketPriceCache ||
  mongoose.model("MarketPriceCache", marketPriceCacheSchema);
