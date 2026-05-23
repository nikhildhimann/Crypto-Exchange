const test = require("node:test");
const assert = require("node:assert/strict");

const { AppError } = require("../helpers/errors");
const hbarClient = require("../Modules/chainAdapters/hbar/client");
const hbarWallet = require("../Modules/chainAdapters/hbar/wallet");

const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

async function buildDerivedMaterial(network = "testnet") {
  return hbarWallet.importWalletFromMnemonic(TEST_MNEMONIC, network);
}

test("HBAR provisioning finalization creates and returns a canonical on-chain account for create flow", async () => {
  const originalGetClient = hbarClient.getClient;

  try {
    hbarClient.getClient = () => ({
      resolveAccount: async () => null,
      createAccountFromPublicKey: async ({ publicKey, aliasAccountId }) => ({
        accountId: "0.0.12345",
        alias: aliasAccountId,
        publicKey,
        creationTransactionId: "0.0.500000@1717171717.123456789",
        activationMode: "operator_funded",
        activationReason: "created_during_wallet_provisioning",
      }),
    });

    const material = await buildDerivedMaterial("testnet");
    const finalized = await hbarWallet.finalizeProvisioningMaterial({
      network: "testnet",
      feature: "create",
      material,
    });

    assert.equal(finalized.address, "0.0.12345");
    assert.equal(finalized.metadata.activation.status, "active");
    assert.equal(finalized.metadata.activation.mode, "operator_funded");
    assert.equal(finalized.metadata.canonicalAccountId, "0.0.12345");
    assert.equal(finalized.metadata.aliasAccountId, material.derivation.aliasAccountId);
    assert.equal(
      finalized.metadata.creationTransactionId,
      "0.0.500000@1717171717.123456789",
    );
    assert.equal(finalized.derivation.accountCreatedOnNetwork, true);
    assert.equal(finalized.derivation.activationStatus, "active");
    assert.equal(finalized.managedAddress.address, "0.0.12345");
    assert.ok(
      finalized.additionalManagedAddresses.some(
        (entry) => entry.address === material.derivation.aliasAccountId,
      ),
    );
  } finally {
    hbarClient.getClient = originalGetClient;
  }
});

test("HBAR provisioning finalization reuses an existing canonical account for import flow", async () => {
  const originalGetClient = hbarClient.getClient;
  let createCalls = 0;

  try {
    hbarClient.getClient = () => ({
      resolveAccount: async (identifier) => ({
        accountId: "0.0.22222",
        alias: identifier,
        evmAddress: null,
        publicKey: "0011223344",
      }),
      createAccountFromPublicKey: async () => {
        createCalls += 1;
        throw new Error("should not create");
      },
    });

    const material = await buildDerivedMaterial("mainnet");
    const finalized = await hbarWallet.finalizeProvisioningMaterial({
      network: "mainnet",
      feature: "import",
      material,
    });

    assert.equal(finalized.address, "0.0.22222");
    assert.equal(finalized.metadata.canonicalAccountId, "0.0.22222");
    assert.equal(finalized.metadata.activation.status, "active");
    assert.equal(finalized.metadata.activation.mode, "active_existing_account");
    assert.equal(createCalls, 0);
  } finally {
    hbarClient.getClient = originalGetClient;
  }
});

test("HBAR provisioning finalization fails instead of returning alias-only pending success when on-chain creation fails", async () => {
  const originalGetClient = hbarClient.getClient;

  try {
    hbarClient.getClient = () => ({
      resolveAccount: async () => null,
      createAccountFromPublicKey: async ({ aliasAccountId }) => {
        throw new AppError("HBAR account was created but the canonical account could not be resolved", {
          status: 502,
          errors: {
            aliasAccountId,
          },
        });
      },
    });

    const material = await buildDerivedMaterial("testnet");

    await assert.rejects(
      () =>
        hbarWallet.finalizeProvisioningMaterial({
          network: "testnet",
          feature: "create",
          material,
        }),
      /canonical account could not be resolved/i,
    );
  } finally {
    hbarClient.getClient = originalGetClient;
  }
});
