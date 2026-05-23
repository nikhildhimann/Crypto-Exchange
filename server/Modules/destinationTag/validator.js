module.exports = {
  listRules: {
    accountId: "mongoid",
    walletId: "mongoid",
  },
  createRules: {
    walletId: "required|mongoid",
    accountId: "mongoid",
  },
};
