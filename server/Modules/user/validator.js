const { getSupportedChainCodes } = require("../../config/chains");

module.exports = {
  listRules: {
    page: "integer",
    limit: "integer",
    search: "string|max:255",
  },
  updateRules: {
    id: "required|mongoid",
    primaryChain: `in:${getSupportedChainCodes().join(",")}`,
    status: "in:pending_mnemonic_confirmation,active,locked,archived",
    publicAddress: "string|min:4",
    publicKey: "string|min:4",
    qrCodeUri: "string|min:4",
    metadata: "object",
  },
};
