const axios = require("axios");

const errorCodes = require("../common/constants/errorCodes");
const logger = require("../common/utils/logger");
const securityConfig = require("../config/security");
const { AppError } = require("../helpers/errors");

const PROVIDER_ENDPOINTS = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://hcaptcha.com/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
};

function getCaptchaToken(req) {
  const headerToken = String(req.headers["x-captcha-token"] || "").trim();
  if (headerToken) {
    return headerToken;
  }

  const headerResponse = String(req.headers["cf-turnstile-response"] || "").trim();
  if (headerResponse) {
    return headerResponse;
  }

  const bodyTokenFields = [
    req.body?.captchaToken,
    req.body?.captcha_token,
    req.body?.turnstileToken,
    req.body?.["cf-turnstile-response"],
  ];

  for (const candidate of bodyTokenFields) {
    const normalized = String(candidate || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function isCaptchaEnforced(scope) {
  switch (scope) {
    case "auth":
      return securityConfig.captcha.enforceOnAuth;
    case "anon_session":
      return securityConfig.captcha.enforceOnAnonSession;
    case "wallet_import":
      return securityConfig.captcha.enforceOnWalletImport;
    default:
      return false;
  }
}

function getCaptchaVerificationError(message) {
  return new AppError(message, {
    status: 503,
    code: errorCodes.INTERNAL_ERROR,
  });
}

async function verifyCaptchaToken(token, req) {
  const provider = securityConfig.captcha.provider;
  const verifyUrl = PROVIDER_ENDPOINTS[provider];
  const secretKey = securityConfig.captcha.secretKey;

  if (!verifyUrl || !secretKey) {
    throw getCaptchaVerificationError("Captcha verification is not configured");
  }

  const params = new URLSearchParams();
  params.set("secret", secretKey);
  params.set("response", token);
  params.set("remoteip", req.ip || "");

  const response = await axios.post(verifyUrl, params.toString(), {
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    timeout: securityConfig.captcha.verifyTimeoutMs,
  });

  return Boolean(response?.data?.success);
}

function createCaptchaMiddleware({ scope, failureMessage = "Captcha validation failed" } = {}) {
  return async function captchaMiddleware(req, _res, next) {
    if (!isCaptchaEnforced(scope)) {
      return next();
    }

    if (securityConfig.captcha.provider === "none") {
      return next(
        getCaptchaVerificationError("Captcha enforcement is enabled but no provider is configured"),
      );
    }

    const token = getCaptchaToken(req);
    if (!token) {
      logger.warn("Captcha token missing", {
        scope,
        path: req.originalUrl || req.url || "",
        requestId: req.requestId || null,
        ip: req.ip || null,
      });
      return next(AppError.forbidden(failureMessage));
    }

    try {
      const verified = await verifyCaptchaToken(token, req);
      if (!verified) {
        logger.warn("Captcha validation failed", {
          scope,
          path: req.originalUrl || req.url || "",
          requestId: req.requestId || null,
          ip: req.ip || null,
        });
        return next(AppError.forbidden(failureMessage));
      }

      req.captcha = {
        enforced: true,
        provider: securityConfig.captcha.provider,
      };
      return next();
    } catch (error) {
      logger.error("Captcha verification error", {
        scope,
        path: req.originalUrl || req.url || "",
        requestId: req.requestId || null,
        ip: req.ip || null,
        error: error?.message || "Unknown captcha verification error",
      });

      return next(
        error?.status
          ? error
          : getCaptchaVerificationError("Captcha verification unavailable"),
      );
    }
  };
}

module.exports = createCaptchaMiddleware;
