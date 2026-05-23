const Withdrawal = require("./model");
const logger = require("../../common/utils/logger");
const securityConfig = require("../../config/security");
const { AppError } = require("../../helpers/errors");
const { assertChainFeature } = require("../../common/utils/chain");
const { addBaseUnits, isBaseUnitsGte } = require("../../common/utils/amount");
const {
  normalizeAssetAmount,
  resolveSupportedAsset,
  toAssetBaseUnits,
} = require("../../common/utils/assets");

const RELEVANT_WITHDRAWAL_STATUSES = Object.freeze([
  "created",
  "pending",
  "queued",
  "broadcasted",
  "processing",
  "completed",
]);

const REVIEW_REQUIRED_SYSTEM_STATUS = "risk_review_required";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeIdentifier(value) {
  return value == null ? "" : String(value);
}

function sameId(left, right) {
  return normalizeIdentifier(left) && normalizeIdentifier(left) === normalizeIdentifier(right);
}

function safeCreatedAt(value) {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw AppError.internal("Stored withdrawal history is invalid for risk evaluation");
  }

  return timestamp;
}

function maskDestination(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  if (normalized.length <= 12) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function normalizeConfiguredAmountLimit(value, assetDescriptor) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const amount = normalizeAssetAmount(assetDescriptor, normalized);
  const baseUnits = toAssetBaseUnits(assetDescriptor, amount);

  return BigInt(baseUnits) > 0n ? { amount, baseUnits } : null;
}

function normalizeConfiguredCountLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function initScopeMetrics(includeAmount = false) {
  return {
    hour: includeAmount ? { count: 0, amountBaseUnits: "0" } : { count: 0 },
    day: includeAmount ? { count: 0, amountBaseUnits: "0" } : { count: 0 },
  };
}

function serializeScopeMetrics(metrics = {}, includeAmount = false) {
  return Object.fromEntries(
    Object.entries(metrics).map(([scope, value]) => [
      scope,
      includeAmount
        ? {
            hour: {
              count: value.hour.count,
              amountBaseUnits: value.hour.amountBaseUnits,
            },
            day: {
              count: value.day.count,
              amountBaseUnits: value.day.amountBaseUnits,
            },
          }
        : {
            hour: { count: value.hour.count },
            day: { count: value.day.count },
          },
    ]),
  );
}

function applyRecordToScopeMetrics(metrics, scope, createdAt, hourStart, amountBaseUnits = null) {
  if (!metrics[scope]) {
    return;
  }

  metrics[scope].day.count += 1;
  if (amountBaseUnits !== null) {
    metrics[scope].day.amountBaseUnits = addBaseUnits(
      metrics[scope].day.amountBaseUnits,
      amountBaseUnits,
    );
  }

  if (createdAt >= hourStart) {
    metrics[scope].hour.count += 1;
    if (amountBaseUnits !== null) {
      metrics[scope].hour.amountBaseUnits = addBaseUnits(
        metrics[scope].hour.amountBaseUnits,
        amountBaseUnits,
      );
    }
  }
}

function exceedsConfiguredLimit(currentValue, increment, limit) {
  return limit !== null && currentValue + increment > limit;
}

function buildBlockedMessage(reasonCode) {
  if (reasonCode === "max_per_tx_exceeded") {
    return "Withdrawal amount exceeds the maximum allowed per transaction";
  }

  if (reasonCode.includes("_count_limit_exceeded")) {
    return "Withdrawal count limit exceeded for the current period";
  }

  if (reasonCode.includes("_amount_limit_exceeded")) {
    return "Withdrawal amount limit exceeded for the current period";
  }

  return "Withdrawal blocked by security policy";
}

