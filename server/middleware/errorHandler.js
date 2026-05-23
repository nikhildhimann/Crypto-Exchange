const { error: errorResponse } = require("../common/utils/apiResponse");
const logger = require("../common/utils/logger");
const errorCodes = require("../common/constants/errorCodes");
const appConfig = require("../config/app");

module.exports = function errorHandler(err, req, res, next) {
  logger.error("Request failed", {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    error: err.message,
    status: err.status || 500,
    code: err.code || errorCodes.INTERNAL_ERROR,
    ...(appConfig.nodeEnv !== "production" && err.stack ? { stack: err.stack } : {}),
  });

  const statusCode = err.status || 500;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const message =
    isClientError || appConfig.nodeEnv !== "production"
      ? err.message || "Request failed"
      : "Internal server error";

  return errorResponse(res, {
    statusCode,
    message,
    errorCode: err.code || errorCodes.INTERNAL_ERROR,
    errors: isClientError ? err.errors || null : null,
  });
};
