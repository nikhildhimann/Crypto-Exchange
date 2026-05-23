const { sanitizeValue } = require("../helpers/sanitize");

module.exports = function sanitizeRequest(req, _res, next) {
  req.body = sanitizeValue(req.body || {});
  req.params = sanitizeValue(req.params || {});
  req.query = sanitizeValue(req.query || {});
  next();
};
