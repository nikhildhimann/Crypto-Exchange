const QRCode = require("qrcode");

function normalizeQrMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.keys(value).length ? value : undefined;
}

function normalizeWalletQrPayload(payload, fallback = {}) {
  const normalizedFallback =
    fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const text = String(
      payload.text ??
        payload.value ??
        payload.uri ??
        normalizedFallback.text ??
        normalizedFallback.value ??
        "",
    ).trim();
    const format = String(payload.format || normalizedFallback.format || "uri")
      .trim()
      .toLowerCase() || "uri";
    const metadata = normalizeQrMetadata(payload.metadata) ||
      normalizeQrMetadata(normalizedFallback.metadata);

    return {
      text,
      format,
      ...(metadata ? { metadata } : {}),
    };
  }

  const text = String(payload ?? normalizedFallback.text ?? normalizedFallback.value ?? "").trim();
  const format = String(normalizedFallback.format || "uri").trim().toLowerCase() || "uri";
  const metadata = normalizeQrMetadata(normalizedFallback.metadata);

  return {
    text,
    format,
    ...(metadata ? { metadata } : {}),
  };
}

async function generateWalletQr({ value, payload }) {
  const normalizedPayload = normalizeWalletQrPayload(payload ?? value, {
    value,
  });
  const dataUrl = await QRCode.toDataURL(normalizedPayload.text, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 512,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  return {
    value: normalizedPayload.text,
    text: normalizedPayload.text,
    format: normalizedPayload.format,
    ...(normalizedPayload.metadata ? { metadata: normalizedPayload.metadata } : {}),
    dataUrl,
  };
}

module.exports = {
  normalizeWalletQrPayload,
  generateWalletQr,
};
