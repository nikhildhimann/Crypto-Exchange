const { EventEmitter } = require("events");

const emitter = new EventEmitter();

module.exports = {
  emitter,
  emit(event, payload) {
    emitter.emit(event, payload);
  },
  on(event, handler) {
    emitter.on(event, handler);
  },
  off(event, handler) {
    emitter.off(event, handler);
  },
};
