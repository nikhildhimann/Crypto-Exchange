const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const xtzAdapter = require("../Modules/chainAdapters/xtz");

test("XTZ amount helpers", () => {
  const { amount } = xtzAdapter;
  assert.equal(amount.toBaseUnits("1"), "1000000");
  assert.equal(amount.toBaseUnits("1.5"), "1500000");
  assert.equal(amount.normalizeDisplayAmount("1000000"), "1");
  assert.equal(amount.normalizeDisplayAmount("1500000"), "1.5");
  assert.equal(amount.fromBaseUnits("1000000"), "1");
});

test("XTZ address validation", () => {
  const { wallet } = xtzAdapter;
  assert.equal(wallet.validateAddress("tz1hLD6CTe7LdERvUPkqiKgmM1rtE72axRsv"), true);
  assert.equal(wallet.validateAddress("KT1K4EwTpbvYN9agJptpyCBjqX11zEEWMKbb"), true);
  assert.equal(wallet.validateAddress("0x1234567890123456789012345678901234567890"), false);
  assert.equal(wallet.validateAddress(""), false);
});

test("XTZ wallet derivation primitives", async () => {
  const { wallet } = xtzAdapter;
  const mnemonic = "test test test test test test test test test test test junk";
  const result = await wallet.createWallet("mainnet", mnemonic);
  
  assert.ok(result.address.startsWith("tz1"));
  assert.equal(result.mnemonic, mnemonic);
  assert.ok(result.publicKey);
  assert.match(result.publicKey, /^edpk/);
});

test("XTZ mapper correctness", () => {
  const { mapper } = xtzAdapter;
  const mockRaw = {
    hash: "ooV6Y...DummyHash",
    type: "transaction",
    sender: { address: "tz1Source" },
    target: { address: "tz1Target" },
    amount: 1000000,
    fee: 1500,
    status: "applied",
    timestamp: "2024-01-01T00:00:00Z",
    level: 12345
  };
  const mapped = mapper.mapTransaction(mockRaw, "tz1Target");
  assert.ok(mapped);
  assert.equal(mapped.txHash, "ooV6Y...DummyHash");
  assert.equal(mapped.direction, "incoming");
  assert.equal(mapped.amount, "1");
  assert.equal(mapped.networkFee, "0.0015");
  assert.equal(mapped.chainStatus, "confirmed");
});

test("XTZ active runtime behavior", async () => {
  assert.equal(xtzAdapter.metadata.isPlaceholder, false);
  assert.equal(xtzAdapter.metadata.implementationStatus, "active");
});
test("XTZ balance field validation", async () => {
  const { balance } = xtzAdapter;
  // Mocking client to avoid network call in this specific test or just test the mapper if it was separate
  // Since fetchBalance is async and uses client, we just verify the structure it should return
  // We can mock the getClient if needed, but here we'll just check if it's defined and has the right contract
  assert.equal(typeof balance.fetchBalance, "function");
});

test("XTZ mapper sender/recipient fields", () => {
  const { mapper } = xtzAdapter;
  const mockRaw = {
    hash: "tx123",
    type: "transaction",
    sender: { address: "tz1Sender" },
    target: { address: "tz1Recipient" },
    amount: 5000000,
    fee: 1000,
    status: "applied"
  };
  
  const incoming = mapper.mapTransaction(mockRaw, "tz1Recipient");
  assert.equal(incoming.direction, "incoming");
  assert.equal(incoming.fromAddress, "tz1Sender");
  assert.equal(incoming.toAddress, "tz1Recipient");
  
  const outgoing = mapper.mapTransaction(mockRaw, "tz1Sender");
  assert.equal(outgoing.direction, "outgoing");
  assert.equal(outgoing.fromAddress, "tz1Sender");
  assert.equal(outgoing.toAddress, "tz1Recipient");
});

test("XTZ destination validation aliases", () => {
  const { transaction } = xtzAdapter;
  const validAddr = "tz1hLD6CTe7LdERvUPkqiKgmM1rtE72axRsv";

  // Test destinationAddress
  const res1 = transaction.validateDestination({ destinationAddress: validAddr });
  assert.equal(res1.destinationAddress, validAddr);

  // Test toAddress
  const res2 = transaction.validateDestination({ toAddress: validAddr });
  assert.equal(res2.destinationAddress, validAddr);

  // Test destination
  const res3 = transaction.validateDestination({ destination: validAddr });
  assert.equal(res3.destinationAddress, validAddr);

  // Test to
  const res4 = transaction.validateDestination({ to: validAddr });
  assert.equal(res4.destinationAddress, validAddr);

  // Test with whitespace
  const res5 = transaction.validateDestination({ destinationAddress: `  ${validAddr}  ` });
  assert.equal(res5.destinationAddress, validAddr);

  // Test empty fails
  assert.throws(() => transaction.validateDestination({}), /Destination address is required/);
  assert.throws(() => transaction.validateDestination({ to: "" }), /Destination address is required/);

  // Test invalid fails
  assert.throws(() => transaction.validateDestination({ to: "invalid" }), /Invalid Tezos destination address/);
});

