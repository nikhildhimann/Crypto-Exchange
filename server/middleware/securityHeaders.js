const appConfig = require("../config/app");

function isHttpsRequest(req) {
  if (req.secure) {
    return true;
  }

  const forwardedProto = String(req.get("x-forwarded-proto") || "").trim().toLowerCase();
  return forwardedProto === "https";
}

function buildHstsHeader() {
  const segments = [`max-age=${Math.max(Number(appConfig.hsts.maxAge) || 0, 0)}`];

  if (appConfig.hsts.includeSubdomains) {
    segments.push("includeSubDomains");
  }

  if (appConfig.hsts.preload) {
    segments.push("preload");
  }

  return segments.join("; ");
}

module.exports = function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );

  if (
    appConfig.nodeEnv === "production" &&
    appConfig.hsts.enabled &&
    isHttpsRequest(req)
  ) {
    res.setHeader("Strict-Transport-Security", buildHstsHeader());
  }

  next();
};
