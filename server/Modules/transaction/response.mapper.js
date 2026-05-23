const {
  getChainAssetSymbol,
  getChainLabel,
  getExecutionParamLabels,
  getNetworkLabel,
} = require("../../common/utils/chain");
const {
  buildAddressExplorerUrl,
  buildExplorerMetadata,
  buildTransactionExplorerUrl,
} = require("../../common/utils/explorer");

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value).trim();
  return normalized || null;
}

function normalizeDirection(direction) {
  const normalized = normalizeString(direction).trim().toLowerCase();

  if (normalized === "incoming" || normalized === "credit" || normalized === "received") {
    return "incoming";
  }

  if (normalized === "outgoing" || normalized === "debit" || normalized === "sent") {
    return "outgoing";
  }

  return normalized || "outgoing";
}

function normalizeStatus(status) {
  const normalized = normalizeString(status).trim().toLowerCase();
  if (normalized === "success" || normalized === "failed" || normalized === "pending") {
    return normalized;
  }

  return normalized || "pending";
}

function normalizeTimestampValue(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function normalizeConsensusTimestampValue(value) {
  const normalized = normalizeString(value).trim();
  if (!normalized) {
    return null;
  }

  const parsedSeconds = Number.parseFloat(normalized);
  if (!Number.isFinite(parsedSeconds)) {
    return null;
  }

  return normalizeTimestampValue(new Date(parsedSeconds * 1000));
}

function resolveDisplayTimestamp(timestamps = {}) {
  return (
    timestamps.timestamp ||
    timestamps.consensusTimestamp ||
    timestamps.chainTimestamp ||
    timestamps.confirmedAt ||
    timestamps.createdAt ||
    timestamps.updatedAt ||
    null
  );
}

function normalizeExecutionParams(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...value };
}

function buildTimestamps(payload = {}) {
  const timestamps = {
    chainTimestamp:
      normalizeTimestampValue(payload.chainTimestamp) ||
      normalizeTimestampValue(payload.chain_timestamp) ||
      normalizeConsensusTimestampValue(payload.consensus_timestamp),
    confirmedAt: normalizeTimestampValue(payload.confirmedAt),
    createdAt: normalizeTimestampValue(payload.createdAt),
    updatedAt: normalizeTimestampValue(payload.updatedAt),
    timestamp: normalizeTimestampValue(payload.timestamp),
    consensusTimestamp: normalizeConsensusTimestampValue(payload.consensus_timestamp),
  };

  return {
    ...timestamps,
    display: resolveDisplayTimestamp(timestamps),
  };
}

function buildExecutionParamMetadata(chain, network, executionParams = {}) {
  let labels = {};

  try {
    labels = getExecutionParamLabels(chain, network);
  } catch (_error) {
    labels = {};
  }

  const presentKeys = Object.keys(executionParams);
  if (!presentKeys.length) {
    return {
      labels,
      values: {},
    };
  }

  return {
    labels,
    values: Object.fromEntries(
      presentKeys.map((key) => [
        key,
        {
          value: executionParams[key],
          label: labels[key] || key,
        },
      ]),
    ),
  };
}

function resolveTransactionId(payload = {}) {
  return normalizeString(
    payload.id ||
      payload._id ||
      payload.transactionId ||
      payload.txHash ||
      "",
  );
}

