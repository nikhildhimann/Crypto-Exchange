const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const service = require("./service");

exports.list = asyncHandler(async (req, res) => {
  const result = await service.listWithdrawals(req.user._id, req.query);
  return success(res, {
    message: "Withdrawals fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

exports.request = asyncHandler(async (req, res) => {
  const data = await service.requestWithdrawal({
    ...req.body,
    userId: req.user._id,
    idempotencyKey: req.idempotency?.key || "",
  });
  return success(res, {
    statusCode: 201,
    message: "Withdrawal requested successfully",
    data,
  });
});
