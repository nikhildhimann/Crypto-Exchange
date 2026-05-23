const express = require("express");
const controller = require("./controller");
const rawBody = require("../../middleware/rawBody");
const createWebhookAuth = require("../../middleware/webhookAuth");
const { createRateLimiter, profiles } = require("../../middleware/rateLimiter");
const router = express.Router();

const tronWebhookAuth = createWebhookAuth({
  chain: "tron",
  secretEnvKey: "TRON_WEBHOOK_SECRET",
});

const btcWebhookAuth = createWebhookAuth({
  chain: "btc",
  secretEnvKey: "BTC_WEBHOOK_SECRET",
});

const tronWebhookRateLimiter = createRateLimiter({
  ...profiles.webhookFlood,
  keySuffix: "tron-webhook",
});

const btcWebhookRateLimiter = createRateLimiter({
  ...profiles.webhookFlood,
  keySuffix: "btc-webhook",
});

router.post("/tron", rawBody, tronWebhookAuth, tronWebhookRateLimiter, (req, res) => controller.handleTron(req, res));
router.post("/btc", rawBody, btcWebhookAuth, btcWebhookRateLimiter, (req, res) => controller.handleBtc(req, res));

module.exports = router;
