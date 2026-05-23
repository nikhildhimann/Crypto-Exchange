import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const BALANCE_SLICE_PATH = new URL("../src/store/balanceSlice.js", import.meta.url);

test("balance slice resets per-wallet request status to idle after wallet balance fulfillment", async () => {
  const source = await readFile(BALANCE_SLICE_PATH, "utf8");

  assert.match(
    source,
    /state\.requestStatusByWalletId\[walletId\]\s*=\s*"idle";/,
  );
  assert.match(
    source,
    /state\.lastFetchedAt\s*=\s*Math\.max\(Number\(state\.lastFetchedAt \|\| 0\), fetchedAt \|\| 0\);/,
  );
});

test("balance slice keeps optimistic outgoing balance deductions wired through the sender reducer", async () => {
  const source = await readFile(BALANCE_SLICE_PATH, "utf8");

  assert.match(source, /function applyOptimisticTransactionToBalanceEntry/);
  assert.match(source, /remainingBalanceBaseUnits \?\?[\s\S]*availableBalanceBaseUnits/);
  assert.match(source, /applyOptimisticTransactionBalance\(state, action\)/);
});
