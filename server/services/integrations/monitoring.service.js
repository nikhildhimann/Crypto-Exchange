const logger = require("../../common/utils/logger");

module.exports = {
  capture(event, payload) {
    logger.info(`Monitoring event: ${event}`, payload);
  },
};
