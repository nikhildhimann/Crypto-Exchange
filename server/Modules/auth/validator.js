const baseSessionRules = {
  deviceId: "string|max:255",
  deviceLabel: "string|max:255",
  platform: "string|max:100",
  appVersion: "string|max:100",
  biometricCapable: "boolean",
  metadata: "object",
};

module.exports = {
  createSessionRules: baseSessionRules,
  refreshRules: {
    refreshToken: "required|string",
    deviceId: "string|max:255",
    deviceLabel: "string|max:255",
    platform: "string|max:100",
    appVersion: "string|max:100",
    biometricCapable: "boolean",
    metadata: "object",
  },
  logoutRules: {
    revokeAll: "boolean",
  },
  revokeSessionRules: {
    sessionId: "required|string",
  },
};
