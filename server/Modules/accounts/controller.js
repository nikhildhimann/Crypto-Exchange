const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const { applyNoStoreHeaders } = require("../../common/utils/responseSecurity");
const accountService = require("./service");

exports.create = asyncHandler(async (req, res) => {
  applyNoStoreHeaders(res);
  const data = await accountService.createAccount(req.user._id, req.body);
  return success(res, {
    statusCode: 201,
    message: "Account created successfully",
    data,
  });
});

exports.generateMnemonic = asyncHandler(async (_req, res) => {
  applyNoStoreHeaders(res);
  const mnemonic = await accountService.generateMnemonic();
  return success(res, {
    message: "Mnemonic generated",
    data: { mnemonic },
  });
});

exports.importAccount = asyncHandler(async (req, res) => {
  applyNoStoreHeaders(res);
  const data = await accountService.importAccount(req.user._id, req.body);
  return success(res, {
    statusCode: 201,
    message: "Account imported successfully",
    data,
  });
});

exports.list = asyncHandler(async (req, res) => {
  const data = await accountService.listAccounts(req.user._id);
  return success(res, {
    message: "Accounts fetched successfully",
    data,
  });
});

exports.details = asyncHandler(async (req, res) => {
  const data = await accountService.getAccountById(req.user._id, req.params.id);
  return success(res, {
    message: "Account fetched successfully",
    data,
  });
});

exports.update = asyncHandler(async (req, res) => {
  const data = await accountService.updateAccount(req.user._id, req.params.id, req.body);
  return success(res, {
    message: "Account updated successfully",
    data,
  });
});

exports.remove = asyncHandler(async (req, res) => {
  const data = await accountService.archiveAccount(req.user._id, req.params.id);
  return success(res, {
    message: "Account archived successfully",
    data,
  });
});
exports.rollbackIncomplete = asyncHandler(async (req, res) => {
  const data = await accountService.archiveIncompleteAccount(req.user._id, req.params.id);
  return success(res, {
    message: "Incomplete account rolled back successfully",
    data,
  });
});
