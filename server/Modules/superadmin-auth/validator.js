const baseSessionRules = {
  deviceId: "string|max:255",
  deviceLabel: "string|max:255",
  platform: "string|max:100",
  appVersion: "string|max:100",
  biometricCapable: "boolean",
  metadata: "object",
};

module.exports = {
  loginRules: {
    email: "required|string|email|max:255",
    password: "required|string|min:8|max:100",
    ...baseSessionRules,
  },
  refreshRules: {
    refreshToken: "required|string",
    ...baseSessionRules,
  },
  logoutRules: {
    revokeAll: "boolean",
  },
};
