const {
  defaultChain,
  getChainConfig,
  getChainNetworkCodes,
  getSupportedChainCodes,
  getSupportedNetworkCodes,
} = require("../../config/chains");

function buildInRule(values, { required = false } = {}) {
  const prefix = required ? "required|" : "";
  return `${prefix}in:${values.join(",")}`;
}

function buildWalletMutationRules(req) {
  const chain = req.body.chain || defaultChain;
  const networkCodes = getChainNetworkCodes(chain);
  return {
    chain: buildInRule(getSupportedChainCodes()),
    network: buildInRule(networkCodes.length ? networkCodes : getSupportedNetworkCodes()),
    label: "string|min:1|max:50|regex:^[a-zA-Z0-9\\s_.-]+$",
    accountId: "mongoid",
    provisioningTargets: "array",
    targets: "array",
  };
}
function buildReceiveAmountRule() {
  const maxDecimals = Math.max(
    ...getSupportedChainCodes().map(
      (chain) => getChainConfig(chain)?.decimals ?? 0,
    ),
  );

  return `regex:^\\d+(\\.\\d{1,${maxDecimals}})?$`;
}

module.exports = {
  listWalletRules: {
    page: "integer",
    limit: "integer",
    search: "string|max:255",
    chain: buildInRule(getSupportedChainCodes()),
    network: buildInRule(getSupportedNetworkCodes()),
    accountId: "mongoid",
    includeHidden: "boolean",
    includeArchived: "boolean",
  },
  createWalletRules: buildWalletMutationRules,
  confirmWalletRules: (req) => ({
    ...buildWalletMutationRules(req),
    sessionId: "required|mongoid",
    mnemonic: "required|string|min:12|max:250|regex:^[a-zA-Z\\s]+$",
    accountId: "mongoid",
  }),
  importWalletRules: (req) => ({
    ...buildWalletMutationRules(req),
    mnemonic: "required|string|min:12|max:250|regex:^[a-zA-Z\\s]+$",
    accountId: "mongoid",
  }),
  createHbarWalletOnDemandRules: {
    accountId: "mongoid",
    network: buildInRule(getChainNetworkCodes("hbar"), { required: false }),
    label: "string|min:1|max:50|regex:^[a-zA-Z0-9\\s_.-]+$",
  },
  walletIdRules: {
    walletId: "required|mongoid",
  },
  receivePayloadRules: {
    walletId: "required|mongoid",
    asset: "string|max:50",
    amount: buildReceiveAmountRule(),
    executionParams: "string|max:5000",
    qrParams: "string|max:5000",
  },
};
