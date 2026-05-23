module.exports = {
  async enqueue(payload) {
    return { queue: "treasury", payload };
  },
};
