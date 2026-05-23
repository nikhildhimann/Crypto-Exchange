const test = require("node:test");
const assert = require("node:assert/strict");

const transactionService = require("../Modules/transaction/service");
const Transaction = require("../Modules/transaction/model");
const consistencyService = require("../Modules/transaction/consistency.service");
const balanceService = require("../Modules/balance/service");
const notificationService = require("../services/notifications/service");
const socket = require("../lib/socket");
const atomicityService = require("../services/atomicity.service");

test("XTZ send keeps a successfully injected transaction successful even if post-submit work fails", async (t) => {
  const originalMethods = {
    getWalletOrFail: transactionService.getWalletOrFail,
    getContext: transactionService.getContext,
    resolveTransferAsset: transactionService.resolveTransferAsset,
    createDeferredMnemonicProvider: transactionService.createDeferredMnemonicProvider,
    assertSufficientBalance: transactionService.assertSufficientBalance,
    buildTransactionAmounts: transactionService.buildTransactionAmounts,
    buildChainStatusFields: transactionService.buildChainStatusFields,
    buildTransactionTimeFields: transactionService.buildTransactionTimeFields,
    fromBaseUnits: transactionService.fromBaseUnits,
    fromTransferBaseUnits: transactionService.fromTransferBaseUnits,
    logSensitiveOperation: transactionService.logSensitiveOperation,
    getTransactionById: transactionService.getTransactionById,
    transactionCreate: Transaction.create,
    transactionUpdateOne: Transaction.updateOne,
    transactionFindById: Transaction.findById,
    upsertWithdrawalFromTransaction: consistencyService.upsertWithdrawalFromTransaction,
    invalidateBalanceReadState: balanceService.invalidateBalanceReadState,
    getWalletBalance: balanceService.getWalletBalance,
    createAndEmitNotification: notificationService.createAndEmitNotification,
    emitTransactionNew: socket.emitTransactionNew,
    emitTransactionUpdate: socket.emitTransactionUpdate,
  };

  t.after(() => {
    transactionService.getWalletOrFail = originalMethods.getWalletOrFail;
    transactionService.getContext = originalMethods.getContext;
    transactionService.resolveTransferAsset = originalMethods.resolveTransferAsset;
    transactionService.createDeferredMnemonicProvider =
      originalMethods.createDeferredMnemonicProvider;
    transactionService.assertSufficientBalance =
      originalMethods.assertSufficientBalance;
    transactionService.buildTransactionAmounts =
      originalMethods.buildTransactionAmounts;
    transactionService.buildChainStatusFields =
      originalMethods.buildChainStatusFields;
    transactionService.buildTransactionTimeFields =
      originalMethods.buildTransactionTimeFields;
    transactionService.fromBaseUnits = originalMethods.fromBaseUnits;
    transactionService.fromTransferBaseUnits =
      originalMethods.fromTransferBaseUnits;
    transactionService.logSensitiveOperation =
      originalMethods.logSensitiveOperation;
    transactionService.getTransactionById = originalMethods.getTransactionById;
    Transaction.create = originalMethods.transactionCreate;
    Transaction.updateOne = originalMethods.transactionUpdateOne;
    Transaction.findById = originalMethods.transactionFindById;
    consistencyService.upsertWithdrawalFromTransaction =
      originalMethods.upsertWithdrawalFromTransaction;
    balanceService.invalidateBalanceReadState =
      originalMethods.invalidateBalanceReadState;
    balanceService.getWalletBalance = originalMethods.getWalletBalance;
    notificationService.createAndEmitNotification =
      originalMethods.createAndEmitNotification;
    socket.emitTransactionNew = originalMethods.emitTransactionNew;
    socket.emitTransactionUpdate = originalMethods.emitTransactionUpdate;
  });

  const wallet = {
    _id: "wallet-xtz-sender",
    userId: "user-sender",
    accountId: "account-1",
    chain: "xtz",
    network: "mainnet",
    address: "tz1sender",
  };
  const preview = {
    amount: "0.001",
    amountBaseUnits: "1000",
    asset: "XTZ",
    currency: "XTZ",
    toAddress: "tz1recipient",
    executionParams: {},
    recipientGets: "0.001",
    recipientGetsBaseUnits: "1000",
    networkFee: "0.0015",
    networkFeeBaseUnits: "1500",
    platformFee: "0",
    platformFeeBaseUnits: "0",
    totalDebit: "0.0025",
    totalDebitBaseUnits: "2500",
    availableBalance: "3.727885",
    availableBalanceBaseUnits: "3727885",
    remainingBalance: "3.725385",
    remainingBalanceBaseUnits: "3725385",
    samePlatformRecipient: true,
    samePlatformRecipientUserId: "user-recipient",
    samePlatformRecipientWalletId: "wallet-xtz-recipient",
  };
  const pendingTransaction = {
    _id: "tx-pending-xtz-1",
    toObject() {
      return {
        _id: this._id,
        walletId: wallet._id,
        txHash: null,
      };
    },
  };
  const finalizedTransaction = {
    _id: "tx-pending-xtz-1",
    walletId: wallet._id,
    txHash: "ooInjectedXtztx123",
    chainStatus: "submitted",
    status: "pending",
  };
  let consistencyCallCount = 0;
  const balanceRefreshCalls = [];

  transactionService.getWalletOrFail = async () => wallet;
  transactionService.getContext = () => ({
    chain: "xtz",
    assetSymbol: "XTZ",
    adapter: {
      transaction: {
        executeTransfer: async () => ({
          txHash: "ooInjectedXtztx123",
          chainStatus: "submitted",
          validated: false,
          succeeded: false,
          confirmations: 0,
          networkFee: "0.0015",
          networkFeeBaseUnits: "1500",
          rawRequest: { forged: true },
          rawResponse: { injected: true },
        }),
      },
    },
  });
  transactionService.resolveTransferAsset = () => ({
    asset: "XTZ",
    symbol: "XTZ",
    assetType: "native",
    standard: "native",
    contractAddress: null,
  });
  transactionService.createDeferredMnemonicProvider = () => async () => "mnemonic";
  transactionService.assertSufficientBalance = async () => undefined;
  transactionService.buildTransactionAmounts = (_context, payload) => ({
    amount: payload.amount,
    amountBaseUnits: payload.amountBaseUnits,
    currency: payload.currency,
    asset: payload.asset,
    networkFee: payload.networkFee,
    networkFeeBaseUnits: payload.networkFeeBaseUnits,
    platformFee: payload.platformFee,
    platformFeeBaseUnits: payload.platformFeeBaseUnits,
    totalDebit: payload.totalDebit,
    totalDebitBaseUnits: payload.totalDebitBaseUnits,
    recipientGets: payload.recipientGets,
    recipientGetsBaseUnits: payload.recipientGetsBaseUnits,
    availableBalance: payload.availableBalance,
    availableBalanceBaseUnits: payload.availableBalanceBaseUnits,
    remainingBalance: payload.remainingBalance,
    remainingBalanceBaseUnits: payload.remainingBalanceBaseUnits,
  });
  transactionService.buildChainStatusFields = (_context, chainStatus) => ({
    chainStatus,
  });
  transactionService.buildTransactionTimeFields = () => ({});
  transactionService.fromBaseUnits = (_context, amountBaseUnits) =>
    (Number(amountBaseUnits || 0) / 1_000_000).toString();
  transactionService.fromTransferBaseUnits = (_assetDescriptor, amountBaseUnits) =>
    (Number(amountBaseUnits || 0) / 1_000_000).toString();
  transactionService.logSensitiveOperation = () => undefined;
  transactionService.getTransactionById = async () => ({
    ...finalizedTransaction,
    userId: wallet.userId,
  });

  Transaction.create = async () => pendingTransaction;
  Transaction.updateOne = async () => ({ acknowledged: true });
  Transaction.findById = () => ({
    lean: async () => finalizedTransaction,
  });

  consistencyService.upsertWithdrawalFromTransaction = async () => {
    consistencyCallCount += 1;
    if (consistencyCallCount > 1) {
      throw new Error("post-submit consistency failed");
    }
    return null;
  };

  balanceService.invalidateBalanceReadState = async (userId) => {
    balanceRefreshCalls.push({ type: "invalidate", userId: String(userId) });
    return null;
  };
  balanceService.getWalletBalance = async (userId, walletId) => {
    balanceRefreshCalls.push({
      type: "get",
      userId: String(userId),
      walletId: String(walletId),
    });

    if (String(walletId) === "wallet-xtz-recipient") {
      throw new Error("recipient refresh timed out");
    }

    return { walletId: String(walletId) };
  };

  notificationService.createAndEmitNotification = async () => {
    throw new Error("notification transport unavailable");
  };

  socket.emitTransactionNew = () => {
    throw new Error("socket new failed");
  };
  socket.emitTransactionUpdate = () => {
    throw new Error("socket update failed");
  };

  const result = await transactionService.executeExternalTransfer(
    {
      userId: wallet.userId,
      walletId: wallet._id,
      requestId: "req-xtz-send-1",
    },
    preview,
  );

  assert.equal(result.txHash, "ooInjectedXtztx123");
  assert.equal(result.status, "pending");
  assert.deepEqual(
    balanceRefreshCalls.filter((entry) => entry.type === "get"),
    [
      {
        type: "get",
        userId: "user-sender",
        walletId: "wallet-xtz-sender",
      },
      {
        type: "get",
        userId: "user-recipient",
        walletId: "wallet-xtz-recipient",
      },
    ],
  );
});

