const logger = require("../common/utils/logger");

const WEBHOOK_ROUTE_PATTERN = /\/webhook\/(?:tron|btc)$/i;

function getRequestPath(req) {
  return String(req.originalUrl || req.url || "")
    .split("?")[0]
    .replace(/\/+$/, "");
}

function isWebhookRoute(req) {
  return WEBHOOK_ROUTE_PATTERN.test(getRequestPath(req));
}

function capture(req, _res, buf) {
  if (!isWebhookRoute(req) || !Buffer.isBuffer(buf)) {
    return;
  }

  req.rawBody = Buffer.from(buf);
}

function rawBody(req, res, next) {
  if (!isWebhookRoute(req)) {
    return next();
  }

  if (Buffer.isBuffer(req.rawBody)) {
    return next();
  }

  logger.warn("Rejected webhook request due to missing raw body", {
    requestId: req.requestId || null,
    path: getRequestPath(req),
    ip: req.ip || null,
  });

  return res.status(400).json({
    success: false,
    message: "Invalid webhook request",
  });
}

module.exports = rawBody;
module.exports.capture = capture;
module.exports.isWebhookRoute = isWebhookRoute;
