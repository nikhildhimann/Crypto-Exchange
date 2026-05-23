function success(res, { message = "Success", data = null, meta = null, statusCode = 200 } = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta,
    requestId: res.req.requestId,
  });
}

function error(
  res,
  { message = "Request failed", errorCode = "INTERNAL_ERROR", errors = null, statusCode = 500 } = {},
) {
  return res.status(statusCode).json({
    success: false,
    message,
    errorCode,
    errors,
    requestId: res.req.requestId,
  });
}

module.exports = { success, error };
