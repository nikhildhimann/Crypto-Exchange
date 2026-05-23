const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const service = require("./service");

function respond(message, resolver) {
  return asyncHandler(async (req, res) => {
    const data = await resolver(req, res);
    return success(res, {
      message,
      data,
    });
  });
}

exports.overview = respond(
  "Superadmin overview metrics fetched successfully",
  () => service.getOverviewMetrics(),
);

exports.listUsers = respond(
  "Superadmin users fetched successfully",
  (req) => service.listUsers(req.query),
);

exports.userDetail = respond(
  "Superadmin user detail fetched successfully",
  (req) => service.getUserDetail(req.params.userId),
);

exports.listAccounts = respond(
  "Superadmin accounts fetched successfully",
  (req) => service.listAccounts(req.query),
);

exports.accountDetail = respond(
  "Superadmin account detail fetched successfully",
  (req) => service.getAccountDetail(req.params.accountId),
);

exports.listWallets = respond(
  "Superadmin wallets fetched successfully",
  (req) => service.listWallets(req.query),
);

exports.walletDetail = respond(
  "Superadmin wallet detail fetched successfully",
  (req) => service.getWalletDetail(req.params.walletId),
);

exports.listTransactions = respond(
  "Superadmin transactions fetched successfully",
  (req) => service.listTransactions(req.query),
);

exports.transactionDetail = respond(
  "Superadmin transaction detail fetched successfully",
  (req) => service.getTransactionDetail(req.params.transactionId),
);

exports.listDeposits = respond(
  "Superadmin deposits fetched successfully",
  (req) => service.listDeposits(req.query),
);

exports.depositDetail = respond(
  "Superadmin deposit detail fetched successfully",
  (req) => service.getDepositDetail(req.params.depositId),
);

exports.listWithdrawals = respond(
  "Superadmin withdrawals fetched successfully",
  (req) => service.listWithdrawals(req.query),
);

exports.withdrawalDetail = respond(
  "Superadmin withdrawal detail fetched successfully",
  (req) => service.getWithdrawalDetail(req.params.withdrawalId),
);

exports.listSessions = respond(
  "Superadmin sessions fetched successfully",
  (req) => service.listSessions(req.query),
);

exports.sessionDetail = respond(
  "Superadmin session detail fetched successfully",
  (req) => service.getSessionDetail(req.params.sessionId, req.query.scope),
);

exports.listAuditEvents = respond(
  "Superadmin audit events fetched successfully",
  (req) => service.listAuditEvents(req.query),
);

exports.auditEventDetail = respond(
  "Superadmin audit event detail fetched successfully",
  (req) => service.getAuditEventDetail(req.params.auditId),
);

exports.listTreasuryWallets = respond(
  "Superadmin treasury wallets fetched successfully",
  (req) => service.listTreasuryWallets(req.query),
);

exports.treasuryWalletDetail = respond(
  "Superadmin treasury wallet detail fetched successfully",
  (req) => service.getTreasuryWalletDetail(req.params.treasuryId),
);

exports.listChains = respond(
  "Superadmin chains fetched successfully",
  (req) => service.listChains(req.query),
);

exports.chainDetail = respond(
  "Superadmin chain detail fetched successfully",
  (req) => service.getChainDetail(req.params.chainId),
);

exports.listJobs = respond(
  "Superadmin jobs fetched successfully",
  (req) => service.listJobs(req.query),
);

exports.jobDetail = respond(
  "Superadmin job detail fetched successfully",
  (req) => service.getJobDetail(req.params.jobName),
);

exports.settings = respond(
  "Superadmin settings summary fetched successfully",
  () => service.getSettingsSummary(),
);
