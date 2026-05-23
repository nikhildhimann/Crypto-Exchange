const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const userService = require("./service");

exports.me = asyncHandler(async (req, res) => {
  const user = await userService.getCurrentUser(req.user._id);
  return success(res, {
    message: "Wallet owner profile fetched successfully",
    data: user,
  });
});

exports.list = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.query);
  return success(res, {
    message: "Users fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

exports.update = asyncHandler(async (req, res) => {
  const user = await userService.updateUserById(req.params.id, req.body);
  return success(res, {
    message: "Wallet owner profile updated successfully",
    data: user,
  });
});

exports.remove = asyncHandler(async (req, res) => {
  await userService.deleteUserById(req.params.id);
  return success(res, {
    message: "User deleted successfully",
  });
});
