const { buildUriQrPayload } = require("../common/qr");

module.exports = {
  buildQrPayload({ address, amount, destinationTag, executionParams, qrParams }) {
    const resolvedDestinationTag =
      qrParams?.destinationTag ??
      executionParams?.destinationTag ??
      destinationTag;
    const queryParams = {};

    if (
      resolvedDestinationTag !== undefined &&
      resolvedDestinationTag !== null &&
      resolvedDestinationTag !== ""
    ) {
      queryParams.dt = String(resolvedDestinationTag);
    }

    return buildUriQrPayload({
      scheme: "xrp",
      address,
      amount,
      queryParams,
      metadata: {
        chainSpecific: {
          destinationTag:
            resolvedDestinationTag === undefined ||
            resolvedDestinationTag === null ||
            resolvedDestinationTag === ""
              ? null
              : String(resolvedDestinationTag),
        },
      },
    });
  },
};
