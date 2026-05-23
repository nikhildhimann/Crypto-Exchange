function normalizeTxHash(value) {
  let normalized = String(value || "").trim();
  let previousValue = null;

  while (normalized !== previousValue) {
    previousValue = normalized;
    normalized = normalized.replace(/^["']|["']$/g, "").trim();
  }

  const querySeparatorIndex = normalized.indexOf("?");
  if (querySeparatorIndex >= 0) {
    normalized = normalized.slice(0, querySeparatorIndex).trim();
  }

  return normalized;
}

module.exports = {
  normalizeTxHash,
};
