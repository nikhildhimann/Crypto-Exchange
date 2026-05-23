const { buildTextQrPayload } = require("../common/qr");
const wallet = require("./wallet");

module.exports = {
  buildQrPayload({ address, wallet: walletRecord, chainContext }) {
    const normalizedAddress = wallet.normalizeAddress(address);

    return buildTextQrPayload({
      text: normalizedAddress,
      format: "address",
      metadata: {
        scheme: "sui",
        chain: "sui",
        network: walletRecord?.network || chainContext?.network || null,
        address: normalizedAddress,
      },
    });
  },
};
