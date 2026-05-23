module.exports = {
  async enqueue(payload) {
    return { queue: "balance", payload };
  },
};
