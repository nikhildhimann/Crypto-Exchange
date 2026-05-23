const { buildUriQrPayload, pickScalarEntries } = require("../common/qr");

module.exports = {
  buildQrPayload({ address, amount, executionParams, qrParams }) {
    const queryParams = {
      ...pickScalarEntries(executionParams),
      ...pickScalarEntries(qrParams),
    };

    return buildUriQrPayload({
      scheme: "bnb",
      address,
      amount,
      queryParams,
    });
  },
};
