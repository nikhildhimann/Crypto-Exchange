const express = require("express");

const controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");
const validator = require("./validator");
const { createRateLimiter, profiles } = require("../../middleware/rateLimiter");

const router = express.Router();
const swapRateLimiter = createRateLimiter({
  ...profiles.transactionStrict,
  keySuffix: "swap",
});

router.get("/pairs", verifyToken, validateRequest({}), controller.pairs);
router.post(
  "/preview",
  verifyToken,
  swapRateLimiter,
  validateRequest(validator.previewRules),
  controller.preview,
);
router.post(
  "/review",
  verifyToken,
  swapRateLimiter,
  validateRequest(validator.executeRules),
  controller.review,
);
router.post(
  "/execute",
  verifyToken,
  swapRateLimiter,
  validateRequest(validator.executeRules),
  controller.execute,
);
router.get(
  "/:swapId",
  verifyToken,
  validateRequest(validator.swapIdRules),
  controller.details,
);
router.get(
  "/history/list",
  verifyToken,
  validateRequest({}),
  controller.history,
);

module.exports = router;
