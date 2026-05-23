const express = require("express");

const controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const validator = require("./validator");
const { validateRequest } = require("../../middleware/validateRequest");

const router = express.Router();

router.get("/", verifyToken, validateRequest(validator.listRules), controller.list);

module.exports = router;
