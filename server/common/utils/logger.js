const appConfig = require("../../config/app");
const { redactObject } = require("../../helpers/redact");

function write(level, message, meta) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redactObject(meta) } : {}),
  };
  console[level === "error" ? "error" : "log"](JSON.stringify(payload));
}

module.exports = {
  info(message, meta) {
    write("info", message, meta);
  },
  warn(message, meta) {
    write("warn", message, meta);
  },
  error(message, meta) {
    write("error", message, meta);
  },
  debug(message, meta) {
    if (appConfig.nodeEnv !== "production") {
      write("debug", message, meta);
    }
  },
};
