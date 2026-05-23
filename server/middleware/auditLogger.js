const logger = require("../common/utils/logger");
const appConfig = require("../config/app");

module.exports = function auditLogger(req, res, next) {
  if (!appConfig.requestLoggingEnabled) {
    return next();
  }

  res.on("finish", () => {
    logger.info("HTTP request completed", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - req.requestStartedAt,
      userId: req.user?._id || null,
    });
  });

  next();
};
