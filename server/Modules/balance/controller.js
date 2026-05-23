const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const service = require("./service");

exports.list = asyncHandler(async (req, res) => {
  const force = String(req.query.force || "").trim().toLowerCase() === "true";
  const result = await service.listBalances(req.user._id, {
    includeSummary: true,
    force,
  });
  return success(res, {
    message: "Balances fetched successfully",
    data: result.items,
    meta: {
      summary: result.summary,
    },
  });
});

exports.details = asyncHandler(async (req, res) => {
  const data = await service.getWalletBalance(req.user._id, req.params.walletId, {
    requestId: req.requestId,
    force: String(req.query.force || "").trim().toLowerCase() === "true",
    trigger:
      String(req.query.force || "").trim().toLowerCase() === "true"
        ? "manual_refresh"
        : "balance_read",
  });
  return success(res, {
    message: "Wallet balance fetched successfully",
    data,
  });
});
