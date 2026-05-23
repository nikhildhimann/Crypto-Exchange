function isFinalStatus(status) {
  return ["confirmed", "failed", "cancelled"].includes(status);
}

module.exports = {
  isFinalStatus,
};
