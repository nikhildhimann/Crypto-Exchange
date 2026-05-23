function buildMinimumSwapAmountMessage(payloadErrors = {}) {
  const minimumSourceAmount = String(payloadErrors.minimumSourceAmount || "").trim();
  const minimumSourceAsset = String(payloadErrors.minimumSourceAsset || "").trim().toUpperCase();
  const estimatedReceiveAtMinimum = String(
    payloadErrors.estimatedReceiveAtMinimum || "",
  ).trim();
  const destinationAsset = String(payloadErrors.destinationAsset || "").trim().toUpperCase();

  if (
    !minimumSourceAmount ||
    !minimumSourceAsset ||
    !estimatedReceiveAtMinimum ||
    !destinationAsset
  ) {
    return "";
  }

  return `This amount is too small. Minimum swap amount: ${minimumSourceAmount} ${minimumSourceAsset}. Estimated receive: ${estimatedReceiveAtMinimum} ${destinationAsset}.`;
}

export function getErrorMessage(error, fallbackMessage = "Request failed") {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (!error || typeof error !== "object") {
    return fallbackMessage;
  }

  const payload = error.payload && typeof error.payload === "object" ? error.payload : null;
  const payloadErrors =
    payload?.errors && typeof payload.errors === "object" ? payload.errors : null;
  const minimumSwapAmountMessage = buildMinimumSwapAmountMessage(payloadErrors || {});
  if (minimumSwapAmountMessage) {
    return minimumSwapAmountMessage;
  }
  const detailedReason =
    typeof payloadErrors?.reason === "string" && payloadErrors.reason.trim()
      ? payloadErrors.reason.trim()
      : "";
  const normalizedDetailedReason = detailedReason.toLowerCase();
  const message =
    typeof error.message === "string" && error.message.trim()
      ? error.message.trim()
      : typeof payload?.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : "";

  if (
    message &&
    payloadErrors?.code &&
    normalizedDetailedReason ===
      "the entered amount is below the minimum swappable amount for this route"
  ) {
    return message;
  }

  if (message && detailedReason && message.toLowerCase() !== detailedReason.toLowerCase()) {
    return `${message}: ${detailedReason}`;
  }

  if (message) {
    return message;
  }

  if (detailedReason) {
    return detailedReason;
  }

  return fallbackMessage;
}
