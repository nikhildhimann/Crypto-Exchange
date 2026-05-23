const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const service = require("./service");

exports.list = asyncHandler(async (req, res) => {
  const result = await service.listDeposits(req.user._id, req.query);
  return success(res, {
    message: "Deposits fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});
