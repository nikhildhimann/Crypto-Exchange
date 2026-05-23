const Deposit = require("./model");
const Wallet = require("../wallet/model");
const paginate = require("../../helpers/pagination");
const { withRuntimeChainNetworkFilter } = require("../../common/utils/chain");

async function listDeposits(userId, query) {
  const activeWallets = await Wallet.find(withRuntimeChainNetworkFilter({ userId }))
    .select("_id")
    .lean();
  const walletIds = activeWallets.map((wallet) => wallet._id);

  return paginate(Deposit, { userId, walletId: { $in: walletIds } }, {
    page: query.page,
    limit: query.limit,
    searchFields: ["asset", "address", "txHash"],
    searchTerm: query.search,
  });
}

module.exports = {
  listDeposits,
};
