module.exports = {
  listRules: {
    page: "integer",
    limit: "integer",
    isRead: "boolean",
  },
  notificationIdRules: {
    notificationId: "required|mongoid",
  },
};
