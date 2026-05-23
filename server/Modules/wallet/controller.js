const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const { normalizeExecutionParamsObject } = require("../../common/utils/executionParams");
const { applyNoStoreHeaders } = require("../../common/utils/responseSecurity");
const walletService = require("./service");

const MAX_OPTIONAL_JSON_LENGTH = 5000;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseOptionalJsonObject(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "object") {
    if (!isPlainObject(value)) {
      const error = new Error(`${fieldName} must be a valid JSON object`);
      error.status = 400;
      throw error;
    }

    return normalizeExecutionParamsObject(value, fieldName);
  }

  try {
    const serialized = String(value);
    if (serialized.length > MAX_OPTIONAL_JSON_LENGTH) {
      throw new Error("Input too large");
    }

    const parsed = JSON.parse(serialized);
    if (!isPlainObject(parsed)) {
      throw new Error("Invalid object");
    }

    return normalizeExecutionParamsObject(parsed, fieldName);
  } catch (parseError) {
    if (parseError?.status) {
      throw parseError;
    }

    const error = new Error(`${fieldName} must be a valid JSON object`);
    error.status = 400;
    throw error;
  }
}

exports.parseOptionalJsonObject = parseOptionalJsonObject;

exports.list = asyncHandler(async (req, res) => {
  const result = await walletService.listUserWallets(req.user._id, req.query);
  return success(res, {
    message: "Wallets fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

exports.create = asyncHandler(async (req, res) => {
  const wallet = await walletService.createWallet(req.user._id, req.body);
  return success(res, {
    statusCode: 201,
    message: "Wallet creation session started successfully",
    data: wallet,
  });
});

exports.createInit = asyncHandler(async (req, res) => {
  applyNoStoreHeaders(res);
  const payload = await walletService.generateRecoveryPhrase(req.user._id, req.body);
  return success(res, {
    statusCode: 201,
    message: "Recovery phrase generated successfully",
    data: payload,
  });
});

exports.confirmCreate = asyncHandler(async (req, res) => {
  const wallet = await walletService.confirmWalletCreation(req.user._id, req.body);
  return success(res, {
    statusCode: 201,
    message: "Wallet created successfully",
    data: wallet,
  });
});

exports.importWallet = asyncHandler(async (req, res) => {
  const wallet = await walletService.importWallet(req.user._id, req.body);
  return success(res, {
    statusCode: 201,
    message: "Wallet imported successfully",
    data: wallet,
  });
});

exports.createHbarWalletOnDemand = asyncHandler(async (req, res) => {
  const wallet = await walletService.createHbarWalletOnDemand(req.user._id, req.body);
  return success(res, {
    statusCode: 201,
    message: "Hedera wallet created successfully",
    data: wallet,
  });
});

exports.supportedChains = asyncHandler(async (req, res) => {
  const data = await walletService.getSupportedChains();
  return success(res, {
    message: "Supported chains fetched successfully",
    data,
  });
});

exports.details = asyncHandler(async (req, res) => {
  const data = await walletService.getWalletDetails(req.user._id, req.params.walletId);
  return success(res, {
    message: "Wallet fetched successfully",
    data,
  });
});

exports.receivePayload = asyncHandler(async (req, res) => {
  const data = await walletService.getReceivePayload(req.user._id, {
    walletId: req.params.walletId,
    asset: req.query.asset,
    amount: req.query.amount,
    executionParams: parseOptionalJsonObject(req.query.executionParams, "executionParams"),
    qrParams: parseOptionalJsonObject(req.query.qrParams, "qrParams"),
  });
  return success(res, {
    message: "Receive payload fetched successfully",
    data,
  });
});

exports.receiveQr = asyncHandler(async (req, res) => {
  const data = await walletService.generateReceiveQr(req.user._id, {
    walletId: req.params.walletId,
    asset: req.query.asset,
    amount: req.query.amount,
    executionParams: parseOptionalJsonObject(req.query.executionParams, "executionParams"),
    qrParams: parseOptionalJsonObject(req.query.qrParams, "qrParams"),
  });
  return success(res, {
    message: "Receive QR generated successfully",
    data,
  });
});
