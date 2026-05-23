const express = require("express");

const controller = require("./controller");
const validator = require("./validator");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");

const router = express.Router();

router.get("/", verifyToken, validateRequest(validator.listRules), controller.list);
router.get(
  "/:walletId",
  verifyToken,
  validateRequest(validator.walletIdRules),
  controller.details,
);

module.exports = router;
