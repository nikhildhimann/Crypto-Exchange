const express = require("express");

const controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const { validateRequest } = require("../../middleware/validateRequest");
const validator = require("./validator");

const router = express.Router();

router.get("/stream", verifyToken, validateRequest({}), controller.stream);
router.get("/", verifyToken, validateRequest(validator.listRules), controller.list);
router.get("/unread-count", verifyToken, validateRequest({}), controller.getUnreadCount);
router.patch("/read-all", verifyToken, validateRequest({}), controller.markAllAsRead);
router.patch(
  "/:notificationId/read",
  verifyToken,
  validateRequest(validator.notificationIdRules),
  controller.markAsRead,
);
router.delete("/clear-all", verifyToken, validateRequest({}), controller.clearAll);

// single delete for future 
// router.delete(
//   "/:notificationId",
//   verifyToken,
//   validateRequest(validator.notificationIdRules),
//   controller.deleteOne,
// );

module.exports = router;
