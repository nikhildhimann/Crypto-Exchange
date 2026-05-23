const { buildTextQrPayload } = require("../common/qr");

module.exports = {
  buildQrPayload({ address }) {
    return buildTextQrPayload({
      text: address,
      format: "address",
      metadata: {
        scheme: "cardano",
      },
    });
  },
};
