const express = require("express");

const controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");
const validator = require("./validator");
const { createRateLimiter, profiles } = require("../../middleware/rateLimiter");

const router = express.Router();
const transactionRateLimiter = createRateLimiter({
  ...profiles.transactionStrict,
  keySuffix: "withdrawal",
});

router.get("/", verifyToken, validateRequest(validator.listRules), controller.list);
router.post("/", verifyToken, transactionRateLimiter, validateRequest(validator.requestRules), controller.request);

module.exports = router;
