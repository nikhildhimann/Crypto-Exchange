import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../src/config/chains.js", import.meta.url);

test("client chain registry includes guarded XTZ metadata for future runtime support", async () => {
  const source = await readFile(CONFIG_PATH, "utf8");

  assert.match(source, /xtz:\s*\{/);
  assert.match(source, /code:\s*"xtz"/);
  assert.match(source, /name:\s*"Tezos"/);
  assert.match(source, /symbol:\s*"XTZ"/);
  assert.match(source, /baseUnitName:\s*"mutez"/);
  assert.match(source, /ghostnet:\s*\{/);
  assert.match(source, /https:\/\/ghostnet\.tzkt\.io\//);
});