class WithdrawalRiskService {
  async evaluate(payload = {}) {
    const wallet = payload.wallet;
    if (!wallet?._id || !wallet?.chain) {
      throw AppError.internal("Wallet context is required for withdrawal risk evaluation");
    }

    const context = assertChainFeature(
      wallet.chain,
      payload.network || wallet.network,
      "send",
    );
    const assetDescriptor = resolveSupportedAsset(
      wallet.chain,
      payload.network || wallet.network || wallet.network,
      payload.asset,
    );
    const executionParams = payload.executionParams || {};
    const requestedAmount = normalizeAssetAmount(assetDescriptor, payload.amount);
    const requestedAmountBaseUnits = toAssetBaseUnits(assetDescriptor, requestedAmount);
    const validatedDestination = await context.adapter.transaction.validateDestination({
      network: payload.network || wallet.network,
      fromAddress: wallet.address,
      destinationAddress: normalizeString(payload.destinationAddress),
      executionParams,
      asset: assetDescriptor.asset,
      assetDescriptor,
    });
    const destinationAddress = normalizeString(
      validatedDestination?.destinationAddress || payload.destinationAddress,
    );

    const now = new Date();
    const hourStart = new Date(now.getTime() - 60 * 60 * 1000);
    const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const amountHistoryFilter = {
      userId: payload.userId,
      chain: wallet.chain,
      asset: assetDescriptor.asset,
      status: { $in: RELEVANT_WITHDRAWAL_STATUSES },
      createdAt: { $gte: dayStart },
    };
    const countHistoryFilter = {
      userId: payload.userId,
      chain: wallet.chain,
      status: { $in: RELEVANT_WITHDRAWAL_STATUSES },
      createdAt: { $gte: dayStart },
    };

    const [amountHistory, countHistory, destinationHistory] = await Promise.all([
      Withdrawal.find(amountHistoryFilter)
        .select("amount createdAt walletId accountId")
        .lean(),
      Withdrawal.find(countHistoryFilter)
        .select("createdAt walletId accountId")
        .lean(),
      Withdrawal.findOne({
        userId: payload.userId,
        chain: wallet.chain,
        destinationAddress,
        status: { $in: RELEVANT_WITHDRAWAL_STATUSES },
      })
        .sort({ createdAt: 1 })
        .select("createdAt metadata")
        .lean(),
    ]);

    const amountMetrics = {
      user: initScopeMetrics(true),
      wallet: initScopeMetrics(true),
      ...(wallet.accountId ? { account: initScopeMetrics(true) } : {}),
    };
    const countMetrics = {
      user: initScopeMetrics(false),
      wallet: initScopeMetrics(false),
      ...(wallet.accountId ? { account: initScopeMetrics(false) } : {}),
    };

    for (const record of amountHistory) {
      const createdAt = safeCreatedAt(record.createdAt);
      const amountBaseUnits = toAssetBaseUnits(assetDescriptor, normalizeAssetAmount(assetDescriptor, record.amount));

      applyRecordToScopeMetrics(amountMetrics, "user", createdAt, hourStart, amountBaseUnits);
      if (sameId(record.walletId, wallet._id)) {
        applyRecordToScopeMetrics(amountMetrics, "wallet", createdAt, hourStart, amountBaseUnits);
      }
      if (wallet.accountId && sameId(record.accountId, wallet.accountId)) {
        applyRecordToScopeMetrics(amountMetrics, "account", createdAt, hourStart, amountBaseUnits);
      }
    }

    for (const record of countHistory) {
      const createdAt = safeCreatedAt(record.createdAt);

      applyRecordToScopeMetrics(countMetrics, "user", createdAt, hourStart);
      if (sameId(record.walletId, wallet._id)) {
        applyRecordToScopeMetrics(countMetrics, "wallet", createdAt, hourStart);
      }
      if (wallet.accountId && sameId(record.accountId, wallet.accountId)) {
        applyRecordToScopeMetrics(countMetrics, "account", createdAt, hourStart);
      }
    }

    const riskConfig = securityConfig.withdrawalRisk || {};
    const maxPerTxLimit = normalizeConfiguredAmountLimit(riskConfig.maxPerTx, assetDescriptor);
    const maxPerHourLimit = normalizeConfiguredAmountLimit(riskConfig.maxPerHour, assetDescriptor);
    const maxPerDayLimit = normalizeConfiguredAmountLimit(riskConfig.maxPerDay, assetDescriptor);
    const reviewHighAmountLimit = normalizeConfiguredAmountLimit(
      riskConfig.reviewHighAmount,
      assetDescriptor,
    );
    const maxCountPerHour = normalizeConfiguredCountLimit(riskConfig.maxCountPerHour);
    const maxCountPerDay = normalizeConfiguredCountLimit(riskConfig.maxCountPerDay);
    const cooldownMinutes = normalizeConfiguredCountLimit(
      riskConfig.newDestinationCooldownMinutes,
    );
    const cooldownMs = cooldownMinutes ? cooldownMinutes * 60 * 1000 : 0;

    const blockReasons = [];
    const reviewReasons = [];

    if (maxPerTxLimit && isBaseUnitsGte(requestedAmountBaseUnits, maxPerTxLimit.baseUnits) && requestedAmountBaseUnits !== maxPerTxLimit.baseUnits) {
      blockReasons.push("max_per_tx_exceeded");
    }

    for (const [scopeLabel, metrics] of Object.entries(amountMetrics)) {
      if (maxPerHourLimit) {
        const nextHourAmount = addBaseUnits(metrics.hour.amountBaseUnits, requestedAmountBaseUnits);
        if (BigInt(nextHourAmount) > BigInt(maxPerHourLimit.baseUnits)) {
          blockReasons.push(`${scopeLabel}_hour_amount_limit_exceeded`);
        }
      }

      if (maxPerDayLimit) {
        const nextDayAmount = addBaseUnits(metrics.day.amountBaseUnits, requestedAmountBaseUnits);
        if (BigInt(nextDayAmount) > BigInt(maxPerDayLimit.baseUnits)) {
          blockReasons.push(`${scopeLabel}_day_amount_limit_exceeded`);
        }
      }
    }

    for (const [scopeLabel, metrics] of Object.entries(countMetrics)) {
      if (exceedsConfiguredLimit(metrics.hour.count, 1, maxCountPerHour)) {
        blockReasons.push(`${scopeLabel}_hour_count_limit_exceeded`);
      }

      if (exceedsConfiguredLimit(metrics.day.count, 1, maxCountPerDay)) {
        blockReasons.push(`${scopeLabel}_day_count_limit_exceeded`);
      }
    }

    const destinationFirstSeenAtRaw =
      destinationHistory?.metadata?.risk?.destinationFirstSeenAt || destinationHistory?.createdAt || now;
    const destinationFirstSeenAt = safeCreatedAt(destinationFirstSeenAtRaw);
    const isNewDestination = !destinationHistory;
    const destinationInCooldown =
      cooldownMs > 0 && now.getTime() - destinationFirstSeenAt.getTime() < cooldownMs;
    const shouldTreatAsRiskyDestination = isNewDestination || destinationInCooldown;
    const isHighAmount =
      Boolean(reviewHighAmountLimit) &&
      BigInt(requestedAmountBaseUnits) >= BigInt(reviewHighAmountLimit.baseUnits);
    const burstyActivity =
      countMetrics.user.hour.count >= 2 ||
      countMetrics.wallet.hour.count >= 2 ||
      (countMetrics.account?.hour.count || 0) >= 2;

    if (riskConfig.requireReviewOnNewDestination && shouldTreatAsRiskyDestination) {
      reviewReasons.push("new_destination_cooldown");
    }

    if (isHighAmount) {
      reviewReasons.push("high_amount");
    }

    if (burstyActivity && (shouldTreatAsRiskyDestination || isHighAmount)) {
      reviewReasons.push("bursty_withdrawal_pattern");
    }

    if (riskConfig.blockOnRisk && shouldTreatAsRiskyDestination && isHighAmount) {
      blockReasons.push("high_amount_new_destination");
    }

    if (riskConfig.blockOnRisk && burstyActivity && isHighAmount) {
      blockReasons.push("bursty_high_amount_pattern");
    }

    const uniqueBlockReasons = [...new Set(blockReasons)];
    const uniqueReviewReasons = [...new Set(reviewReasons)];
    const decision =
      uniqueBlockReasons.length > 0
        ? "blocked"
        : uniqueReviewReasons.length > 0
          ? "requires_review"
          : "allowed";

    const evaluation = {
      decision,
      blockedMessage: uniqueBlockReasons.length ? buildBlockedMessage(uniqueBlockReasons[0]) : "",
      requestedAmount,
      requestedAmountBaseUnits,
      assetDescriptor,
      destinationAddress,
      executionParams: validatedDestination?.executionParams || executionParams,
      systemStatus: decision === "requires_review" ? REVIEW_REQUIRED_SYSTEM_STATUS : "",
      reasons: decision === "blocked" ? uniqueBlockReasons : uniqueReviewReasons,
      signals: {
        isNewDestination,
        destinationInCooldown,
        isHighAmount,
        burstyActivity,
      },
      metrics: {
        amount: serializeScopeMetrics(amountMetrics, true),
        count: serializeScopeMetrics(countMetrics, false),
      },
      destinationFirstSeenAt: destinationFirstSeenAt.toISOString(),
      thresholds: {
        maxPerTx: maxPerTxLimit?.amount || "",
        maxPerHour: maxPerHourLimit?.amount || "",
        maxPerDay: maxPerDayLimit?.amount || "",
        maxCountPerHour: maxCountPerHour || 0,
        maxCountPerDay: maxCountPerDay || 0,
        newDestinationCooldownMinutes: cooldownMinutes || 0,
        reviewHighAmount: reviewHighAmountLimit?.amount || "",
        blockOnRisk: Boolean(riskConfig.blockOnRisk),
        requireReviewOnNewDestination: Boolean(riskConfig.requireReviewOnNewDestination),
      },
    };

    if (decision === "blocked") {
      logger.warn("Blocked withdrawal request by risk policy", {
        userId: String(payload.userId || ""),
        walletId: String(wallet._id || ""),
        accountId: String(wallet.accountId || ""),
        chain: wallet.chain,
        asset: assetDescriptor.asset,
        amount: requestedAmount,
        destination: maskDestination(destinationAddress),
        reasons: uniqueBlockReasons,
      });
    } else if (decision === "requires_review") {
      logger.warn("Withdrawal request requires review", {
        userId: String(payload.userId || ""),
        walletId: String(wallet._id || ""),
        accountId: String(wallet.accountId || ""),
        chain: wallet.chain,
        asset: assetDescriptor.asset,
        amount: requestedAmount,
        destination: maskDestination(destinationAddress),
        reasons: uniqueReviewReasons,
      });
    }

    return evaluation;
  }

