const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const service = require("./service");

exports.list = asyncHandler(async (req, res) => {
  const data = await service.listTreasuryWallets();
  return success(res, {
    message: "Treasury wallets fetched successfully",
    data,
  });
});
