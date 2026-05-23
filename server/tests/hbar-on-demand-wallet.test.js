const test = require("node:test");
const assert = require("node:assert/strict");

const walletService = require("../Modules/wallet/service");
const Account = require("../Modules/accounts/model");
const AccountService = require("../Modules/accounts/service");
const Wallet = require("../Modules/wallet/model");
const seedVault = require("../Modules/security/seedVault.service");
const provisioningService = require("../Modules/wallet/provisioning.service");
const { listAutoProvisionTargets } = require("../common/utils/chain");

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_ACCOUNT_ID = "507f1f77bcf86cd799439012";
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_ENCRYPTED_SEED = {
  algorithm: "aes-256-gcm",
  cipherText: "cipher",
  iv: "iv",
  authTag: "tag",
  keyVersion: 1,
};

test("HBAR remains excluded from generic auto-provision targets", () => {
  const targets = listAutoProvisionTargets("create");

  assert.ok(targets.length > 0);
  assert.equal(targets.some((target) => target.chain === "hbar"), false);
});

test("HBAR on-demand wallet creation provisions only the requested Hedera target from the stored account mnemonic", async () => {
  const originalGetAccountById = AccountService.getAccountById;
  const originalAccountFindOne = Account.findOne;
  const originalWalletFindOne = Wallet.findOne;
  const originalDecryptSeed = seedVault.decryptSeed;
  const originalEncryptSeed = seedVault.encryptSeed;
  const originalProvision = provisioningService.provisionSupportedWalletsForUser;
  const originalSync = provisioningService.syncProvisionedWalletSet;
  const captured = {};

  try {
    AccountService.getAccountById = async () => ({ id: TEST_ACCOUNT_ID });
    Account.findOne = () => ({
      select: async () => ({
        _id: TEST_ACCOUNT_ID,
        encryptedMnemonic: TEST_ENCRYPTED_SEED,
      }),
    });
    Wallet.findOne = () => ({
      sort: () => ({
        lean: async () => null,
      }),
    });
    seedVault.decryptSeed = () => TEST_MNEMONIC;
    seedVault.encryptSeed = () => TEST_ENCRYPTED_SEED;
    provisioningService.provisionSupportedWalletsForUser = async (input) => {
      Object.assign(captured, input);
      return {
        primaryWallet: {
          _id: "wallet-hbar-1",
          accountId: TEST_ACCOUNT_ID,
          chain: "hbar",
          network: "mainnet",
          asset: "HBAR",
          address: "0.0.12345",
          publicKey: "0011223344",
          metadata: {
            canonicalAccountId: "0.0.12345",
          },
        },
        wallets: [
          {
            _id: "wallet-hbar-1",
            accountId: TEST_ACCOUNT_ID,
            chain: "hbar",
            network: "mainnet",
            asset: "HBAR",
            address: "0.0.12345",
            publicKey: "0011223344",
            metadata: {
              canonicalAccountId: "0.0.12345",
            },
          },
        ],
        targets: [{ chain: "hbar", network: "mainnet" }],
      };
    };
    provisioningService.syncProvisionedWalletSet = async () => null;

    const result = await walletService.createHbarWalletOnDemand(TEST_USER_ID, {
      accountId: TEST_ACCOUNT_ID,
      network: "mainnet",
    });

    assert.equal(captured.userId, TEST_USER_ID);
    assert.equal(String(captured.accountId), TEST_ACCOUNT_ID);
    assert.equal(captured.mnemonic, TEST_MNEMONIC);
    assert.equal(captured.mode, "created");
    assert.deepEqual(captured.primaryTarget, {
      chain: "hbar",
      network: "mainnet",
    });
    assert.deepEqual(captured.targets, [
      {
        chain: "hbar",
        network: "mainnet",
      },
    ]);
    assert.equal(result.chain, "hbar");
    assert.equal(result.address, "0.0.12345");
    assert.equal(result.accountId, TEST_ACCOUNT_ID);
  } finally {
    AccountService.getAccountById = originalGetAccountById;
    Account.findOne = originalAccountFindOne;
    Wallet.findOne = originalWalletFindOne;
    seedVault.decryptSeed = originalDecryptSeed;
    seedVault.encryptSeed = originalEncryptSeed;
    provisioningService.provisionSupportedWalletsForUser = originalProvision;
    provisioningService.syncProvisionedWalletSet = originalSync;
  }
});

test("HBAR on-demand wallet creation reuses imported provisioning mode when the account already has imported wallets", async () => {
  const originalGetAccountById = AccountService.getAccountById;
  const originalAccountFindOne = Account.findOne;
  const originalWalletFindOne = Wallet.findOne;
  const originalDecryptSeed = seedVault.decryptSeed;
  const originalEncryptSeed = seedVault.encryptSeed;
  const originalProvision = provisioningService.provisionSupportedWalletsForUser;
  const originalSync = provisioningService.syncProvisionedWalletSet;
  const captured = {};

  try {
    AccountService.getAccountById = async () => ({ id: TEST_ACCOUNT_ID });
    Account.findOne = () => ({
      select: async () => ({
        _id: TEST_ACCOUNT_ID,
        encryptedMnemonic: TEST_ENCRYPTED_SEED,
      }),
    });
    Wallet.findOne = () => ({
      sort: () => ({
        lean: async () => ({
          _id: "wallet-eth-1",
          accountId: TEST_ACCOUNT_ID,
          chain: "eth",
          network: "mainnet",
          isImported: true,
          sourceType: "imported",
        }),
      }),
    });
    seedVault.decryptSeed = () => TEST_MNEMONIC;
    seedVault.encryptSeed = () => TEST_ENCRYPTED_SEED;
    provisioningService.provisionSupportedWalletsForUser = async (input) => {
      Object.assign(captured, input);
      return {
        primaryWallet: {
          _id: "wallet-hbar-2",
          accountId: TEST_ACCOUNT_ID,
          chain: "hbar",
          network: "mainnet",
          asset: "HBAR",
          address: "0.0.54321",
          publicKey: "0099887766",
          metadata: {},
        },
        wallets: [
          {
            _id: "wallet-hbar-2",
            accountId: TEST_ACCOUNT_ID,
            chain: "hbar",
            network: "mainnet",
            asset: "HBAR",
            address: "0.0.54321",
            publicKey: "0099887766",
            metadata: {},
          },
        ],
        targets: [{ chain: "hbar", network: "mainnet" }],
      };
    };
    provisioningService.syncProvisionedWalletSet = async () => null;

    await walletService.createHbarWalletOnDemand(TEST_USER_ID, {
      accountId: TEST_ACCOUNT_ID,
      network: "mainnet",
    });

    assert.equal(captured.mode, "imported");
  } finally {
    AccountService.getAccountById = originalGetAccountById;
    Account.findOne = originalAccountFindOne;
    Wallet.findOne = originalWalletFindOne;
    seedVault.decryptSeed = originalDecryptSeed;
    seedVault.encryptSeed = originalEncryptSeed;
    provisioningService.provisionSupportedWalletsForUser = originalProvision;
    provisioningService.syncProvisionedWalletSet = originalSync;
  }
});