  assertAllowed(evaluation) {
    if (evaluation?.decision !== "blocked") {
      return;
    }

    throw AppError.validation(
      evaluation.blockedMessage || "Withdrawal blocked by security policy",
    );
  }

  buildPersistedRiskMetadata(evaluation) {
    return {
      decision: evaluation.decision,
      reasons: Array.isArray(evaluation.reasons) ? evaluation.reasons : [],
      signals: evaluation.signals || {},
      thresholds: evaluation.thresholds || {},
      metrics: evaluation.metrics || {},
      destinationFirstSeenAt: evaluation.destinationFirstSeenAt || new Date().toISOString(),
      normalizedAmount: evaluation.requestedAmount,
      normalizedAmountBaseUnits: evaluation.requestedAmountBaseUnits,
      normalizedDestinationAddress: evaluation.destinationAddress,
      asset: evaluation.assetDescriptor?.asset || "",
      chain: evaluation.assetDescriptor?.chain || "",
      network: evaluation.assetDescriptor?.network || "",
      evaluatedAt: new Date().toISOString(),
    };
  }
}

module.exports = new WithdrawalRiskService();
module.exports.RELEVANT_WITHDRAWAL_STATUSES = RELEVANT_WITHDRAWAL_STATUSES;
module.exports.REVIEW_REQUIRED_SYSTEM_STATUS = REVIEW_REQUIRED_SYSTEM_STATUS;
