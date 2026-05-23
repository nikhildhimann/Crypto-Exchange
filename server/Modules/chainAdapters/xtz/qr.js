function buildQrPayload(address) {
  const normalizedAddress = String(address || "").trim();

  if (!normalizedAddress) {
    return "";
  }

  return `tezos:${normalizedAddress}`;
}

module.exports = {
  buildQrPayload,
};
