import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeReceiveQr,
  normalizeWalletProvisioningResult,
} from "../src/api/adapters/wallet.js";

test("HBAR provisioning result preserves the canonical Hedera account identifier for UI state", () => {
  const normalized = normalizeWalletProvisioningResult({
    walletId: "wallet-hbar-1",
    accountId: "account-1",
    chain: "hbar",
    network: "mainnet",
    address: "0.0.12345",
    asset: "HBAR",
    metadata: {
      canonicalAccountId: "0.0.12345",
      aliasAccountId: "0.0.abcdef",
      keyType: "ED25519",
      creationTransactionId: "0.0.500000@1717171717.123456789",
    },
  });

  assert.equal(normalized.chain, "hbar");
  assert.equal(normalized.address, "0.0.12345");
  assert.equal(normalized.metadata.canonicalAccountId, "0.0.12345");
  assert.equal(normalized.metadata.aliasAccountId, "0.0.abcdef");
});

test("HBAR receive QR uses the real canonical account ID instead of an alias URI placeholder", () => {
  const normalized = normalizeReceiveQr({
    walletId: "wallet-hbar-1",
    chain: "hbar",
    network: "mainnet",
    address: "0.0.12345",
    qrCode: {},
  });

  assert.equal(normalized.address, "0.0.12345");
  assert.equal(normalized.qrValue, "0.0.12345");
  assert.equal(normalized.qrCode.value, "0.0.12345");
});
