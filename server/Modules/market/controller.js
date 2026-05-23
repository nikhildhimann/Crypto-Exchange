const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const service = require("./service");

/**
 * Controller for public market price operations
 */
exports.getPrices = asyncHandler(async (req, res) => {
  const { assets: assetString } = req.query;
  const assets = String(assetString || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (!assets.length) {
    return success(res, {
      message: "Prices fetched successfully",
      data: {},
    });
  }

  const data = await service.getMarketData(assets);

  return success(res, {
    message: "Prices fetched successfully",
    data,
  });
});

/**
 * Controller for asset historical chart data
 */
exports.getChart = asyncHandler(async (req, res) => {
  const { asset } = req.params;
  const { range } = req.query;

  const data = await service.getMarketChart(asset, range);

  return success(res, {
    message: "Chart data fetched successfully",
    data,
  });
});

/**
 * Controller for asset market statistics
 */
exports.getStats = asyncHandler(async (req, res) => {
  const { asset } = req.params;

  const data = await service.getMarketStats(asset);

  return success(res, {
    message: "Market stats fetched successfully",
    data,
  });
});
