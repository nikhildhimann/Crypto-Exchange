const mongoose = require("mongoose");

const Account = require("./model");
const mnemonicService = require("../security/mnemonic.service");
const seedVault = require("../security/seedVault.service");
const { AppError } = require("../../helpers/errors");
const logger = require("../../common/utils/logger");
const { sanitizeAccount, trimObjectStrings } = require("../../helpers/sanitize");
const { hmacSha256 } = require("../../common/utils/hash");
const securityConfig = require("../../config/security");

const DEFAULT_ACCOUNT_NAME = "Main Account";
const DEFAULT_ACCOUNT_TYPE = "personal";
const ACTIVE_ACCOUNT_STATUS = "active";
const ARCHIVED_ACCOUNT_STATUS = "archived";
const defaultAccountInFlight = new Map();

function buildMnemonicFingerprint(mnemonic) {
  return hmacSha256(mnemonic, securityConfig.encryptionKey);
}

function normalizeName(name, fallback = DEFAULT_ACCOUNT_NAME) {
  const normalized = String(name || "").trim();
  return normalized || fallback;
}

function normalizeType(type, fallback = undefined) {
  if (type === undefined || type === null || type === "") {
    return fallback;
  }

  return String(type).trim().toLowerCase();
}

function buildAccountResponse(account) {
  return sanitizeAccount(account);
}

function buildAccountWithMnemonicResponse(account, mnemonic) {
  return {
    account: buildAccountResponse(account),
    mnemonic,
  };
}

async function createStoredAccount({ userId, name, type = undefined, mnemonic }) {
  const normalizedMnemonic = mnemonicService.validateMnemonic(mnemonic);
  const fingerprint = buildMnemonicFingerprint(normalizedMnemonic);
  const encryptedMnemonic = seedVault.encryptSeed(normalizedMnemonic);

  try {
    return await Account.create({
      userId,
      name: normalizeName(name),
      type: normalizeType(type),
      encryptedMnemonic,
      mnemonicFingerprint: fingerprint,
      status: ACTIVE_ACCOUNT_STATUS,
    });
  } catch (error) {
    if (
      error instanceof mongoose.Error &&
      "code" in error &&
      Number(error.code) === 11000
    ) {
      throw AppError.conflict("This recovery phrase is already imported as an account");
    }

    throw error;
  }
}

async function getActiveAccountCount(userId) {
  return Account.countDocuments({ userId, status: ACTIVE_ACCOUNT_STATUS });
}

async function getActiveAccountOrFail(userId, accountId) {
  const account = await Account.findOne({
    _id: accountId,
    userId,
    status: ACTIVE_ACCOUNT_STATUS,
  });

  if (!account) {
    logger.warn("Internal app account lookup failed", {
      userId: userId ? String(userId) : null,
      accountId: accountId ? String(accountId) : null,
      reason: "account_not_found",
    });
    throw AppError.notFound("Account not found");
  }

  return account;
}

async function cleanupPlaceholderAccount(userId) {
  const activeAccounts = await Account.find({ userId, status: ACTIVE_ACCOUNT_STATUS }).sort({ createdAt: 1 });

  if (activeAccounts.length <= 1) {
    return;
  }

  // Identify a system-generated placeholder: it's typically the first active account
  // if it matches the default name and type.
  const candidate = activeAccounts[0];
  if (
    candidate.name === DEFAULT_ACCOUNT_NAME &&
    candidate.type === DEFAULT_ACCOUNT_TYPE
  ) {
    // Safety check: only remove if it has no associated wallets
    const Wallet = mongoose.model("Wallet");
    const walletCount = await Wallet.countDocuments({
      accountId: candidate._id,
    });

    if (walletCount === 0) {
      candidate.status = ARCHIVED_ACCOUNT_STATUS;
      await candidate.save();
    }
  }
}

async function findAccountByMnemonicFingerprint(userId, mnemonicFingerprint) {
  return Account.findOne({
    userId,
    mnemonicFingerprint,
  });
}

async function ensureDefaultAccountForUser(userId) {
  const key = String(userId);
  if (defaultAccountInFlight.has(key)) {
    return defaultAccountInFlight.get(key);
  }

  const request = (async () => {
    const existingAccount = await Account.findOne({
      userId,
      status: ACTIVE_ACCOUNT_STATUS,
    }).sort({ createdAt: 1 });

    if (existingAccount) {
      return existingAccount;
    }

    const mnemonic = await mnemonicService.generateMnemonic();
    try {
      return await createStoredAccount({
        userId,
        name: DEFAULT_ACCOUNT_NAME,
        type: DEFAULT_ACCOUNT_TYPE,
        mnemonic,
      });
    } catch (error) {
      if (error.code === "CONFLICT") {
        const concurrentAccount = await Account.findOne({
          userId,
          status: ACTIVE_ACCOUNT_STATUS,
        }).sort({ createdAt: 1 });

        if (concurrentAccount) {
          return concurrentAccount;
        }
      }

      throw error;
    }
  })();

  defaultAccountInFlight.set(key, request);

  try {
    return await request;
  } finally {
    defaultAccountInFlight.delete(key);
  }
}

