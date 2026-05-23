const { buildTextQrPayload } = require("../common/qr");
const wallet = require("./wallet");

module.exports = {
  buildQrPayload({ address, wallet: walletRecord, chainContext }) {
    const network = walletRecord?.network || chainContext?.network || undefined;
    const normalizedAddress = wallet.normalizeAddress(address, network);
    const displayAddress = wallet.formatDisplayAddress(normalizedAddress, network);
    const addressFormats = wallet.getAddressFormats(normalizedAddress, network);

    return buildTextQrPayload({
      text: displayAddress,
      format: "address",
      metadata: {
        scheme: "ton",
        chain: "ton",
        network: network || null,
        address: displayAddress,
        canonicalAddress: normalizedAddress,
        rawAddress: addressFormats.raw,
        bounceableAddress: addressFormats.bounceable,
        nonBounceableAddress: addressFormats.nonBounceable,
      },
    });
  },
};
