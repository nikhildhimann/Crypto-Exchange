const express = require("express");
const controller = require("./controller");
const authMiddleware = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");
const validator = require("./validator");

const router = express.Router();

router.get("/", authMiddleware, validateRequest(validator.listRules), controller.getDestinationTags);

router.post("/", authMiddleware, validateRequest(validator.createRules), controller.createDestinationTag);

module.exports = router;
