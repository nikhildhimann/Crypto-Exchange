const { getSupportedChainCodes } = require("../../config/chains");

module.exports = {
  listRules: {
    page: "integer",
    limit: "integer",
    search: "string|max:255",
    includeHidden: "boolean",
    includeArchived: "boolean",
  },
  requestRules: {
    walletId: "required|mongoid",
    chain: `required|in:${getSupportedChainCodes().join(",")}`,
    asset: "required|string",
    amount: "required|regex:^\\d+(\\.\\d+)?$",
    destinationAddress: "required|string|min:4",
    executionParams: "object",
  },
};
