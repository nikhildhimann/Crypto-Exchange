const Withdrawal = require("./model");
const Wallet = require("../wallet/model");
const paginate = require("../../helpers/pagination");
const processorService = require("./processor.service");
const { AppError } = require("../../helpers/errors");
const {
  assertChainFeature,
  withRuntimeChainNetworkFilter,
} = require("../../common/utils/chain");
const { normalizeExecutionParamsObject } = require("../../common/utils/executionParams");
const {
  buildWalletVisibilityFilter,
  isWalletArchived,
} = require("../../common/utils/walletState");

async function listWithdrawals(userId, query) {
  const activeWallets = await Wallet.find(
    withRuntimeChainNetworkFilter({
      userId,
      ...buildWalletVisibilityFilter({
        includeHidden: query.includeHidden === "true",
        includeArchived: query.includeArchived === "true",
      }),
    }),
  )
    .select("_id")
    .lean();
  const walletIds = activeWallets.map((wallet) => wallet._id);

  return paginate(Withdrawal, { userId, walletId: { $in: walletIds } }, {
    page: query.page,
    limit: query.limit,
    searchFields: ["asset", "reference", "destinationAddress"],
    searchTerm: query.search,
  });
}

async function requestWithdrawal(payload) {
  const wallet = await Wallet.findOne({
    _id: payload.walletId,
    userId: payload.userId,
    ...buildWalletVisibilityFilter({ includeHidden: true }),
  }).lean();
  if (!wallet) {
    throw AppError.notFound("Wallet not found");
  }
  if (isWalletArchived(wallet)) {
    throw AppError.validation("Wallet is archived");
  }

  const { chain, network } = assertChainFeature(wallet.chain, wallet.network, "send");
  if (payload.chain && String(payload.chain).toLowerCase() !== chain) {
    throw AppError.validation("Withdrawal chain does not match the selected wallet");
  }

  return processorService.processWithdrawal({
    ...payload,
    chain,
    network,
    executionParams: normalizeExecutionParamsObject(payload.executionParams),
  });
}

module.exports = {
  listWithdrawals,
  requestWithdrawal,
};
