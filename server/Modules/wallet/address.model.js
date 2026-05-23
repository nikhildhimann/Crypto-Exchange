const { ajModel } = require("../../common/classes/Model");
const chains = require("../../common/constants/chains");
const {
  defaultChain,
  getConfiguredNetworkCodes,
} = require("../../config/chains");

function validateChainNetwork(network) {
  return getConfiguredNetworkCodes(this.chain || defaultChain).includes(
    String(network || "").toLowerCase(),
  );
}

const schema = {
  walletId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "Wallet",
    required: true,
  },
  userId: {
    type: require("mongoose").Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  chain: {
    type: String,
    enum: chains,
    required: true,
  },
  network: {
    type: String,
    enum: getConfiguredNetworkCodes(),
    required: true,
    validate: {
      validator: validateChainNetwork,
      message(props) {
        const chain = this.chain || defaultChain;
        return `Network "${props.value}" is not supported for chain "${chain}"`;
      },
    },
  },
  address: {
    type: String,
    required: true,
  },
  memo: {
    type: String,
    default: "",
  },
  derivationPath: {
    type: String,
    default: "",
  },
  branch: {
    type: Number,
    default: 0,
  },
  addressIndex: {
    type: Number,
    default: 0,
  },
  addressType: {
    type: String,
    default: "",
  },
  purpose: {
    type: String,
    default: "receive",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isChange: {
    type: Boolean,
    default: false,
  },
  metadata: {
    type: Object,
    default: {},
  },
  status: {
    type: String,
    default: "active",
  },
};

module.exports = new ajModel("WalletAddress", schema)
  .index({ walletId: 1, address: 1 }, { unique: true })
  .index({ walletId: 1, status: 1, purpose: 1, addressIndex: 1 })
  .index({ chain: 1, network: 1, address: 1 })
  .getModel();
