import { apiRequest } from "./client";

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeEndpoint(endpoint = {}) {
  const normalized = normalizeObject(endpoint);

  return {
    ...normalized,
    chain: String(normalized.chain || "").toLowerCase(),
    network: String(normalized.network || "").toLowerCase(),
    asset: String(normalized.asset || normalized.symbol || "").toUpperCase(),
    symbol: String(normalized.symbol || normalized.asset || "").toUpperCase(),
    code: String(normalized.code || normalized.asset || "").toLowerCase(),
    label: String(normalized.label || normalized.symbol || normalized.asset || "").trim(),
    chainLabel: String(normalized.chainLabel || "").trim(),
    networkLabel: String(normalized.networkLabel || "").trim(),
    address: normalized.address ? String(normalized.address).trim() : null,
    walletId: normalized.walletId ? String(normalized.walletId).trim() : null,
    accountId: normalized.accountId ? String(normalized.accountId).trim() : null,
    executionParams: normalizeObject(normalized.executionParams),
  };
}

function normalizeSwapTransactions(transaction = {}) {
  const normalized = normalizeObject(transaction);

  if (!Object.keys(normalized).length) {
    return null;
  }

  return {
    ...normalized,
    transactionId: normalized.transactionId ? String(normalized.transactionId).trim() : null,
    txHash: normalized.txHash ? String(normalized.txHash).trim() : null,
    status: normalized.status ? String(normalized.status).trim().toLowerCase() : null,
    chainStatus: normalized.chainStatus ? String(normalized.chainStatus).trim() : null,
  };
}

function normalizeSwapRecord(payload = {}) {
  const normalized = normalizeObject(payload);
  const from = normalizeEndpoint(normalized.from);
  const to = normalizeEndpoint(normalized.to);
  const sourceTxHash = normalized.sourceTxHash ? String(normalized.sourceTxHash).trim() : null;
  const payoutTxHash = normalized.payoutTxHash ? String(normalized.payoutTxHash).trim() : null;
  const normalizedSourceTransaction = normalizeSwapTransactions(
    from.sourceTransaction || {
      txHash: sourceTxHash,
      transactionId: normalized.linkage?.sourceTransactionId,
    },
  );
  const normalizedPayoutTransaction = normalizeSwapTransactions(
    to.payoutTransaction || {
      txHash: payoutTxHash,
      transactionId: normalized.linkage?.payoutTransactionId,
    },
  );

  return {
    ...normalized,
    swapId: String(normalized.swapId || normalized.quoteId || "").trim(),
    quoteId: String(normalized.quoteId || normalized.swapId || "").trim(),
    conversionId: String(
      normalized.conversionId || normalized.swapId || normalized.quoteId || "",
    ).trim(),
    requestId: normalized.requestId ? String(normalized.requestId).trim() : null,
    routeId: String(normalized.routeId || normalized.pairId || "").trim(),
    status: String(normalized.status || "").trim().toLowerCase(),
    failureReason: normalized.failureReason ? String(normalized.failureReason).trim() : null,
    failureCode: normalized.failureCode ? String(normalized.failureCode).trim() : null,
    failureContext: normalizeObject(normalized.failureContext),
    expiresAt: normalized.expiresAt || null,
    createdAt: normalized.createdAt || null,
    updatedAt: normalized.updatedAt || null,
    pairId: String(normalized.pairId || "").trim(),
    sourceTxHash,
    payoutTxHash,
    finalReceiveAmount: normalized.finalReceiveAmount ? String(normalized.finalReceiveAmount).trim() : null,
    finalReceiveAmountBaseUnits: normalized.finalReceiveAmountBaseUnits
      ? String(normalized.finalReceiveAmountBaseUnits).trim()
      : null,
    from: {
      ...from,
      sourceTransaction: normalizedSourceTransaction,
    },
    to: {
      ...to,
      payoutTransaction: normalizedPayoutTransaction,
      finalReceiveAmount: to.finalReceiveAmount ? String(to.finalReceiveAmount).trim() : null,
      finalReceiveAmountBaseUnits: to.finalReceiveAmountBaseUnits
        ? String(to.finalReceiveAmountBaseUnits).trim()
        : null,
    },
    pricing: normalizeObject(normalized.pricing),
    fees: normalizeObject(normalized.fees),
    linkage: normalizeObject(normalized.linkage),
    routing: normalizeObject(normalized.routing),
  };
}

