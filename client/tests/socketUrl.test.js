import test from "node:test";
import assert from "node:assert/strict";

import { resolveSocketUrl } from "../src/lib/socket.js";

test("socket URL uses the configured origin without adding an api path", () => {
  assert.equal(
    resolveSocketUrl({
      configuredSocketUrl: "https://crypto-api.wimalsuperstar.com",
    }),
    "https://crypto-api.wimalsuperstar.com",
  );
});

test("socket URL strips any accidental path suffix from the configured value", () => {
  assert.equal(
    resolveSocketUrl({
      configuredSocketUrl: "https://crypto-api.wimalsuperstar.com/api",
    }),
    "https://crypto-api.wimalsuperstar.com",
  );
});

test("socket URL rejects empty configuration", () => {
  assert.throws(
    () =>
      resolveSocketUrl({
        configuredSocketUrl: "",
      }),
    /VITE_SOCKET_URL must be configured as an absolute URL/,
  );
});