async function createAccount(userId, payload = {}) {
  const input = trimObjectStrings(payload);
  const mnemonic = await mnemonicService.generateMnemonic();
  const account = await createStoredAccount({
    userId,
    name: normalizeName(input.name, DEFAULT_ACCOUNT_NAME),
    type: normalizeType(input.type),
    mnemonic,
  });

  await cleanupPlaceholderAccount(userId).catch(() => null);

  return buildAccountWithMnemonicResponse(account, mnemonic);
}

async function importAccount(userId, payload = {}) {
  const input = trimObjectStrings(payload);
  const normalizedMnemonic = mnemonicService.validateMnemonic(input.mnemonic);
  const mnemonicFingerprint = buildMnemonicFingerprint(normalizedMnemonic);
  const existingAccount = await findAccountByMnemonicFingerprint(
    userId,
    mnemonicFingerprint,
  );

  if (existingAccount && existingAccount.status === ACTIVE_ACCOUNT_STATUS) {
    return buildAccountWithMnemonicResponse(existingAccount, normalizedMnemonic);
  }

  if (existingAccount && existingAccount.status === ARCHIVED_ACCOUNT_STATUS) {
    existingAccount.name = normalizeName(input.name, existingAccount.name || DEFAULT_ACCOUNT_NAME);
    existingAccount.type = normalizeType(input.type, existingAccount.type);
    existingAccount.encryptedMnemonic = seedVault.encryptSeed(normalizedMnemonic);
    existingAccount.status = ACTIVE_ACCOUNT_STATUS;
    await existingAccount.save();
    return buildAccountWithMnemonicResponse(existingAccount, normalizedMnemonic);
  }

  let account;

  try {
    account = await createStoredAccount({
      userId,
      name: normalizeName(input.name, DEFAULT_ACCOUNT_NAME),
      type: normalizeType(input.type),
      mnemonic: normalizedMnemonic,
    });
  } catch (error) {
    if (error?.code === "CONFLICT") {
      const concurrentAccount = await findAccountByMnemonicFingerprint(
        userId,
        mnemonicFingerprint,
      );

      if (concurrentAccount) {
        return buildAccountWithMnemonicResponse(concurrentAccount, normalizedMnemonic);
      }
    }

    throw error;
  }

  await cleanupPlaceholderAccount(userId).catch(() => null);

  return buildAccountWithMnemonicResponse(account, normalizedMnemonic);
}

async function listAccounts(userId) {
  let accounts = await Account.find({
    userId,
    status: ACTIVE_ACCOUNT_STATUS,
  })
    .sort({ createdAt: 1 })
    .lean();

  if (accounts.length === 0) {
    await ensureDefaultAccountForUser(userId);
    accounts = await Account.find({
      userId,
      status: ACTIVE_ACCOUNT_STATUS,
    })
      .sort({ createdAt: 1 })
      .lean();
  }

  return accounts.map((account) => buildAccountResponse(account));
}

async function getAccountById(userId, accountId) {
  const account = await getActiveAccountOrFail(userId, accountId);
  return buildAccountResponse(account);
}

async function updateAccount(userId, accountId, payload = {}) {
  const input = trimObjectStrings(payload);
  const account = await getActiveAccountOrFail(userId, accountId);

  if (input.name !== undefined) {
    account.name = normalizeName(input.name, account.name || DEFAULT_ACCOUNT_NAME);
  }
  if (input.type !== undefined && input.type !== "") {
    account.type = normalizeType(input.type);
  }

  await account.save();
  return buildAccountResponse(account);
}

async function archiveAccount(userId, accountId) {
  const account = await getActiveAccountOrFail(userId, accountId);
  const activeAccountCount = await getActiveAccountCount(userId);

  if (activeAccountCount <= 1) {
    throw AppError.conflict("At least one active account must remain");
  }

  account.status = ARCHIVED_ACCOUNT_STATUS;
  await account.save();

  return buildAccountResponse(account);
}

async function generateMnemonic() {
  return mnemonicService.generateMnemonic();
}

async function archiveIncompleteAccount(userId, accountId) {
  const account = await Account.findOne({
    _id: accountId,
    userId,
    status: ACTIVE_ACCOUNT_STATUS,
  });

  if (!account) {
    throw AppError.notFound("Account not found");
  }

  const Wallet = mongoose.model("Wallet");
  const walletCount = await Wallet.countDocuments({ accountId: account._id });

  if (walletCount > 0) {
    throw AppError.conflict("Cannot rollback an account that already has wallets");
  }

  account.status = ARCHIVED_ACCOUNT_STATUS;
  await account.save();

  return buildAccountResponse(account);
}

module.exports = {
  createAccount,
  importAccount,
  listAccounts,
  getAccountById,
  updateAccount,
  archiveAccount,
  ensureDefaultAccountForUser,
  generateMnemonic,
  archiveIncompleteAccount
};
