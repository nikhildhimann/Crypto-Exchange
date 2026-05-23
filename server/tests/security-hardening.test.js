const test = require("node:test");
const assert = require("node:assert/strict");

const Validator = require("../helpers/validators");
const mnemonicService = require("../Modules/security/mnemonic.service");
const walletController = require("../Modules/wallet/controller");
const superadminAuthValidator = require("../Modules/superadmin-auth/validator");
const accountValidator = require("../Modules/accounts/validator");
const transactionValidator = require("../Modules/transaction/validator");
const transactionService = require("../Modules/transaction/service");
const { normalizePlainObjectInput } = require("../helpers/sanitize");
const { buildNativeAssetDescriptor } = require("../common/utils/assets");

const VALID_MNEMONIC = "test test test test test test test test test test test junk";

async function expectValidationFailure(action, matcher) {
  await assert.rejects(action, (error) => {
    assert.equal(error.status, 400);

    if (matcher instanceof RegExp) {
      assert.match(error.message, matcher);
    } else if (typeof matcher === "function") {
      matcher(error);
    } else if (typeof matcher === "string") {
      assert.equal(error.message, matcher);
    }

    return true;
  });
}

test("mnemonic service normalizes valid BIP39 phrases", () => {
  const normalized = mnemonicService.validateMnemonic(
    "  TEST   TEST test TEST test test test test test test test junk  ",
  );

  assert.equal(normalized, VALID_MNEMONIC);
});

test("mnemonic service rejects invalid mnemonic characters", () => {
  assert.throws(
    () => mnemonicService.validateMnemonic("test test test test test test test test test test test 123"),
    /Mnemonic contains invalid characters/,
  );
});

test("mnemonic service rejects unsupported mnemonic word counts", () => {
  for (const invalidCount of [11, 13, 25]) {
    const phrase = Array.from({ length: invalidCount }, () => "test").join(" ");
    assert.throws(
      () => mnemonicService.validateMnemonic(phrase),
      /Mnemonic must contain 12, 15, 18, 21, or 24 words/,
    );
  }
});

test("transaction preview validator rejects zero amounts", async () => {
  const validator = new Validator(
    {
      walletId: "507f1f77bcf86cd799439011",
      destinationAddress: "rEXAMPLEDESTINATION1234567890",
      amount: "0",
    },
    transactionValidator.previewRules,
  );

  await expectValidationFailure(() => validator.validate(), (error) => {
    assert.match(error.errors.amount[0], /format is invalid/i);
  });
});

test("transaction preview validator rejects negative amounts", async () => {
  const validator = new Validator(
    {
      walletId: "507f1f77bcf86cd799439011",
      destinationAddress: "rEXAMPLEDESTINATION1234567890",
      amount: "-1",
    },
    transactionValidator.previewRules,
  );

  await expectValidationFailure(() => validator.validate(), /Validation failed/);
});

test("transaction preview validator rejects scientific notation", async () => {
  const validator = new Validator(
    {
      walletId: "507f1f77bcf86cd799439011",
      destinationAddress: "rEXAMPLEDESTINATION1234567890",
      amount: "1e6",
    },
    transactionValidator.previewRules,
  );

  await expectValidationFailure(() => validator.validate(), /Validation failed/);
});

test("swap preview validator accepts valid decimal amounts", async () => {
  const validator = new Validator(
    {
      fromWalletId: "507f1f77bcf86cd799439011",
      toWalletId: "507f1f77bcf86cd799439012",
      amount: "0.001",
    },
    require("../Modules/swap/validator").previewRules,
  );

  await assert.doesNotReject(() => validator.validate());
});

test("superadmin login validator rejects short passwords", async () => {
  const validator = new Validator(
    {
      email: "admin@example.com",
      password: "short",
    },
    superadminAuthValidator.loginRules,
  );

  await expectValidationFailure(() => validator.validate(), /Validation failed/);
});

