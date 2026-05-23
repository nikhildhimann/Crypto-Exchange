const listRules = {
  walletId: "required|mongoid",
  chain: "string",
  page: "integer",
  limit: "integer",
  showHidden: "boolean",
  showSpam: "boolean",
  search: "string",
  contractAddress: "string",
  collectionName: "string",
  standard: "string",
  sortBy: "string",
  sortOrder: "in:asc,desc",
};

const syncRules = {
  walletId: "required|mongoid",
  force: "boolean",
};

const refreshRules = {
  walletId: "required|mongoid",
  chain: "string",
};

const hideRules = {
  nftId: "required|mongoid",
  hidden: "required|boolean",
};

const detailRules = {
  id: "required|string",
};

const collectionsRules = {
  walletId: "required|mongoid",
  chain: "string",
  page: "integer",
  limit: "integer",
  showHidden: "boolean",
  showSpam: "boolean",
};

const collectionDetailRules = {
  walletId: "required|mongoid",
  contractAddress: "required|string",
};

const activityFeedRules = {
  id: "required|mongoid",
  page: "integer",
  limit: "integer",
};

const estimateFeeRules = {
  walletId: "required|mongoid",
  nftId: "required|mongoid",
  toAddress: "required|string",
  amount: "string",
};

const transferRules = {
  walletId: "required|mongoid",
  nftId: "required|mongoid",
  toAddress: "required|string",
  amount: "string",
};

const syncStatusRules = {
  walletId: "required|mongoid",
};

module.exports = {
  listRules,
  syncRules,
  refreshRules,
  hideRules,
  detailRules,
  collectionsRules,
  collectionDetailRules,
  activityFeedRules,
  estimateFeeRules,
  transferRules,
  syncStatusRules,
};
