const ACCOUNT_NAME_RULE = "string|min:1|max:50|regex:^[a-zA-Z0-9\\s_-]+$";
const MNEMONIC_RULE = "required|string|min:12|max:250|regex:^[a-zA-Z\\s]+$";

module.exports = {
  createRules: {
    name: ACCOUNT_NAME_RULE,
    type: "in:personal,business,trading,custom",
  },
  importRules: {
    name: ACCOUNT_NAME_RULE,
    type: "in:personal,business,trading,custom",
    mnemonic: MNEMONIC_RULE,
  },
  accountIdRules: {
    id: "required|mongoid",
  },
  updateRules: {
    id: "required|mongoid",
    name: ACCOUNT_NAME_RULE,
    type: "in:personal,business,trading,custom",
  },
};
