const { buildUriQrPayload } = require("../common/qr");

module.exports = {
    buildQrPayload({ address, amount, executionParams, qrParams }) {
        return buildUriQrPayload({
            scheme: "dogecoin",
            address,
            amount,
            queryParams: {
                ...(qrParams && typeof qrParams === "object" ? qrParams : {}),
                ...(executionParams && typeof executionParams === "object"
                    ? executionParams
                    : {}),
            },
            metadata: {
                chain: "doge",
            },
        });
    },
};