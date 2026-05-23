const express = require("express");

const controller = require("./controller");
const validator = require("./validator");
const createCaptchaMiddleware = require("../../middleware/antiBot");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");
const { createRateLimiter, profiles } = require("../../middleware/rateLimiter");

const router = express.Router();
const walletImportCaptcha = createCaptchaMiddleware({ scope: "wallet_import" });
const accountMutationRateLimiter = createRateLimiter({
  ...profiles.accountMutationStrict,
  keySuffix: "account-mutation",
});

router.post("/", verifyToken, accountMutationRateLimiter, validateRequest(validator.createRules), controller.create);
router.get("/mnemonic", verifyToken, accountMutationRateLimiter, validateRequest({}), controller.generateMnemonic);
router.post(
  "/import",
  verifyToken,
  walletImportCaptcha,
  accountMutationRateLimiter,
  validateRequest(validator.importRules),
  controller.importAccount,
);
router.get("/", verifyToken, validateRequest({}), controller.list);
router.get("/:id", verifyToken, validateRequest(validator.accountIdRules), controller.details);
router.patch("/:id", verifyToken, validateRequest(validator.updateRules), controller.update);
router.delete(
  "/:id/incomplete",
  verifyToken,
  validateRequest(validator.accountIdRules),
  controller.rollbackIncomplete,
);
router.delete("/:id", verifyToken, validateRequest(validator.accountIdRules), controller.remove);
module.exports = router;
