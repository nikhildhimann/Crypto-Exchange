const { randomId } = require("../common/utils/random");

module.exports = function requestContext(req, res, next) {
  req.requestId = req.headers["x-request-id"] || randomId("req");
  req.requestStartedAt = Date.now();
  res.setHeader("X-Request-Id", req.requestId);
  next();
};
