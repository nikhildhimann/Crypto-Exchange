const express = require("express");

const controller = require("./controller");
const validator = require("./validator");
const verifySuperadminToken = require("../../middleware/verifySuperadminToken");
const { validateRequest } = require("../../middleware/validateRequest");

const router = express.Router();

router.use(verifySuperadminToken);

router.get("/overview", validateRequest(validator.overviewRules), controller.overview);

router.get("/users", validateRequest(validator.userListRules), controller.listUsers);
router.get("/users/:userId", validateRequest(validator.userDetailRules), controller.userDetail);

router.get("/accounts", validateRequest(validator.accountListRules), controller.listAccounts);
router.get("/accounts/:accountId", validateRequest(validator.accountDetailRules), controller.accountDetail);

router.get("/wallets", validateRequest(validator.walletListRules), controller.listWallets);
router.get("/wallets/:walletId", validateRequest(validator.walletDetailRules), controller.walletDetail);

router.get("/transactions", validateRequest(validator.transactionListRules), controller.listTransactions);
router.get(
  "/transactions/:transactionId",
  validateRequest(validator.transactionDetailRules),
  controller.transactionDetail,
);

router.get("/deposits", validateRequest(validator.depositListRules), controller.listDeposits);
router.get("/deposits/:depositId", validateRequest(validator.depositDetailRules), controller.depositDetail);

router.get("/withdrawals", validateRequest(validator.withdrawalListRules), controller.listWithdrawals);
router.get(
  "/withdrawals/:withdrawalId",
  validateRequest(validator.withdrawalDetailRules),
  controller.withdrawalDetail,
);

router.get("/sessions", validateRequest(validator.sessionListRules), controller.listSessions);
router.get("/sessions/:sessionId", validateRequest(validator.sessionDetailRules), controller.sessionDetail);

router.get("/audit", validateRequest(validator.auditListRules), controller.listAuditEvents);
router.get("/audit/:auditId", validateRequest(validator.auditDetailRules), controller.auditEventDetail);

router.get("/treasury", validateRequest(validator.treasuryListRules), controller.listTreasuryWallets);
router.get("/treasury/:treasuryId", validateRequest(validator.treasuryDetailRules), controller.treasuryWalletDetail);

router.get("/chains", validateRequest(validator.chainListRules), controller.listChains);
router.get("/chains/:chainId", validateRequest(validator.chainDetailRules), controller.chainDetail);

router.get("/jobs", validateRequest(validator.jobListRules), controller.listJobs);
router.get("/jobs/:jobName", validateRequest(validator.jobDetailRules), controller.jobDetail);

router.get("/settings", validateRequest(validator.settingsRules), controller.settings);

module.exports = router;
