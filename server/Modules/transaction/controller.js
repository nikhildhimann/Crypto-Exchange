const asyncHandler = require("../../common/utils/asyncHandler");
const { success } = require("../../common/utils/apiResponse");
const { normalizeExecutionParamsObject } = require("../../common/utils/executionParams");
const logger = require("../../common/utils/logger");
const service = require("./service");
const {
  mapDestinationValidation,
  mapTransactionDetail,
  mapTransactionPreview,
  mapTransactionSummary,
} = require("./response.mapper");

function normalizeLegacyExecutionParams(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const normalized = {
    ...payload,
    executionParams: normalizeExecutionParamsObject(payload.executionParams),
  };

  if (normalized.destinationTag !== undefined) {
    normalized.executionParams.destinationTag = normalized.destinationTag;
  }

  delete normalized.destinationTag;
  return normalized;
}

function serializeTransactionPayload(payload, mapper = mapTransactionSummary) {
  if (Array.isArray(payload)) {
    return payload.map((item) => mapper(item));
  }

  return mapper(payload);
}

exports.list = asyncHandler(async (req, res) => {
  const result = await service.listUserTransactions(req.user._id, req.query);
  return success(res, {
    message: "Transactions fetched successfully",
    data: serializeTransactionPayload(result.data, mapTransactionSummary),
    meta: result.meta,
  });
});

exports.preview = asyncHandler(async (req, res) => {
  const preview = await service.previewTransfer({
    ...normalizeLegacyExecutionParams(req.body),
    userId: req.user._id,
    requestId: req.requestId,
  });
  return success(res, {
    message: "Transaction preview generated successfully",
    data: serializeTransactionPayload(preview, mapTransactionPreview),
  });
});

exports.validateDestination = asyncHandler(async (req, res) => {
  const data = await service.validateDestination({
    ...normalizeLegacyExecutionParams(req.body),
    userId: req.user._id,
    requestId: req.requestId,
  });
  return success(res, {
    message: "Destination validated successfully",
    data: serializeTransactionPayload(data, mapDestinationValidation),
  });
});

exports.send = asyncHandler(async (req, res) => {
  const data = await service.sendTransaction({
    ...normalizeLegacyExecutionParams(req.body),
    userId: req.user._id,
    requestId: req.requestId,
    idempotencyKey: req.idempotency?.key || "",
  });
  return success(res, {
    message: "Transaction processed successfully",
    data: serializeTransactionPayload(data, mapTransactionDetail),
  });
});

exports.details = asyncHandler(async (req, res) => {
  const data = await service.getTransactionById(req.user._id, req.params.transactionId);
  return success(res, {
    message: "Transaction fetched successfully",
    data: serializeTransactionPayload(data, mapTransactionDetail),
  });
});

exports.listWalletTransactions = asyncHandler(async (req, res) => {
  const result = await service.listWalletTransactions(req.user._id, req.params.walletId, req.query);
  return success(res, {
    message: "Wallet transactions fetched successfully",
    data: serializeTransactionPayload(result.data, mapTransactionSummary),
    meta: result.meta,
  });
});

exports.syncWalletTransactions = asyncHandler(async (req, res) => {
  let data;

  try {
    data = await service.syncWalletTransactions(req.user._id, req.params.walletId, {
      force: true,
      trigger: "manual_refresh",
    });
  } catch (error) {
    logger.warn("Wallet transaction sync request completed in degraded mode", {
      requestId: req.requestId,
      userId: String(req.user?._id || ""),
      walletId: String(req.params.walletId || ""),
      error: error instanceof Error ? error.message : String(error),
    });

    data = {
      created: 0,
      updated: 0,
      failed: 1,
      scanned: 0,
      syncStatus: "degraded",
    };
  }

  return success(res, {
    message:
      data.syncStatus === "degraded"
        ? "Wallet transactions sync completed with temporary upstream issues"
        : "Wallet transactions synced successfully",
    data,
  });
});
