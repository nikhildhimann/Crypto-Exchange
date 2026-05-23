const { formatUnits, parseUnits } = require("ethers");

const { normalizeDecimalAmount } = require("../../../common/utils/amount");
const { getChainConfig } = require("../../../config/chains");
const { AppError } = require("../../../helpers/errors");

const { decimals } = getChainConfig("avax");

function trimTrailingZeros(value) {
  return String(value)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function normalizeDisplayAmount(value) {
  return normalizeDecimalAmount(value, decimals);
}

function toBaseUnits(value) {
  try {
    return parseUnits(normalizeDisplayAmount(value), decimals).toString();
  } catch (_error) {
    throw AppError.validation("Invalid AVAX amount");
  }
}

function fromBaseUnits(value) {
  const normalized = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw AppError.validation("Invalid AVAX base unit amount");
  }

  const negative = normalized.startsWith("-");
  const digits = negative ? normalized.slice(1) : normalized;

  try {
    const formatted = trimTrailingZeros(formatUnits(BigInt(digits || "0"), decimals));
    if (formatted === "0") {
      return "0";
    }

    return negative ? `-${formatted}` : formatted;
  } catch (_error) {
    throw AppError.validation("Invalid AVAX base unit amount");
  }
}

module.exports = {
  normalizeDisplayAmount,
  toBaseUnits,
  fromBaseUnits,
};
