function appendScalarParams(params, values = {}) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "" || typeof value === "object") {
      continue;
    }

    params.set(key, String(value));
  }
}

function pickScalarEntries(values = {}) {
  const params = new URLSearchParams();
  appendScalarParams(params, values);
  return Object.fromEntries(params.entries());
}

function buildUriQrPayload({
  scheme,
  address,
  amount,
  queryParams = {},
  metadata = {},
}) {
  const normalizedScheme = String(scheme || "").trim();
  const normalizedAddress = String(address || "").trim();
  const params = new URLSearchParams();

  if (amount !== undefined && amount !== null && amount !== "") {
    params.set("amount", String(amount));
  }

  appendScalarParams(params, queryParams);

  const serializedParams = Object.fromEntries(params.entries());
  const query = params.toString();
  const text =
    normalizedScheme && normalizedAddress
      ? query
        ? `${normalizedScheme}:${normalizedAddress}?${query}`
        : `${normalizedScheme}:${normalizedAddress}`
      : normalizedAddress;
  const payloadMetadata = {
    scheme: normalizedScheme,
    address: normalizedAddress,
    ...metadata,
  };

  if (Object.keys(serializedParams).length) {
    payloadMetadata.params = serializedParams;
  }

  return {
    text,
    format: "uri",
    metadata: payloadMetadata,
  };
}

function buildTextQrPayload({ text, format = "text", metadata = {} }) {
  return {
    text: String(text || "").trim(),
    format: String(format || "text").trim().toLowerCase() || "text",
    metadata,
  };
}

module.exports = {
  appendScalarParams,
  pickScalarEntries,
  buildUriQrPayload,
  buildTextQrPayload,
};
