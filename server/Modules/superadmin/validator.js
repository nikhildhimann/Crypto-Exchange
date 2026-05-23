function buildListRules(extra = {}) {
  return {
    page: "integer|min:1|max:1000000",
    limit: "integer|min:1|max:100",
    search: "string|max:120",
    sortBy: "string|max:50",
    sortOrder: "string|in:asc,desc",
    ...extra,
  };
}

module.exports = {
  userListRules: buildListRules({
    role: "string|max:50",
    status: "string|max:80",
    primaryChain: "string|max:50",
    createdFrom: "date",
    createdTo: "date",
    lastAccessFrom: "date",
    lastAccessTo: "date",
  }),
  userDetailRules: {
    userId: "required|mongoid",
  },
  accountListRules: buildListRules({
    userId: "mongoid",
    status: "string|max:50",
    type: "string|max:50",
    createdFrom: "date",
    createdTo: "date",
  }),
  accountDetailRules: {
    accountId: "required|mongoid",
  },
  walletListRules: buildListRules({
    userId: "mongoid",
    accountId: "mongoid",
    chain: "string|max:50",
    network: "string|max:50",
    sourceType: "string|max:50",
    isImported: "boolean",
    hidden: "boolean",
    archived: "boolean",
    createdFrom: "date",
    createdTo: "date",
  }),
  walletDetailRules: {
    walletId: "required|mongoid",
  },
  transactionListRules: buildListRules({
    userId: "mongoid",
    accountId: "mongoid",
    walletId: "mongoid",
    chain: "string|max:50",
    network: "string|max:50",
    status: "string|max:50",
    direction: "string|max:50",
    transactionType: "string|max:50",
    asset: "string|max:50",
    createdFrom: "date",
    createdTo: "date",
    chainTimestampFrom: "date",
    chainTimestampTo: "date",
  }),
  transactionDetailRules: {
    transactionId: "required|mongoid",
  },
  depositListRules: buildListRules({
    userId: "mongoid",
    accountId: "mongoid",
    walletId: "mongoid",
    chain: "string|max:50",
    asset: "string|max:50",
    status: "string|max:50",
    createdFrom: "date",
    createdTo: "date",
  }),
  depositDetailRules: {
    depositId: "required|mongoid",
  },
  withdrawalListRules: buildListRules({
    userId: "mongoid",
    accountId: "mongoid",
    walletId: "mongoid",
    chain: "string|max:50",
    asset: "string|max:50",
    status: "string|max:50",
    createdFrom: "date",
    createdTo: "date",
  }),
  withdrawalDetailRules: {
    withdrawalId: "required|mongoid",
  },
  sessionListRules: buildListRules({
    scope: "string|in:all,user,superadmin",
    userId: "mongoid",
    superadminId: "mongoid",
    status: "string|max:50",
    platform: "string|max:100",
    deviceId: "string|max:255",
    createdFrom: "date",
    createdTo: "date",
    lastUsedFrom: "date",
    lastUsedTo: "date",
  }),
  sessionDetailRules: {
    sessionId: "required|string|max:255",
    scope: "string|in:user,superadmin",
  },
  auditListRules: buildListRules({
    userId: "mongoid",
    action: "string|max:100",
    resource: "string|max:100",
    status: "string|max:50",
    createdFrom: "date",
    createdTo: "date",
  }),
  auditDetailRules: {
    auditId: "required|mongoid",
  },
  treasuryListRules: buildListRules({
    chain: "string|max:50",
    asset: "string|max:50",
    walletType: "string|max:50",
    status: "string|max:50",
  }),
  treasuryDetailRules: {
    treasuryId: "required|mongoid",
  },
  chainListRules: buildListRules({
    family: "string|max:50",
    status: "string|max:50",
    enabled: "boolean",
  }),
  chainDetailRules: {
    chainId: "required|string|max:50",
  },
  jobListRules: buildListRules({
    status: "string|max:50",
    enabled: "boolean",
  }),
  jobDetailRules: {
    jobName: "required|string|max:100",
  },
  overviewRules: {},
  settingsRules: {},
};
