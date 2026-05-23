import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const TRANSACTION_SLICE_PATH = new URL("../src/store/transactionSlice.js", import.meta.url);
const TRANSACTION_ADAPTER_PATH = new URL("../src/api/adapters/transaction.js", import.meta.url);

test("transaction slice refresh logic recognizes same-platform external recipients", async () => {
  const source = await readFile(TRANSACTION_SLICE_PATH, "utf8");

  assert.match(source, /export function resolveRecipientWalletIdForRefresh/);
  assert.match(source, /transaction\?\.samePlatformRecipient === true/);
  assert.match(source, /const normalizedWalletIds = new Set/);
  assert.match(
    source,
    /transaction\?\.samePlatformRecipientWalletId\s*\|\|[\s\S]*transaction\?\.platformRecipientWalletId/,
  );
  assert.match(source, /normalizedWalletIds\.has\(explicitRecipientWalletId\)/);
});

test("send flow triggers post-send refresh using the optimistic transaction snapshot", async () => {
  const source = await readFile(TRANSACTION_SLICE_PATH, "utf8");

  assert.match(source, /const optimisticTransaction = \{/);
  assert.match(
    source,
    /refreshPostSendThunk\(\{\s*walletId: payload\.walletId,\s*transaction: optimisticTransaction,/,
  );
});

test("transaction adapter preserves same-platform recipient metadata from preview and send responses", async () => {
  const source = await readFile(TRANSACTION_ADAPTER_PATH, "utf8");

  assert.match(source, /samePlatformRecipient: Boolean\(payload\.samePlatformRecipient\)/);
  assert.match(
    source,
    /samePlatformRecipientWalletId: String\(\s*payload\.samePlatformRecipientWalletId \?\?/,
  );
  assert.match(source, /samePlatformRecipient: Boolean\(transaction\.samePlatformRecipient\)/);
});