function normalizePairsDiagnostics(payload = {}) {
  const normalized = normalizeObject(payload);

  return {
    pairCount: Number(normalized.pairCount || 0) || 0,
    configWarnings: Array.isArray(normalized.configWarnings)
      ? normalized.configWarnings.map((warning) => String(warning || "").trim()).filter(Boolean)
      : [],
    configuredSystemWallets: Array.isArray(normalized.configuredSystemWallets)
      ? normalized.configuredSystemWallets.map((entry) => normalizeEndpoint(entry))
      : [],
    endpointChecks: Array.isArray(normalized.endpointChecks)
      ? normalized.endpointChecks.map((entry) => ({
          ...normalizeEndpoint(entry),
          swapEligible: Boolean(entry?.swapEligible),
          sourceReady: Boolean(entry?.sourceReady),
          destinationReady: Boolean(entry?.destinationReady),
          sourceReasons: Array.isArray(entry?.sourceReasons)
            ? entry.sourceReasons.map((reason) => String(reason || "").trim()).filter(Boolean)
            : [],
          destinationReasons: Array.isArray(entry?.destinationReasons)
            ? entry.destinationReasons.map((reason) => String(reason || "").trim()).filter(Boolean)
            : [],
          priceUsd: entry?.priceUsd ? String(entry.priceUsd).trim() : null,
          availableAfterReserve: entry?.availableAfterReserve ? String(entry.availableAfterReserve).trim() : null,
          availableAfterReserveBaseUnits: entry?.availableAfterReserveBaseUnits
            ? String(entry.availableAfterReserveBaseUnits).trim()
            : null,
          reasons: Array.isArray(entry?.reasons)
            ? entry.reasons.map((reason) => String(reason || "").trim()).filter(Boolean)
            : [],
        }))
      : [],
    emptyReasons: Array.isArray(normalized.emptyReasons)
      ? normalized.emptyReasons.map((reason) => String(reason || "").trim()).filter(Boolean)
      : [],
  };
}

export async function getSwapPairs(token) {
  const response = await apiRequest("/swap/pairs", {
    token,
  });

  const data = normalizeObject(response.data);

  return {
    enabled: Boolean(data.enabled),
    pairs: Array.isArray(data.pairs)
      ? data.pairs.map((pair) => ({
          pairId: String(pair?.pairId || "").trim(),
          from: normalizeEndpoint(pair?.from),
          to: normalizeEndpoint(pair?.to),
        }))
      : [],
    diagnostics: normalizePairsDiagnostics(data.diagnostics),
  };
}

export async function previewSwap(token, body) {
  const response = await apiRequest("/swap/preview", {
    method: "POST",
    token,
    body,
  });

  return normalizeSwapRecord(response.data);
}

export async function reviewSwap(token, body) {
  const response = await apiRequest("/swap/review", {
    method: "POST",
    token,
    body,
  });

  return normalizeSwapRecord(response.data);
}

export async function executeSwap(token, body) {
  const response = await apiRequest("/swap/execute", {
    method: "POST",
    token,
    body,
  });

  return normalizeSwapRecord(response.data);
}

export async function getSwapById(token, swapId) {
  const response = await apiRequest(`/swap/${swapId}`, {
    token,
  });

  return normalizeSwapRecord(response.data);
}

export async function getSwapHistory(token, query = {}) {
  const response = await apiRequest("/swap/history/list", {
    token,
    query,
  });

  return {
    data: Array.isArray(response.data) ? response.data : [],
    meta: normalizeObject(response.meta),
  };
}
