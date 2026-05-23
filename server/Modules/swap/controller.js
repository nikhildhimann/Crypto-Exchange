const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const service = require("./service");

exports.pairs = asyncHandler(async (req, res) => {
  const data = await service.getSupportedPairs({
    userId: req.user?._id,
    requestId: req.requestId,
  });
  return success(res, {
    message: "Supported swap routes fetched successfully",
    data,
  });
});

exports.preview = asyncHandler(async (req, res) => {
  const data = await service.previewSwap({
    ...req.body,
    userId: req.user._id,
    requestId: req.requestId,
  });

  return success(res, {
    statusCode: 201,
    message: "Swap preview generated successfully",
    data,
  });
});

exports.review = asyncHandler(async (req, res) => {
  const data = await service.reviewSwap({
    ...req.body,
    userId: req.user._id,
    requestId: req.requestId,
  });

  return success(res, {
    message: "Swap review validated successfully",
    data,
  });
});

exports.execute = asyncHandler(async (req, res) => {
  const data = await service.executeSwap({
    ...req.body,
    userId: req.user._id,
    requestId: req.requestId,
  });

  return success(res, {
    message: "Swap execution processed successfully",
    data,
  });
});

exports.details = asyncHandler(async (req, res) => {
  const data = await service.getSwapById(req.user._id, req.params.swapId, {
    requestId: req.requestId,
    refresh: true,
  });

  return success(res, {
    message: "Swap fetched successfully",
    data,
  });
});

exports.history = asyncHandler(async (req, res) => {
  const result = await service.getSwapHistory(req.user._id, req.query);
  return success(res, {
    message: "Swap history fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});
