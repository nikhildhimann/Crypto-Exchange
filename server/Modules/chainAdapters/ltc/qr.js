const { buildUriQrPayload } = require("../common/qr");
const wallet = require("./wallet");

module.exports = {
  buildQrPayload({ address, amount, executionParams, qrParams }) {
    const normalizedAddress = wallet.normalizeAddress(address);

    return buildUriQrPayload({
      scheme: "litecoin",
      address: normalizedAddress,
      amount,
      queryParams: {
        ...(qrParams && typeof qrParams === "object" ? qrParams : {}),
        ...(executionParams && typeof executionParams === "object" ? executionParams : {}),
      },
      metadata: {
        chain: "ltc",
      },
    });
  },
};
