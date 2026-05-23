const express = require("express");

const controller = require("./controller");
const validator = require("./validator");
const verifyToken = require("../../middleware/verifyToken");
const createCaptchaMiddleware = require("../../middleware/antiBot");
const { validateRequest } = require("../../middleware/validateRequest");
const { createRateLimiter, profiles } = require("../../middleware/rateLimiter");

const router = express.Router();
const anonSessionCaptcha = createCaptchaMiddleware({ scope: "anon_session" });
const anonSessionRateLimiter = createRateLimiter({
  ...profiles.authStrict,
  keySuffix: "auth-session",
});
const authRefreshRateLimiter = createRateLimiter({
  ...profiles.authModerate,
  keySuffix: "auth-refresh",
});

router.post(
  "/session",
  anonSessionCaptcha,
  anonSessionRateLimiter,
  validateRequest(validator.createSessionRules),
  controller.createSession,
);
router.post("/refresh", authRefreshRateLimiter, validateRequest(validator.refreshRules), controller.refresh);
router.post("/logout", verifyToken, validateRequest(validator.logoutRules), controller.logout);
router.get("/sessions", verifyToken, validateRequest({}), controller.listSessions);
router.post(
  "/sessions/:sessionId/revoke",
  verifyToken,
  validateRequest(validator.revokeSessionRules),
  controller.revokeSession,
);

module.exports = router;
