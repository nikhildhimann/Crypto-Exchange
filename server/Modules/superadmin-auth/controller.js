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

exports.login = asyncHandler(async (req, res) => {
  applyNoStoreHeaders(res);
  const data = await authService.login(buildSessionContext(req));
  return success(res, {
    statusCode: 201,
    message: "Superadmin session created successfully",
    data,
  });
});

exports.refresh = asyncHandler(async (req, res) => {
  applyNoStoreHeaders(res);
  const data = await authService.refreshSession(buildSessionContext(req));
  return success(res, {
    message: "Superadmin session refreshed successfully",
    data,
  });
});

exports.logout = asyncHandler(async (req, res) => {
  const data = await authService.logout({
    superadminId: req.superadmin?._id,
    sessionId: req.superadminSessionId || "",
    revokeAll: Boolean(req.body?.revokeAll),
  });
  return success(res, {
    message: "Superadmin session revoked successfully",
    data,
  });
});

exports.me = asyncHandler(async (req, res) => {
  const data = await authService.getCurrentSuperadmin(req.superadmin._id);
  return success(res, {
    message: "Superadmin profile fetched successfully",
    data,
  });
});
