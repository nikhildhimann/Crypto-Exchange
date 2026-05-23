module.exports = {
  getPolicies() {
    return {
      mfaRequiredForWithdrawals: true,
      seedAccessRestricted: true,
      signingIsolated: true,
    };
  },
};