test("sendTransaction does not replay a completed send for the same payload without an explicit idempotency key", async (t) => {
  const originalMethods = {
    previewTransfer: transactionService.previewTransfer,
    executeExternalTransfer: transactionService.executeExternalTransfer,
    executeInternalTransfer: transactionService.executeInternalTransfer,
    withLock: atomicityService.withLock,
    withIdempotentOperation: atomicityService.withIdempotentOperation,
    transactionFindOne: Transaction.findOne,
  };

  t.after(() => {
    transactionService.previewTransfer = originalMethods.previewTransfer;
    transactionService.executeExternalTransfer = originalMethods.executeExternalTransfer;
    transactionService.executeInternalTransfer = originalMethods.executeInternalTransfer;
    atomicityService.withLock = originalMethods.withLock;
    atomicityService.withIdempotentOperation = originalMethods.withIdempotentOperation;
    Transaction.findOne = originalMethods.transactionFindOne;
  });

  const preview = {
    canSubmit: true,
    transactionType: "external",
    toAddress: "tz1recipient",
    asset: "XTZ",
    amountBaseUnits: "10000",
    amount: "0.01",
    chain: "xtz",
    network: "mainnet",
  };

  const executions = [];
  let withLockCalls = 0;
  let withIdempotentCalls = 0;

  transactionService.previewTransfer = async () => preview;
  transactionService.executeExternalTransfer = async () => {
    const nextId = `tx-${executions.length + 1}`;
    executions.push(nextId);
    return { _id: nextId, id: nextId, txHash: `hash-${nextId}`, status: "pending" };
  };
  transactionService.executeInternalTransfer = async () => {
    throw new Error("internal transfer should not be used");
  };
  Transaction.findOne = () => ({
    sort() {
      return this;
    },
    lean: async () => null,
  });

  atomicityService.withLock = async (_options, callback) => {
    withLockCalls += 1;
    return callback({});
  };
  atomicityService.withIdempotentOperation = async (_options, callback) => {
    withIdempotentCalls += 1;
    return callback({});
  };

  const first = await transactionService.sendTransaction({
    userId: "user-1",
    walletId: "wallet-1",
    chain: "xtz",
    network: "mainnet",
    destinationAddress: "tz1recipient",
    amount: "0.01",
    asset: "XTZ",
  });

  const second = await transactionService.sendTransaction({
    userId: "user-1",
    walletId: "wallet-1",
    chain: "xtz",
    network: "mainnet",
    destinationAddress: "tz1recipient",
    amount: "0.01",
    asset: "XTZ",
  });

  assert.equal(withLockCalls, 2);
  assert.equal(withIdempotentCalls, 0);
  assert.equal(first._id, "tx-1");
  assert.equal(second._id, "tx-2");
});
