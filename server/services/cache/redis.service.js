const redisClient = require("../../config/redis");

module.exports = {
  client: redisClient,
  initialize() {
    return redisClient.initialize();
  },
  quit() {
    return redisClient.quit();
  },
  getStatus() {
    return redisClient.getStatus();
  },
  getKey(...parts) {
    return redisClient.getKey(...parts);
  },
  async get(key) {
    return redisClient.get(key);
  },
  async set(key, value, options) {
    return redisClient.set(key, value, options);
  },
  async setex(key, ttlSeconds, value, options) {
    return redisClient.setex(key, ttlSeconds, value, options);
  },
  async del(key, options) {
    return redisClient.del(key, options);
  },
  async exists(key, options) {
    return redisClient.exists(key, options);
  },
  async incr(key, options) {
    return redisClient.incr(key, options);
  },
  async expire(key, ttlSeconds, options) {
    return redisClient.expire(key, ttlSeconds, options);
  },
  async setnx(key, value, ttlSeconds, options) {
    return redisClient.setnx(key, value, ttlSeconds, options);
  },
  async getJson(key, options) {
    return redisClient.getJson(key, options);
  },
  async setJson(key, value, options) {
    return redisClient.setJson(key, value, options);
  },
  async eval(script, numberOfKeys, args, options) {
    return redisClient.eval(script, numberOfKeys, args, options);
  },
};
