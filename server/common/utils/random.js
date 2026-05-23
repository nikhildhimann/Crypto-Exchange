const crypto = require("crypto");

function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function randomInt(min = 0, max = 999999) {
  return crypto.randomInt(min, max + 1);
}

function randomId(prefix = "id") {
  return `${prefix}_${randomHex(8)}`;
}

module.exports = {
  randomHex,
  randomInt,
  randomId,
};
