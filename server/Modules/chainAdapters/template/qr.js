const { buildTextQrPayload } = require("../common/qr");

module.exports = {
  buildQrPayload({ address, amount, executionParams, qrParams }) {
    return buildTextQrPayload({
      text:
        qrParams?.value ||
        executionParams?.value ||
        amount ||
        address ||
        "",
      metadata: {
        fallback: true,
      },
    });
  },
};
