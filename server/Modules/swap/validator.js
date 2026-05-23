module.exports = {
  swapIdRules: {
    swapId: "required|mongoid",
  },
  previewRules: {
    fromWalletId: "required|mongoid",
    toWalletId: "required|mongoid",
    amount: "required|regex:^(?!0+(\\.0+)?$)[0-9]+(\\.[0-9]{1,18})?$",
  },
  executeRules: {
    swapId: "required|mongoid",
  },
};
