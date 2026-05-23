function buildQrPayload(input = {}) {
  const address = String(input.address || "").trim();

  return {
    text: address,
    format: "address",
    metadata: {
      chain: "hbar",
      network: input.wallet?.network || input.chainContext?.network || null,
      address,
    },
  };
}

module.exports = {
  buildQrPayload,
};
