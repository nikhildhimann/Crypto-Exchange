const express = require("express");
const controller = require("./controller");
const { validateRequest } = require("../../middleware/validateRequest");

const router = express.Router();

router.get("/", validateRequest({}), controller.status);

module.exports = router;
