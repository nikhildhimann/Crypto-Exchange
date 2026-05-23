const express = require("express");
const controller = require("./controller");
const validator = require("./validator");
const { validateRequest } = require("../../middleware/validateRequest");

const router = express.Router();

/**
 * Public market price endpoints
 */
router.get("/prices", validateRequest(validator.pricesRules), controller.getPrices);
router.get("/chart/:asset", validateRequest(validator.chartRules), controller.getChart);
router.get("/stats/:asset", validateRequest(validator.statsRules), controller.getStats);

module.exports = router;
