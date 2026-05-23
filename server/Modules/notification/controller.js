const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const notificationService = require("../../services/notifications/service");

exports.list = asyncHandler(async (req, res) => {
  const [result, unreadCount] = await Promise.all([
    notificationService.listNotifications(req.user._id, req.query),
    notificationService.getUnreadCount(req.user._id),
  ]);

  return success(res, {
    message: "Notifications fetched successfully",
    data: result.data,
    meta: {
      ...result.meta,
      unreadCount,
    },
  });
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await notificationService.getUnreadCount(req.user._id);

  return success(res, {
    message: "Unread notification count fetched successfully",
    data: { unreadCount },
  });
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.user._id,
    req.params.notificationId,
  );

  return success(res, {
    message: "Notification marked as read successfully",
    data: notification,
  });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user._id);

  return success(res, {
    message: "All notifications marked as read successfully",
    data: result,
  });
});

exports.stream = (req, res) => {
  res.status(501).json({
    success: false,
    message:
      "Notification streaming is temporarily disabled. Use authenticated notification polling endpoints instead.",
  });
};
exports.clearAll = asyncHandler(async (req, res) => {
  const result = await notificationService.clearAll(req.user._id);

  return success(res, {
    message: "All notifications cleared successfully",
    data: result,
  });
});
