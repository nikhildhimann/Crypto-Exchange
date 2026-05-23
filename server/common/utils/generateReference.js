const { randomHex } = require("./random");

module.exports = function generateReference(prefix = "REF") {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${timestamp}-${randomHex(4).toUpperCase()}`;
};
