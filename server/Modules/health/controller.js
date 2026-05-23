const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const { getHealthPayload } = require("../../services/health.service");

exports.status = asyncHandler(async (req, res) => {
  return success(res, {
    message: "Health check successful",
    data: getHealthPayload(),
  });
});
