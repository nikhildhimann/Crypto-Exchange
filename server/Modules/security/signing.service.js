const seedVault = require("./seedVault.service");
const Wallet = require("../wallet/model");
const logger = require("../../common/utils/logger");
const { AppError } = require("../../helpers/errors");

async function getWalletMnemonic(walletId, userId, options = {}) {
  const auditContext = {
    operation: String(options.operation || "wallet_mnemonic_access").trim(),
    source: String(options.source || "signing_service").trim(),
    requestId: options.requestId || null,
    walletId: String(walletId || ""),
    userId: userId ? String(userId) : null,
    transactionId: options.transactionId ? String(options.transactionId) : null,
  };
  const wallet = await Wallet.findOne({
    _id: walletId,
    ...(userId ? { userId } : {}),
  }).select(
    "_id userId chain network +encryptedRecoveryPhrase.cipherText +encryptedRecoveryPhrase.iv +encryptedRecoveryPhrase.authTag",
  );

  if (!wallet) {
    logger.warn("Sensitive wallet mnemonic access denied", {
      ...auditContext,
      reason: "wallet_not_found",
    });
    throw AppError.notFound("Wallet not found");
  }

  if (!wallet.encryptedRecoveryPhrase) {
    logger.warn("Sensitive wallet mnemonic access denied", {
      ...auditContext,
      chain: wallet.chain,
      network: wallet.network || "",
      reason: "missing_encrypted_recovery_phrase",
    });
    throw AppError.notFound("Encrypted recovery phrase not available");
  }

  return seedVault.decryptSeed(wallet.encryptedRecoveryPhrase, {
    auditContext: {
      ...auditContext,
      userId: String(wallet.userId || userId || ""),
      chain: wallet.chain,
      network: wallet.network || "",
    },
  });
}

async function signPayload() {
  throw AppError.notImplemented("Use chain-specific transaction signing through the chain adapter");
}

module.exports = {
  getWalletMnemonic,
  signPayload,
};
