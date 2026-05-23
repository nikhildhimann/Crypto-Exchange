const { buildUriQrPayload, pickScalarEntries } = require("../common/qr");

module.exports = {
  buildQrPayload({ address, amount, executionParams, qrParams }) {
    const queryParams = {
      ...pickScalarEntries(executionParams),
      ...pickScalarEntries(qrParams),
    };

    if (
      queryParams.value === undefined &&
      amount !== undefined &&
      amount !== null &&
      amount !== ""
    ) {
      queryParams.value = String(amount);
    }

    return buildUriQrPayload({
      scheme: "ethereum",
      address,
      queryParams,
      metadata: {
        chainSpecific: {
          family: "evm",
          chain: "polygon",
        },
      },
    });
  },
};
