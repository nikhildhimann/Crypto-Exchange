const { getSupportedNetworkCodes } = require("../../config/chains");

const networkRule = `in:${getSupportedNetworkCodes().join(",")}`;

module.exports = {
  validateDestinationRules: {
    walletId: "required|mongoid",
    destinationAddress: "required|string|min:10|max:200|regex:^[a-zA-Z0-9:_\\-.]+$",
    asset: "string|max:50",
    destinationTag: "string|max:20|regex:^[0-9]+$",
    executionParams: "object",
  },
  previewRules: {
    walletId: "required|mongoid",
    destinationAddress: "required|string|min:10|max:200|regex:^[a-zA-Z0-9:_\\-.]+$",
    asset: "string|max:50",
    amount: "required|regex:^(?!0+(\\.0+)?$)[0-9]+(\\.[0-9]{1,18})?$",
    destinationTag: "string|max:20|regex:^[0-9]+$",
    executionParams: "object",
  },
  sendRules: {
    walletId: "required|mongoid",
    destinationAddress: "required|string|min:10|max:200|regex:^[a-zA-Z0-9:_\\-.]+$",
    asset: "string|max:50",
    amount: "required|regex:^(?!0+(\\.0+)?$)[0-9]+(\\.[0-9]{1,18})?$",
    destinationTag: "string|max:20|regex:^[0-9]+$",
    executionParams: "object",
  },
  transactionIdRules: {
    transactionId: "required|mongoid",
  },
  walletIdRules: {
    walletId: "required|mongoid",
  },
  walletTransactionsRules: {
    walletId: "required|mongoid",
    page: "integer",
    limit: "integer",
    status: "in:pending,success,failed",
    transactionType: "in:internal,external",
    direction: "in:incoming,outgoing",
    network: networkRule,
    startDate: "date",
    endDate: "date",
    search: "string|max:255",
  },
  transactionListRules: {
    page: "integer",
    limit: "integer",
    status: "in:pending,success,failed",
    transactionType: "in:internal,external",
    direction: "in:incoming,outgoing",
    network: networkRule,
    startDate: "date",
    endDate: "date",
    search: "string|max:255",
  },
};
