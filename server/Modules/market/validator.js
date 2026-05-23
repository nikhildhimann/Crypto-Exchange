module.exports = {
  pricesRules: {
    assets: "string|max:500",
  },
  chartRules: {
    asset: "required|string|min:2|max:50",
    range: "in:1H,1D,1W,1M,3M,1Y,ALL",
  },
  statsRules: {
    asset: "required|string|min:2|max:50",
  },
};
