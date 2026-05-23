const express = require("express");

const controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const { allowRoles, validateRequest } = require("../../middleware/validateRequest");

const router = express.Router();

router.get("/", verifyToken, allowRoles(["admin", "superadmin"]), validateRequest({}), controller.list);

module.exports = router;
