const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const DestinationTagService = require("./service");

exports.getDestinationTags = asyncHandler(async (req, res) => {
  const tags = await DestinationTagService.getTagsByUser(req.user._id, {
    filters: {
      ...(req.query.accountId ? { accountId: req.query.accountId } : {}),
      ...(req.query.walletId ? { walletId: req.query.walletId } : {}),
    },
  });

  return success(res, {
    message: "Destination tags fetched successfully",
    data: tags,
    meta: { count: tags.length },
  });
});

exports.createDestinationTag = asyncHandler(async (req, res) => {
  const tag = await DestinationTagService.assignTagToWallet(
    req.user._id,
    req.body.accountId,
    req.body.walletId,
  );

  return success(res, {
    statusCode: 201,
    message: "Destination tag assigned successfully",
    data: tag,
  });
});
