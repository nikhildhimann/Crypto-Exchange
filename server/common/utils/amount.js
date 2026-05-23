const { AppError } = require("../../helpers/errors");

function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") {
    return "0";
  }

  const normalized = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Invalid amount format");
  }

  return normalized.replace(/^0+(?=\d)/, "") || "0";
}

function compareAmounts(a, b) {
  return Number(normalizeAmount(a)) - Number(normalizeAmount(b));
}

function normalizeAmountInput(value) {
  return String(value).trim();
}

function addBaseUnits(...values) {
  return values.reduce((sum, value) => sum + BigInt(String(value)), 0n).toString();
}

function subtractBaseUnits(a, b) {
  return (BigInt(String(a)) - BigInt(String(b))).toString();
}

function isBaseUnitsGte(a, b) {
  return BigInt(String(a)) >= BigInt(String(b));
}

function normalizeDecimalAmount(value, decimals = 6) {
  const normalized = normalizeAmountInput(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw AppError.validation("Invalid amount format");
  }

  const safeDecimals = Math.max(Number(decimals) || 0, 0);
  const [wholePartRaw, fractionPartRaw = ""] = normalized.split(".");

  if (fractionPartRaw.length > safeDecimals) {
    throw AppError.validation(`Amount exceeds supported precision of ${safeDecimals} decimals`);
  }

  const wholePart = wholePartRaw.replace(/^0+(?=\d)/, "") || "0";
  const fractionPart = fractionPartRaw.replace(/0+$/, "");

  return fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
}

function formatUnitsFromBase(value, decimals = 0) {
  const normalized = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw AppError.validation("Invalid base unit amount");
  }

  const negative = normalized.startsWith("-");
  const digits = negative ? normalized.slice(1) : normalized;
  const safeDecimals = Math.max(Number(decimals) || 0, 0);

  if (safeDecimals === 0) {
    return `${negative ? "-" : ""}${digits}`;
  }

  const padded = digits.padStart(safeDecimals + 1, "0");
  const integerPart = padded.slice(0, -safeDecimals) || "0";
  const fractionalPart = padded.slice(-safeDecimals).replace(/0+$/, "");
  const formatted = fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;

  return `${negative ? "-" : ""}${formatted}`;
}

function parseUnitsToBase(value, decimals = 0) {
  const normalized = normalizeAmountInput(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw AppError.validation("Invalid amount format");
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const safeDecimals = Math.max(Number(decimals) || 0, 0);
  if (fractionPart.length > safeDecimals) {
    throw AppError.validation(`Amount exceeds supported precision of ${safeDecimals} decimals`);
  }

  const paddedFraction = fractionPart.padEnd(safeDecimals, "0");
  return `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "") || "0";
}

module.exports = {
  normalizeAmount,
  compareAmounts,
  normalizeAmountInput,
  normalizeDecimalAmount,
  addBaseUnits,
  subtractBaseUnits,
  isBaseUnitsGte,
  formatUnitsFromBase,
  parseUnitsToBase,
};
