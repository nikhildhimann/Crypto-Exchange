const express = require("express");

const controller = require("./controller");
const validator = require("./validator");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest, allowRoles } = require("../../middleware/validateRequest");

const router = express.Router();

router.get("/me", verifyToken, validateRequest({}), controller.me);
router.get("/", verifyToken, allowRoles(["admin", "superadmin"]), validateRequest(validator.listRules), controller.list);
router.patch(
  "/:id",
  verifyToken,
  allowRoles(["admin", "superadmin"]),
  validateRequest(validator.updateRules),
  controller.update,
);
router.delete(
  "/:id",
  verifyToken,
  allowRoles(["admin", "superadmin"]),
  validateRequest({ id: "required|mongoid" }),
  controller.remove,
);

module.exports = router;
