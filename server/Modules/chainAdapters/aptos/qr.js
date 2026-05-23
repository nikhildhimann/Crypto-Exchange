const { buildUriQrPayload } = require("../common/qr");
const wallet = require("./wallet");

module.exports = {
  buildQrPayload({ address, amount, wallet: walletRecord, chainContext }) {
    const normalizedAddress = wallet.normalizeAddress(address);

    return buildUriQrPayload({
      scheme: "aptos",
      address: normalizedAddress,
      amount,
      metadata: {
        scheme: "aptos",
        chain: "aptos",
        network: walletRecord?.network || chainContext?.network || null,
        address: normalizedAddress,
      },
    });
  },
};
