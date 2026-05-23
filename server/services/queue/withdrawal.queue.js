module.exports = {
  async enqueue(payload) {
    return { queue: "withdrawal", payload };
  },
};
