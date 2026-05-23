const express = require("express");

const controller = require("./controller");
const validator = require("./validator");
const verifySuperadminToken = require("../../middleware/verifySuperadminToken");
const createCaptchaMiddleware = require("../../middleware/antiBot");
const { validateRequest } = require("../../middleware/validateRequest");
const { createRateLimiter, profiles } = require("../../middleware/rateLimiter");

const router = express.Router();
const authCaptcha = createCaptchaMiddleware({ scope: "auth" });
const superadminLoginRateLimiter = createRateLimiter({
  ...profiles.superadminAuthStrict,
  keySuffix: "superadmin-login",
});
const superadminRefreshRateLimiter = createRateLimiter({
  ...profiles.superadminAuthStrict,
  keySuffix: "superadmin-refresh",
});

router.post("/login", authCaptcha, superadminLoginRateLimiter, validateRequest(validator.loginRules), controller.login);
router.post("/refresh", superadminRefreshRateLimiter, validateRequest(validator.refreshRules), controller.refresh);
router.post("/logout", verifySuperadminToken, validateRequest(validator.logoutRules), controller.logout);
router.get("/me", verifySuperadminToken, validateRequest({}), controller.me);

module.exports = router;
