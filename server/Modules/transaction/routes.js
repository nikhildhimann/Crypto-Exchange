const express = require("express");

const controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");
const validator = require("./validator");
const { createRateLimiter, profiles } = require("../../middleware/rateLimiter");

const router = express.Router();
const transactionRateLimiter = createRateLimiter({
  ...profiles.transactionStrict,
  keySuffix: "transaction",
});
const transactionSendRateLimiter = createRateLimiter({
  ...profiles.transactionStrict,
  keySuffix: "transaction-send",
  maxRequests: Math.min(profiles.transactionStrict.maxRequests, 10),
});

router.get("/", verifyToken, validateRequest(validator.transactionListRules), controller.list);
router.post(
  "/validate-destination",
  verifyToken,
  transactionRateLimiter,
  validateRequest(validator.validateDestinationRules),
  controller.validateDestination,
);
router.post("/preview", verifyToken, transactionRateLimiter, validateRequest(validator.previewRules), controller.preview);
router.post("/send", verifyToken, transactionSendRateLimiter, validateRequest(validator.sendRules), controller.send);
router.get(
  "/wallet/:walletId",
  verifyToken,
  validateRequest(validator.walletTransactionsRules),
  controller.listWalletTransactions,
);
router.post(
  "/wallet/:walletId/sync",
  verifyToken,
  validateRequest(validator.walletIdRules),
  controller.syncWalletTransactions,
);
router.get(
  "/:transactionId",
  verifyToken,
  validateRequest(validator.transactionIdRules),
  controller.details,
);

module.exports = router;