test("XTZ executeTransfer keeps submitted operations pending and reveals with edpk keys", async (t) => {
  const { client, transaction, wallet } = xtzAdapter;
  const originalGetClient = client.getClient;
  const originalDeriveKeypairFromMnemonic = wallet.deriveKeypairFromMnemonic;
  let forgedOperations = [];

  t.after(() => {
    client.getClient = originalGetClient;
    wallet.deriveKeypairFromMnemonic = originalDeriveKeypairFromMnemonic;
  });

  client.getClient = () => ({
    getAccountConfig: async () => ({
      branch: "BLockGenesisGenesisGenesisGenesisGenesisf79b5d1CoW2",
      counter: 0,
      isRevealed: false,
    }),
    forgeOperations: async (_branch, operations) => {
      forgedOperations = operations;
      return "deadbeef";
    },
    injectOperation: async () => "ooTestInjectedHash1234567890",
  });

  wallet.deriveKeypairFromMnemonic = () => ({
    address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    publicKey: "edpktestpublickey1111111111111111111111111111111111111111",
    privateKey: "11".repeat(32),
  });

  const result = await transaction.executeTransfer({
    network: "ghostnet",
    mnemonic: "test test test test test test test test test test test junk",
    fromAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    toAddress: "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6",
    amount: "1",
  });

  assert.equal(forgedOperations[0]?.kind, "reveal");
  assert.match(String(forgedOperations[0]?.public_key || ""), /^edpk/);
  assert.equal(result.txHash, "ooTestInjectedHash1234567890");
  assert.equal(result.chainStatus, "submitted");
  assert.equal(result.validated, false);
  assert.equal(result.succeeded, false);
});

test("XTZ executeTransfer preserves forge failure details with the exact Tezos stage", async (t) => {
  const { client, transaction, wallet } = xtzAdapter;
  const originalGetClient = client.getClient;
  const originalDeriveKeypairFromMnemonic = wallet.deriveKeypairFromMnemonic;

  t.after(() => {
    client.getClient = originalGetClient;
    wallet.deriveKeypairFromMnemonic = originalDeriveKeypairFromMnemonic;
  });

  client.getClient = () => ({
    getAccountConfig: async () => ({
      branch: "BLockGenesisGenesisGenesisGenesisGenesisf79b5d1CoW2",
      counter: 0,
      isRevealed: false,
    }),
    forgeOperations: async () => {
      const error = new Error("RPC rejected reveal public key");
      error.response = {
        status: 400,
        statusText: "Bad Request",
        data: {
          kind: "temporary",
          id: "proto.mock.invalid_public_key",
          msg: "Invalid public key",
        },
      };
      throw error;
    },
    injectOperation: async () => {
      throw new Error("inject should not be reached");
    },
  });

  wallet.deriveKeypairFromMnemonic = () => ({
    address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    publicKey: "edpktestpublickey1111111111111111111111111111111111111111",
    privateKey: "11".repeat(32),
  });

  await assert.rejects(
    () =>
      transaction.executeTransfer({
        network: "ghostnet",
        mnemonic: "test test test test test test test test test test test junk",
        fromAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
        toAddress: "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6",
        amount: "1",
      }),
    (error) => {
      assert.equal(error.message, "Failed to submit XTZ transaction");
      assert.equal(error.errors?.stage, "forge_operations");
      assert.equal(error.errors?.providerStatus, 400);
      assert.equal(
        error.errors?.providerData?.msg,
        "Invalid public key",
      );
      assert.match(String(error.errors?.reason || ""), /RPC rejected reveal public key/);
      return true;
    },
  );
});

test("XTZ getBalance falls back to RPC when TzKT is unavailable", async (t) => {
  const { client } = xtzAdapter;
  const originalAxiosGet = axios.get;
  const originalMainnetRpcUrl = process.env.XTZ_MAINNET_RPC_URL;
  const calls = [];

  t.after(() => {
    axios.get = originalAxiosGet;
    process.env.XTZ_MAINNET_RPC_URL = originalMainnetRpcUrl;
  });

  process.env.XTZ_MAINNET_RPC_URL = "http://127.0.0.1:8732";

  axios.get = async (url) => {
    calls.push(url);

    if (String(url).includes("api.tzkt.io")) {
      const error = new Error("TzKT upstream timeout");
      error.response = {
        status: 503,
        statusText: "Service Unavailable",
        data: { message: "upstream unavailable" },
      };
      throw error;
    }

    if (String(url).includes("/context/contracts/tz1fallbackbalance/balance")) {
      return { data: "1234567" };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await client.getClient("mainnet").getBalance("tz1fallbackbalance");

  assert.equal(result.baseUnitBalance, "1234567");
  assert.equal(result.exists, true);
  assert.equal(result.confirmed, true);
  assert.equal(result.raw?.source, "rpc_fallback");
  assert.equal(result.raw?.tzktError?.status, 503);
  assert.equal(calls.length, 2);
});

test("XTZ client rejects explorer URLs as RPC endpoints", async (t) => {
  const { client } = xtzAdapter;
  const originalAxiosGet = axios.get;
  const originalMainnetRpcUrl = process.env.XTZ_MAINNET_RPC_URL;

  t.after(() => {
    axios.get = originalAxiosGet;
    process.env.XTZ_MAINNET_RPC_URL = originalMainnetRpcUrl;
  });

  process.env.XTZ_MAINNET_RPC_URL = "https://tzkt.io/";
  axios.get = async () => {
    const error = new Error("TzKT upstream timeout");
    error.response = {
      status: 503,
      statusText: "Service Unavailable",
      data: { message: "upstream unavailable" },
    };
    throw error;
  };

  await assert.rejects(
    () => client.getClient("mainnet").getBalance("tz1rejectexplorerurl"),
    (error) => {
      assert.equal(error.message, "Failed to fetch Tezos balance");
      assert.match(
        String(error.errors?.reason || ""),
        /explorer URL provided instead of node RPC/i,
      );
      assert.equal(error.errors?.stage, "get_balance");
      return true;
    },
  );
});
