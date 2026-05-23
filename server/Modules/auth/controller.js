const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const { applyNoStoreHeaders } = require("../../common/utils/responseSecurity");
const authService = require("./service");

function buildSessionContext(req) {
  return {
    ...(req.body || {}),
    ipAddress: req.ip || "",
    userAgent: req.headers["user-agent"] || "",
  };
}

exports.createSession = asyncHandler(async (req, res) => {
  applyNoStoreHeaders(res);
  const data = await authService.createSession(buildSessionContext(req));
  return success(res, {
    statusCode: 201,
    message: "Session created successfully",
    data,
  });
});

exports.refresh = asyncHandler(async (req, res) => {
  applyNoStoreHeaders(res);
  const data = await authService.refreshSession(buildSessionContext(req));
  return success(res, {
    message: "Session refreshed successfully",
    data,
  });
});

exports.logout = asyncHandler(async (req, res) => {
  const data = await authService.logout({
    userId: req.user?._id,
    sessionId: req.authSessionId || "",
    revokeAll: Boolean(req.body?.revokeAll),
  });
  return success(res, {
    message: "Session revoked successfully",
    data,
  });
});

exports.listSessions = asyncHandler(async (req, res) => {
  const data = await authService.listSessions(req.user._id, req.authSessionId || "");
  return success(res, {
    message: "Sessions fetched successfully",
    data,
  });
});

exports.revokeSession = asyncHandler(async (req, res) => {
  const data = await authService.revokeSession({
    userId: req.user._id,
    sessionId: req.params.sessionId,
    currentSessionId: req.authSessionId || "",
  });
  return success(res, {
    message: "Session revoked successfully",
    data,
  });
});