test("account import validator rejects mnemonic values with invalid characters", async () => {
  const validator = new Validator(
    {
      name: "Main Account",
      mnemonic: "test test test test test test test test test test test 123",
    },
    accountValidator.importRules,
  );

  await expectValidationFailure(() => validator.validate(), /Validation failed/);
});

test("transaction preview validator rejects amounts with too many decimals", async () => {
  const validator = new Validator(
    {
      walletId: "507f1f77bcf86cd799439011",
      destinationAddress: "rEXAMPLEDESTINATION1234567890",
      amount: "1.1234567890123456789",
    },
    transactionValidator.previewRules,
  );

  await expectValidationFailure(() => validator.validate(), /Validation failed/);
});

test("transaction validator rejects destination addresses that are too long", async () => {
  const validator = new Validator(
    {
      walletId: "507f1f77bcf86cd799439011",
      destinationAddress: `r${"a".repeat(205)}`,
      amount: "1",
    },
    transactionValidator.previewRules,
  );

  await expectValidationFailure(() => validator.validate(), /Validation failed/);
});

test("transaction validator rejects non-numeric destination tags", async () => {
  const validator = new Validator(
    {
      walletId: "507f1f77bcf86cd799439011",
      destinationAddress: "rEXAMPLEDESTINATION1234567890",
      amount: "1",
      destinationTag: "12abc",
    },
    transactionValidator.previewRules,
  );

  await expectValidationFailure(() => validator.validate(), /Validation failed/);
});

test("transaction service rejects amounts above the configured max per transaction", () => {
  const assetDescriptor = buildNativeAssetDescriptor("xrp", "mainnet");

  assert.throws(
    () =>
      transactionService.assertRequestedTransferAmount({
        input: {
          amount: "50000.000001",
          sendMax: false,
        },
        destination: {
          isInternal: false,
        },
        assetDescriptor,
        balance: {
          chain: "xrp",
          network: "mainnet",
          availableBalance: "100000",
        },
      }),
    /Amount exceeds the maximum allowed per transaction/,
  );
});

test("wallet JSON parser rejects prototype pollution payloads", () => {
  assert.throws(
    () =>
      walletController.parseOptionalJsonObject(
        '{"__proto__":{"polluted":true}}',
        "executionParams",
      ),
    /executionParams contains an unsupported key/,
  );
});

test("wallet JSON parser rejects deeply nested objects", () => {
  assert.throws(
    () =>
      walletController.parseOptionalJsonObject(
        '{"one":{"two":{"three":{"four":{"five":"value"}}}}}',
        "executionParams",
      ),
    /executionParams cannot be nested deeper than 3 levels/,
  );
});

test("metadata helper strips dangerous keys recursively", () => {
  const normalized = normalizePlainObjectInput(JSON.parse(JSON.stringify({
    ok: true,
    nested: {
      ["__proto__"]: {
        polluted: true,
      },
      safe: "value",
    },
  })));

  assert.deepEqual(normalized, {
    ok: true,
    nested: {
      safe: "value",
    },
  });
});

test("metadata helper rejects deeply nested objects", () => {
  assert.throws(
    () =>
      normalizePlainObjectInput({
        one: {
          two: {
            three: {
              four: {
                five: "value",
              },
            },
          },
        },
      }),
    /metadata cannot be nested deeper than 4 levels/,
  );
});

test("regex validator treats invalid patterns as validation failures without crashing", async () => {
  const validator = new Validator(
    {
      amount: "1.25",
    },
    {
      amount: "required|regex:(abc",
    },
  );

  await expectValidationFailure(() => validator.validate(), (error) => {
    assert.match(error.errors.amount[0], /format is invalid/i);
  });
});

test("regex safety guard allows the internal positive-decimal amount pattern", () => {
  const amountPattern = "^(?!0+(\\.0+)?$)[0-9]+(\\.[0-9]{1,18})?$";
  assert.equal(Validator.isSafeRegexPattern(amountPattern), true);
});
