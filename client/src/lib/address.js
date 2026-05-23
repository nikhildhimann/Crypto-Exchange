export function normalizeAddress(value = "") {
  return String(value || "").trim();
}

export function normalizeComparableAddress(value = "") {
  return normalizeAddress(value).toLowerCase();
}

export function isLikelyEvmAddress(value = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(normalizeAddress(value));
}

export function areAddressesEqual(left = "", right = "") {
  const normalizedLeft = normalizeComparableAddress(left);
  const normalizedRight = normalizeComparableAddress(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight;
}
