const express = require("express");

const controller = require("./controller");
const createCaptchaMiddleware = require("../../middleware/antiBot");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");
const validator = require("./validator");
const { createRateLimiter, profiles } = require("../../middleware/rateLimiter");

const router = express.Router();
const walletImportCaptcha = createCaptchaMiddleware({ scope: "wallet_import" });
const walletMutationRateLimiter = createRateLimiter({
  ...profiles.walletMutationStrict,
  keySuffix: "wallet-mutation",
});
const walletImportRateLimiter = createRateLimiter({
  ...profiles.walletMutationStrict,
  keySuffix: "wallet-import",
  maxRequests: Math.min(profiles.walletMutationStrict.maxRequests, 5),
});

router.get("/", verifyToken, validateRequest(validator.listWalletRules), controller.list);
router.get("/supported-chains", verifyToken, validateRequest({}), controller.supportedChains);
router.get(
  "/:walletId/receive",
  verifyToken,
  validateRequest(validator.receivePayloadRules),
  controller.receivePayload,
);
router.get(
  "/:walletId/receive/qr",
  verifyToken,
  validateRequest(validator.receivePayloadRules),
  controller.receiveQr,
);
router.get(
  "/:walletId",
  verifyToken,
  validateRequest(validator.walletIdRules),
  controller.details,
);
router.post(
  "/create/init",
  verifyToken,
  walletMutationRateLimiter,
  validateRequest(validator.createWalletRules),
  controller.createInit,
);
router.post(
  "/",
  verifyToken,
  walletMutationRateLimiter,
  validateRequest(validator.createWalletRules),
  controller.create,
);
router.post(
  "/create/confirm",
  verifyToken,
  walletMutationRateLimiter,
  validateRequest(validator.confirmWalletRules),
  controller.confirmCreate,
);
router.post(
  "/import",
  verifyToken,
  walletImportCaptcha,
  walletImportRateLimiter,
  validateRequest(validator.importWalletRules),
  controller.importWallet,
);
router.post(
  "/hbar/on-demand",
  verifyToken,
  walletMutationRateLimiter,
  validateRequest(validator.createHbarWalletOnDemandRules),
  controller.createHbarWalletOnDemand,
);

module.exports = router;
