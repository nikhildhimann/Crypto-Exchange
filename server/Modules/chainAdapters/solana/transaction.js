const {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const client = require("./client");
const amount = require("./amount");
const wallet = require("./wallet");
const { AppError } = require("../../../helpers/errors");
const { subtractBaseUnits } = require("../../../common/utils/amount");

function normalizeExecutionParams(input = {}) {
  const executionParams =
    input.executionParams && typeof input.executionParams === "object"
      ? { ...input.executionParams }
      : {};

  if (Object.keys(executionParams).length) {
    throw AppError.validation("Solana native transfers do not support executionParams yet");
  }

  return {};
}

function getSigningKeypair(mnemonic) {
  return wallet.deriveKeypairFromMnemonic(mnemonic).keypair;
}

function normalizeBlockTime(blockTime) {
  if (typeof blockTime !== "number") {
    return undefined;
  }

  const timestamp = new Date(blockTime * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

async function buildTransferTransaction(connection, input) {
  const amountBaseUnits = amount.toBaseUnits(input.amount);
  const latestBlockhash = await client.withRpcRetry(input.network, "fetching Solana latest blockhash", () =>
    connection.getLatestBlockhash("confirmed"),
  );
  const transaction = new Transaction({
    feePayer: new PublicKey(input.fromAddress),
    recentBlockhash: latestBlockhash.blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(input.fromAddress),
      toPubkey: new PublicKey(input.toAddress),
      lamports: BigInt(amountBaseUnits),
    }),
  );

  return {
    transaction,
    amountBaseUnits,
    latestBlockhash,
  };
}

async function validateDestination(input) {
  const destinationAddress = String(input.destinationAddress || "").trim();
  if (!wallet.validateAddress(destinationAddress)) {
    throw AppError.validation("Invalid Solana destination address");
  }

  return {
    destinationAddress,
    executionParams: normalizeExecutionParams(input),
  };
}

async function assertPreviewTransferAllowed(input = {}) {
  const minimumReserveBaseUnits = String(
    input.balance?.metadata?.minimumReserveBaseUnits || "0",
  );
  const onChainBaseUnits = input.getOnChainBalanceBaseUnits(input.balance);
  const remainingOnChainBaseUnits = subtractBaseUnits(
    onChainBaseUnits,
    input.preview.totalDebitBaseUnits,
  );
  const remainingOnChain = BigInt(remainingOnChainBaseUnits);
  const minimumReserve = BigInt(minimumReserveBaseUnits);

  if (remainingOnChain <= 0n || remainingOnChain >= minimumReserve) {
    return;
  }

  const maxKeepAliveBaseUnits = BigInt(onChainBaseUnits) > minimumReserve + BigInt(input.preview.networkFeeBaseUnits)
    ? (
        BigInt(onChainBaseUnits) -
        minimumReserve -
        BigInt(input.preview.networkFeeBaseUnits)
      ).toString()
    : "0";
  const maxDrainBaseUnits = BigInt(onChainBaseUnits) > BigInt(input.preview.networkFeeBaseUnits)
    ? (BigInt(onChainBaseUnits) - BigInt(input.preview.networkFeeBaseUnits)).toString()
    : "0";
  const keepAliveAmount = input.fromBaseUnits(maxKeepAliveBaseUnits);
  const drainAmount = input.fromBaseUnits(maxDrainBaseUnits);
  const remainingAmount = input.fromBaseUnits(remainingOnChainBaseUnits);
  const minimumReserveAmount = input.fromBaseUnits(minimumReserveBaseUnits);

  if (BigInt(maxKeepAliveBaseUnits) === 0n) {
    throw AppError.validation(
      `This transfer would leave ${remainingAmount} SOL in the sender wallet, which is below Solana's rent-exempt minimum of ${minimumReserveAmount} SOL. With the current balance, you cannot send a partial amount and keep the wallet rent-exempt. Either keep the funds in the wallet or fully drain about ${drainAmount} SOL.`,
    );
  }

  throw AppError.validation(
    `This transfer would leave ${remainingAmount} SOL in the sender wallet, which is below Solana's rent-exempt minimum of ${minimumReserveAmount} SOL. Send ${keepAliveAmount} SOL or less to keep the wallet rent-exempt, or fully drain about ${drainAmount} SOL.`,
  );
}

async function estimateTransfer(input) {
  const connection = client.getClient(input.network);
  const executionParams = normalizeExecutionParams(input);
  const { transaction } = await buildTransferTransaction(connection, {
    network: input.network,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    amount: input.amount,
  });
  const feeResponse = await client.withRpcRetry(input.network, "estimating Solana transfer fee", () =>
    connection.getFeeForMessage(
      transaction.compileMessage(),
      "confirmed",
    ),
  );
  const networkFeeBaseUnits = String(feeResponse?.value || 0);

  return {
    networkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
    preparedTransaction: {
      feePayer: input.fromAddress,
      toAddress: input.toAddress,
      amount: input.amount,
    },
    executionParams,
  };
}

async function executeTransfer(input) {
  const connection = client.getClient(input.network);
  const signingKeypair = getSigningKeypair(input.mnemonic);
  const executionParams = normalizeExecutionParams(input);

  if (signingKeypair.publicKey.toBase58() !== input.fromAddress) {
    throw AppError.conflict("Derived wallet address mismatch");
  }

  const { transaction } = await buildTransferTransaction(connection, {
    network: input.network,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    amount: input.amount,
  });
  const txHash = await client.withRpcRetry(input.network, "submitting Solana transfer", () =>
    sendAndConfirmTransaction(connection, transaction, [signingKeypair], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    }),
  );
  const parsedTransaction = await client.withRpcRetry(input.network, "fetching submitted Solana transaction", () =>
    connection.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    }),
  );
  const feeBaseUnits = String(parsedTransaction?.meta?.fee || 0);
  const succeeded = !parsedTransaction?.meta?.err;
  const chainTimestamp = normalizeBlockTime(parsedTransaction?.blockTime);

  return {
    txHash,
    ledgerIndex:
      typeof parsedTransaction?.slot === "number" ? parsedTransaction.slot : undefined,
    networkFeeBaseUnits: feeBaseUnits,
    networkFee: amount.fromBaseUnits(feeBaseUnits),
    chainStatus: succeeded ? "confirmed" : "failed",
    succeeded,
    validated: true,
    chainTimestamp,
    confirmedAt: chainTimestamp,
    rawRequest: {
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      amount: input.amount,
      executionParams,
    },
    rawResponse: parsedTransaction,
    executionParams,
  };
}

async function fetchHistory(input) {
  const connection = client.getClient(input.network);
  const address = new PublicKey(input.address);
  const signatureInfos = await client.withRpcRetry(input.network, "fetching Solana signatures", () =>
    connection.getSignaturesForAddress(address, {
      limit: input.limit || 50,
    }),
  );

  if (!signatureInfos.length) {
    return [];
  }

  const parsedTransactions = await client.getParsedTransactionsBatched(
    input.network,
    signatureInfos.map((entry) => entry.signature),
    {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    },
  );

  return signatureInfos.map((signatureInfo, index) => ({
    signatureInfo,
    parsedTransaction: parsedTransactions[index] || null,
  }));
}

module.exports = {
  normalizeExecutionParams,
  validateDestination,
  assertPreviewTransferAllowed,
  estimateTransfer,
  executeTransfer,
  fetchHistory,
  validateAddress: wallet.validateAddress,
};
