module.exports = {
  async enqueue(payload) {
    return { queue: "deposit", payload };
  },
};
