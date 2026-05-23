const { defaultChain } = require("../../config/chains");
const { getAdapter } = require("../chainAdapters/registry");

async function deriveKeyMaterial({ chain = defaultChain, mnemonic }) {
  const adapter = getAdapter(chain);
  return adapter.wallet.importWalletFromMnemonic(mnemonic);
}

module.exports = {
  deriveKeyMaterial,
};