function mapTransactionCore(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const {
    amountXrp: _amountXrp,
    amountDrops: _amountDrops,
    xrplStatus: _xrplStatus,
    destinationTag: legacyDestinationTag,
    ...rest
  } = payload;

  const chain = normalizeString(rest.chain).trim().toLowerCase();
  const network = normalizeString(rest.network).trim().toLowerCase();
  const executionParams = normalizeExecutionParams(rest.executionParams);
  const destinationTag =
    legacyDestinationTag !== undefined
      ? legacyDestinationTag
      : executionParams.destinationTag !== undefined
        ? executionParams.destinationTag
        : null;
  const id = resolveTransactionId(rest);
  const direction = normalizeDirection(rest.direction);
  const normalizedDirection =
    normalizeString(rest.transactionType).trim().toLowerCase() === "internal"
      ? "internal"
      : direction;
  const timestamps = buildTimestamps(rest);
  const txHash = normalizeNullableString(rest.txHash);
  const rawAsset = normalizeString(rest.asset || rest.currency || rest.assetSymbol || "").trim();
  const assetSymbol = rawAsset || getChainAssetSymbol(chain || undefined);
  const explorerUrl =
    buildTransactionExplorerUrl(chain, network, txHash) ||
    normalizeNullableString(rest.explorerUrl);
  const explorer = buildExplorerMetadata(chain, network, {
    address: rest.address,
    fromAddress: rest.fromAddress,
    toAddress: rest.toAddress,
    txHash,
  });
  const executionParamMetadata = buildExecutionParamMetadata(chain, network, executionParams);
  const addressExplorerUrl =
    buildAddressExplorerUrl(chain, network, rest.address) ||
    explorer.addressUrl ||
    null;

  return {
    ...rest,
    id,
    _id: id || normalizeString(rest._id),
    transactionId: id || null,
    walletId: normalizeString(rest.walletId),
    relatedTransactionId:
      rest.relatedTransactionId === undefined ||
      rest.relatedTransactionId === null ||
      rest.relatedTransactionId === ""
        ? null
        : normalizeString(rest.relatedTransactionId),
    chain,
    chainLabel: getChainLabel(chain),
    network,
    networkLabel: getNetworkLabel(chain, network),
    asset: assetSymbol,
    assetSymbol,
    currency:
      normalizeString(rest.currency || rest.asset).trim() || assetSymbol,
    status: normalizeStatus(rest.status),
    direction,
    normalizedDirection,
    transactionType: normalizeString(rest.transactionType).trim().toLowerCase(),
    txHash: txHash || "",
    amount: normalizeString(rest.amount ?? "0"),
    amountBaseUnits: normalizeString(rest.amountBaseUnits ?? "0"),
    networkFee: normalizeString(rest.networkFee ?? "0"),
    networkFeeBaseUnits: normalizeString(rest.networkFeeBaseUnits ?? "0"),
    platformFee: normalizeString(rest.platformFee ?? "0"),
    platformFeeBaseUnits: normalizeString(rest.platformFeeBaseUnits ?? "0"),
    applicationFee: normalizeString(rest.applicationFee ?? rest.platformFee ?? "0"),
    applicationFeeBaseUnits: normalizeString(
      rest.applicationFeeBaseUnits ?? rest.platformFeeBaseUnits ?? "0",
    ),
    totalDebit: normalizeString(rest.totalDebit ?? "0"),
    totalDebitBaseUnits: normalizeString(rest.totalDebitBaseUnits ?? "0"),
    totalDeducted: normalizeString(rest.totalDeducted ?? rest.totalDebit ?? "0"),
    totalDeductedBaseUnits: normalizeString(
      rest.totalDeductedBaseUnits ?? rest.totalDebitBaseUnits ?? "0",
    ),
    availableBalance: normalizeString(rest.availableBalance ?? "0"),
    availableBalanceBaseUnits: normalizeString(rest.availableBalanceBaseUnits ?? "0"),
    remainingBalance: normalizeString(rest.remainingBalance ?? "0"),
    remainingBalanceBaseUnits: normalizeString(rest.remainingBalanceBaseUnits ?? "0"),
    recipientGets: normalizeString(rest.recipientGets ?? rest.amount ?? "0"),
    recipientGetsBaseUnits: normalizeString(
      rest.recipientGetsBaseUnits ?? rest.amountBaseUnits ?? "0",
    ),
    changeAmount: normalizeString(rest.changeAmount ?? "0"),
    changeAmountBaseUnits: normalizeString(rest.changeAmountBaseUnits ?? "0"),
    fromAddress: normalizeString(rest.fromAddress),
    toAddress: normalizeString(rest.toAddress),
    address: normalizeString(rest.address),
    addressExplorerUrl,
    explorerUrl,
    explorer,
    executionParams,
    executionParamLabels: executionParamMetadata.labels,
    executionParamMetadata: executionParamMetadata.values,
    destinationTag,
    isMaxSend: Boolean(rest.isMaxSend ?? rest.sendMax ?? false),
    canSubmit: Boolean(rest.canSubmit ?? true),
    validationErrors: Array.isArray(rest.validationErrors) ? rest.validationErrors : [],
    warnings: Array.isArray(rest.warnings) ? rest.warnings : [],
    previewGeneratedAt: normalizeTimestampValue(rest.previewGeneratedAt),
    validated: Boolean(rest.validated ?? false),
    succeeded: Boolean(rest.succeeded ?? false),
    confirmations: Number(rest.confirmations ?? 0),
    chainStatus: normalizeString(rest.chainStatus).trim().toLowerCase(),
    networkFeeAsset: normalizeNullableString(rest.networkFeeAsset),
    networkFeeCurrency: normalizeNullableString(rest.networkFeeCurrency),
    networkFeeAssetType: normalizeNullableString(rest.networkFeeAssetType),
    chainTimestamp: timestamps.chainTimestamp,
    confirmedAt: timestamps.confirmedAt,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    displayTimestamp: timestamps.display,
    timestamps,
  };
}

function mapTransactionSummary(payload = {}) {
  return mapTransactionCore(payload);
}

function mapTransactionDetail(payload = {}) {
  return mapTransactionCore(payload);
}

function mapTransactionPreview(payload = {}) {
  return mapTransactionCore(payload);
}

function mapDestinationValidation(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const {
    destinationTag: legacyDestinationTag,
    amountXrp: _amountXrp,
    amountDrops: _amountDrops,
    xrplStatus: _xrplStatus,
    ...rest
  } = payload;

  const chain = normalizeString(rest.chain).trim().toLowerCase();
  const network = normalizeString(rest.network).trim().toLowerCase();
  const executionParams = normalizeExecutionParams(rest.executionParams);
  const destinationTag =
    legacyDestinationTag !== undefined
      ? legacyDestinationTag
      : executionParams.destinationTag !== undefined
        ? executionParams.destinationTag
        : null;
  const destinationAddress = normalizeString(rest.destinationAddress).trim();
  const explorer = buildExplorerMetadata(chain, network, {
    address: destinationAddress,
    toAddress: destinationAddress,
  });

  return {
    ...rest,
    walletId: normalizeString(rest.walletId),
    chain,
    chainLabel: getChainLabel(chain),
    network,
    networkLabel: getNetworkLabel(chain, network),
    destinationAddress,
    executionParams,
    executionParamLabels: buildExecutionParamMetadata(chain, network, executionParams).labels,
    destinationTag,
    explorerUrl: explorer.toAddressUrl || explorer.addressUrl,
    explorer,
  };
}

module.exports = {
  mapTransactionSummary,
  mapTransactionDetail,
  mapTransactionPreview,
  mapDestinationValidation,
};
