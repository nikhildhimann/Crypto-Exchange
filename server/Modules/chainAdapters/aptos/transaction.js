const { AppError } = require("../../../helpers/errors");
const amount = require("./amount");
const balance = require("./balance");
const client = require("./client");
const mapper = require("./mapper");
const wallet = require("./wallet");

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const DEFAULT_WAIT_TIMEOUT_SECS = 20;
const DEFAULT_TX_HASH_RETRY_COUNT = 3;
const DEFAULT_TX_HASH_RETRY_DELAY_MS = 500;
const DEFAULT_GAS_UNIT_PRICE = 100n;
const DEFAULT_SIMULATION_MAX_GAS_UNITS = 100000n;
const MAX_TRANSACTION_GAS_UNITS = 100000n;
const TRANSFER_GAS_MULTIPLIER = 2n;

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeExecutionParams(input = {}) {
  const executionParams =
    input.executionParams && typeof input.executionParams === "object"
      ? { ...input.executionParams }
      : {};

  if (Object.keys(executionParams).length) {
    throw AppError.validation(
      "APT native transfers do not support executionParams yet",
    );
  }

  return {};
}

function normalizeAddress(address, label) {
  try {
    return wallet.normalizeAddress(address);
  } catch (_error) {
    throw AppError.validation(`Invalid APT ${label}`);
  }
}

function normalizeTransactionHash(txHash) {
  const normalized = normalizeString(txHash).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw AppError.validation("Invalid APT transaction hash");
  }

  return normalized;
}

function normalizeHistoryLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertNativeAptAsset(input = {}) {
  const asset = normalizeString(
    input.asset || input.assetDescriptor?.asset || "APT",
  ).toUpperCase();
  const assetType = normalizeString(
    input.assetDescriptor?.assetType || "native",
  ).toLowerCase();

  if (asset !== "APT" || assetType !== "native") {
    throw AppError.validation("APT adapter only supports native APT transfers");
  }
}

function normalizeAmountBaseUnits(rawAmount) {
  const normalizedAmount = amount.normalizeDisplayAmount(rawAmount);
  const amountBaseUnits = String(amount.toBaseUnits(normalizedAmount));
  const amountBigInt = BigInt(amountBaseUnits);

  if (amountBigInt <= 0n) {
    throw AppError.validation("APT amount must be greater than 0");
  }

  return {
    amount: normalizedAmount,
    amountBaseUnits,
    amountBigInt,
  };
}

function normalizeGasUnitPrice(raw = {}) {
  const candidates = [
    raw.prioritized_gas_estimate,
    raw.gas_estimate,
    raw.deprioritized_gas_estimate,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeString(candidate);
    if (/^\d+$/.test(normalized)) {
      return BigInt(normalized);
    }
  }

  return DEFAULT_GAS_UNIT_PRICE;
}

function normalizeGasUsed(raw = {}) {
  const normalized = normalizeString(raw.gas_used || "0");
  return /^\d+$/.test(normalized) ? BigInt(normalized) : 0n;
}

function deriveMaxGasUnits(simulatedGasUsed) {
  if (simulatedGasUsed <= 0n) {
    return DEFAULT_SIMULATION_MAX_GAS_UNITS;
  }

  const expanded = simulatedGasUsed * TRANSFER_GAS_MULTIPLIER;
  return expanded > MAX_TRANSACTION_GAS_UNITS
    ? MAX_TRANSACTION_GAS_UNITS
    : expanded;
}

function computeFeeBaseUnits(gasUnits, gasUnitPrice) {
  return (BigInt(gasUnits) * BigInt(gasUnitPrice)).toString();
}

function buildPreparedMetadata({
  fromAddress,
  toAddress,
  amountValue,
  amountBaseUnits,
  gasUnitPrice,
  simulatedGasUnits,
  maxGasUnits,
}) {
  const estimatedFeeBaseUnits = computeFeeBaseUnits(simulatedGasUnits, gasUnitPrice);
  const feeCapBaseUnits = computeFeeBaseUnits(maxGasUnits, gasUnitPrice);

  return {
    fromAddress,
    toAddress,
    amount: amountValue,
    amountBaseUnits,
    gasUnitPrice: gasUnitPrice.toString(),
    simulatedGasUnits: simulatedGasUnits.toString(),
    maxGasUnits: maxGasUnits.toString(),
    estimatedNetworkFeeBaseUnits: estimatedFeeBaseUnits,
    estimatedNetworkFee: amount.fromBaseUnits(estimatedFeeBaseUnits),
    feeCapBaseUnits,
    feeCap: amount.fromBaseUnits(feeCapBaseUnits),
  };
}

function buildRawRequest(fromAddress, toAddress, amountValue, executionParams, prepared) {
  return {
    fromAddress,
    toAddress,
    amount: amountValue,
    executionParams,
    gasUnitPrice: prepared.gasUnitPrice,
    maxGasUnits: prepared.maxGasUnits,
    estimatedNetworkFee: prepared.estimatedNetworkFee,
    estimatedNetworkFeeBaseUnits: prepared.estimatedNetworkFeeBaseUnits,
    feeCap: prepared.feeCap,
    feeCapBaseUnits: prepared.feeCapBaseUnits,
  };
}

function isNetworkErrorMessage(reason = "") {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("timeout") ||
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("socket") ||
    normalized.includes("provider")
  );
}

function buildRpcError(error, fallbackMessage) {
  if (error instanceof AppError) {
    return error;
  }

  const reason = normalizeString(
    error?.data?.message ||
      error?.response?.data?.message ||
      error?.message ||
      fallbackMessage,
  );
  const normalized = reason.toLowerCase();

  if (
    normalized.includes("insufficient_balance_for_transaction_fee") ||
    normalized.includes("insufficient balance")
  ) {
    return AppError.validation(
      "Insufficient APT balance to cover the amount and network fee",
    );
  }

  if (normalized.includes("out of gas")) {
    return AppError.validation(
      "APT transaction exceeded the current gas limit; please retry the transfer",
    );
  }

  if (
    normalized.includes("sequence_number_too_old") ||
    normalized.includes("sequence number too old")
  ) {
    return AppError.conflict(
      "APT wallet sequence is out of date; please refresh and try again",
    );
  }

  if (
    normalized.includes("invalid transaction") &&
    normalized.includes("signature")
  ) {
    return AppError.validation("APT wallet signature is invalid for this sender address");
  }

  if (normalized.includes("transaction_not_found")) {
    return AppError.notFound("APT transaction was not found on-chain");
  }

  if (isNetworkErrorMessage(reason)) {
    return new AppError("APT provider is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError(fallbackMessage, {
    status: 502,
    errors: { reason },
  });
}

function normalizeFinalTransaction(raw, network, walletAddress) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return mapper.mapTransaction(
    {
      ...raw,
      network,
      walletAddress,
      walletAddresses: [walletAddress],
    },
    walletAddress,
  );
}

async function fetchTransactionByHash(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(
    input.network || client.DEFAULT_NETWORK,
  );
  const transactionHash = normalizeTransactionHash(input.txHash || input.transactionHash);
  const retries = Math.max(
    Number.parseInt(String(input.retries ?? DEFAULT_TX_HASH_RETRY_COUNT), 10) || 0,
    0,
  );
  const retryDelayMs = Math.max(
    Number.parseInt(String(input.retryDelayMs ?? DEFAULT_TX_HASH_RETRY_DELAY_MS), 10) || 0,
    0,
  );
  const allowNotFound = input.allowNotFound === true;
  const aptosClient = client.getClient(normalizedNetwork);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await aptosClient.getTransactionByHash(transactionHash);
      return response ? { ...response, network: normalizedNetwork } : null;
    } catch (error) {
      const status = Number(error?.status);
      const message = normalizeString(error?.data?.message || error?.message);
      const notFound = status === 404 || message.toLowerCase().includes("transaction not found");

      if (notFound) {
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        if (allowNotFound) {
          return null;
        }

        throw AppError.notFound("APT transaction was not found on-chain");
      }

      throw buildRpcError(error, "Failed to fetch APT transaction");
    }
  }

  return null;
}

async function resolveTransactionStatus(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(
    input.network || client.DEFAULT_NETWORK,
  );
  const transactionHash = normalizeTransactionHash(input.txHash || input.transactionHash);
  const walletAddress = input.walletAddress
    ? normalizeAddress(input.walletAddress, "wallet address")
    : "";
  const aptosClient = client.getClient(normalizedNetwork);

  try {
    const response = await aptosClient.waitForTransaction(transactionHash, {
      timeoutSecs: Number.parseInt(
        String(input.timeoutSecs ?? DEFAULT_WAIT_TIMEOUT_SECS),
        10,
      ) || DEFAULT_WAIT_TIMEOUT_SECS,
      checkSuccess: false,
    });

    return {
      txHash: transactionHash,
      pending: false,
      raw: {
        ...response,
        network: normalizedNetwork,
      },
      mapped: walletAddress
        ? normalizeFinalTransaction(response, normalizedNetwork, walletAddress)
        : null,
    };
  } catch (error) {
    const reason = normalizeString(error?.message);
    if (reason.toLowerCase().includes("pending state")) {
      const pendingTransaction = await fetchTransactionByHash({
        network: normalizedNetwork,
        txHash: transactionHash,
        allowNotFound: true,
        retries: 1,
        retryDelayMs: 250,
      });

      return {
        txHash: transactionHash,
        pending: true,
        raw: pendingTransaction,
        mapped:
          walletAddress && pendingTransaction
            ? normalizeFinalTransaction(
                pendingTransaction,
                normalizedNetwork,
                walletAddress,
              )
            : null,
      };
    }

    throw buildRpcError(error, "Failed to verify APT transaction");
  }
}

async function buildPreparedTransfer(network, input = {}) {
  assertNativeAptAsset(input);

  const normalizedNetwork = client.normalizeNetwork(network || input.network);
  const executionParams = normalizeExecutionParams(input);
  const fromAddress = normalizeAddress(input.fromAddress, "source address");
  const toAddress = normalizeAddress(
    input.toAddress || input.destinationAddress,
    "destination address",
  );

  if (fromAddress === toAddress) {
    throw AppError.validation("Cannot send APT to the same wallet address");
  }

  if (!input.mnemonic) {
    throw AppError.validation("Wallet mnemonic is required for APT transfers");
  }

  const { amount: normalizedAmount, amountBaseUnits, amountBigInt } =
    normalizeAmountBaseUnits(input.amount);
  const signingAccount = wallet.deriveAccountFromMnemonic(
    input.mnemonic,
    normalizedNetwork,
  ).account;
  const signingAddress = normalizeAddress(
    signingAccount.accountAddress.toString(),
    "source address",
  );

  if (signingAddress !== fromAddress) {
    throw AppError.conflict("Derived wallet address mismatch");
  }

  const aptosClient = client.getClient(normalizedNetwork);
  const balanceResponse = input.balanceResponse || (await balance.fetchBalance({
    network: normalizedNetwork,
    address: fromAddress,
  }));
  const liveBalanceBaseUnits = BigInt(
    String(balanceResponse?.availableBaseUnits || balanceResponse?.baseUnitBalance || "0"),
  );
  const gasEstimate = await aptosClient.getGasPriceEstimation();
  const gasUnitPrice = normalizeGasUnitPrice(gasEstimate);
  const simulationTransaction = await aptosClient.transferCoinTransaction({
    sender: signingAccount.accountAddress,
    recipient: toAddress,
    amount: amountBigInt,
    options: {
      maxGasAmount: DEFAULT_SIMULATION_MAX_GAS_UNITS,
      gasUnitPrice,
    },
  });

  let simulation;
  try {
    const responses = await aptosClient.simulateTransaction(
      simulationTransaction,
      signingAccount.publicKey,
    );
    simulation = Array.isArray(responses) ? responses[0] || null : responses;
  } catch (error) {
    throw buildRpcError(error, "APT transfer simulation failed");
  }

  if (!simulation || typeof simulation !== "object") {
    throw new AppError("APT transfer simulation did not return a usable result", {
      status: 502,
      errors: {
        network: normalizedNetwork,
        fromAddress,
        toAddress,
      },
    });
  }

  if (simulation.success !== true) {
    throw buildRpcError(
      {
        ...simulation,
        message: normalizeString(simulation.vm_status || "APT transfer simulation failed"),
      },
      "APT transfer simulation failed",
    );
  }

  const simulatedGasUnits = normalizeGasUsed(simulation);
  const maxGasUnits = deriveMaxGasUnits(simulatedGasUnits);
  const maxFeeBaseUnits = computeFeeBaseUnits(maxGasUnits, gasUnitPrice);
  const totalRequiredBaseUnits = amountBigInt + BigInt(maxFeeBaseUnits);

  if (liveBalanceBaseUnits < totalRequiredBaseUnits) {
    throw AppError.validation(
      "Insufficient APT balance to cover the amount and network fee",
    );
  }

  const preparedTransaction = buildPreparedMetadata({
    fromAddress,
    toAddress,
    amountValue: normalizedAmount,
    amountBaseUnits,
    gasUnitPrice,
    simulatedGasUnits,
    maxGasUnits,
  });

  const transferTransaction = await aptosClient.transferCoinTransaction({
    sender: signingAccount.accountAddress,
    recipient: toAddress,
    amount: amountBigInt,
    options: {
      maxGasAmount: maxGasUnits,
      gasUnitPrice,
    },
  });

  return {
    network: normalizedNetwork,
    executionParams,
    signingAccount,
    simulation,
    balanceResponse,
    transferInput: {
      fromAddress,
      toAddress,
      amount: normalizedAmount,
      amountBaseUnits,
    },
    preparedTransaction,
    transferTransaction,
    networkFeeBaseUnits: maxFeeBaseUnits,
    networkFee: amount.fromBaseUnits(maxFeeBaseUnits),
  };
}

async function validateDestination(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network);
  const executionParams = normalizeExecutionParams(input);
  const destinationAddress = normalizeAddress(
    input.destinationAddress || input.toAddress,
    "destination address",
  );
  const sourceAddress = input.fromAddress
    ? normalizeAddress(input.fromAddress, "source address")
    : null;

  if (sourceAddress && sourceAddress === destinationAddress) {
    throw AppError.validation("Cannot send APT to the same wallet address");
  }

  return {
    destinationAddress,
    executionParams,
    network: normalizedNetwork,
  };
}

async function estimateTransfer(input = {}) {
  const prepared = await buildPreparedTransfer(input.network, input);

  return {
    networkFeeBaseUnits: prepared.networkFeeBaseUnits,
    networkFee: prepared.networkFee,
    preparedTransaction: prepared.preparedTransaction,
    executionParams: prepared.executionParams,
  };
}

async function executeTransfer(input = {}) {
  const prepared = await buildPreparedTransfer(input.network, input);
  const aptosClient = client.getClient(prepared.network);
  const rawRequest = buildRawRequest(
    prepared.transferInput.fromAddress,
    prepared.transferInput.toAddress,
    prepared.transferInput.amount,
    prepared.executionParams,
    prepared.preparedTransaction,
  );

  try {
    const submission = await aptosClient.signAndSubmitTransaction(
      prepared.signingAccount,
      prepared.transferTransaction,
    );
    const txHash = normalizeTransactionHash(submission?.hash);
    const resolution = await resolveTransactionStatus({
      network: prepared.network,
      txHash,
      walletAddress: prepared.transferInput.fromAddress,
    });
    const mapped = resolution.mapped;

    if (mapped) {
      return {
        txHash,
        sender: prepared.transferInput.fromAddress,
        receiver: prepared.transferInput.toAddress,
        amount: prepared.transferInput.amount,
        ...mapped,
        rawRequest,
        rawResponse: resolution.raw,
      };
    }

    return {
      txHash,
      sender: prepared.transferInput.fromAddress,
      receiver: prepared.transferInput.toAddress,
      amount: prepared.transferInput.amount,
      amountBaseUnits: prepared.transferInput.amountBaseUnits,
      networkFee: prepared.networkFee,
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      chainStatus: resolution.pending ? "pending" : "submitted",
      succeeded: false,
      validated: false,
      confirmations: 0,
      executionParams: prepared.executionParams,
      rawRequest,
      rawResponse: resolution.raw || submission,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to submit APT transfer");
  }
}

async function fetchHistory(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(
    input.network || client.DEFAULT_NETWORK,
  );
  const address = normalizeAddress(input.address, "wallet address");
  const limit = normalizeHistoryLimit(input.limit);
  const activityLimit = Math.min(Math.max(limit * 6, limit), 250);

  try {
    const aptosClient = client.getClient(normalizedNetwork);
    const [accountTransactions, activities] = await Promise.all([
      aptosClient.getAccountTransactions(address, { limit }),
      aptosClient.getFungibleAssetActivities({
        limit: activityLimit,
        where: {
          owner_address: { _eq: address },
          is_transaction_success: { _eq: true },
        },
      }),
    ]);
    const activityVersions = Array.from(
      new Set(
        (Array.isArray(activities) ? activities : [])
          .map((entry) => normalizeString(entry?.transaction_version))
          .filter((entry) => /^\d+$/.test(entry)),
      ),
    ).slice(0, activityLimit);
    const activityTransactions = await Promise.all(
      activityVersions.map((version) =>
        aptosClient.getTransactionByVersion(version),
      ),
    );
    const dedupedEntries = new Map();

    for (const entry of [
      ...(Array.isArray(accountTransactions) ? accountTransactions : []),
      ...(Array.isArray(activityTransactions) ? activityTransactions : []),
    ]) {
      const txHash = normalizeString(entry?.hash).toLowerCase();
      const version = normalizeString(entry?.version);
      const identity = txHash || version;

      if (!identity || dedupedEntries.has(identity)) {
        continue;
      }

      dedupedEntries.set(identity, entry);
    }

    const entries = Array.from(dedupedEntries.values()).sort((left, right) => {
      const leftVersion = BigInt(normalizeString(left?.version || "0") || "0");
      const rightVersion = BigInt(normalizeString(right?.version || "0") || "0");

      if (leftVersion === rightVersion) {
        return 0;
      }

      return leftVersion > rightVersion ? -1 : 1;
    }).slice(0, limit);

    return (Array.isArray(entries) ? entries : []).map((entry) => ({
      ...entry,
      network: normalizedNetwork,
      walletAddress: address,
      walletAddresses: [address],
    }));
  } catch (error) {
    const status = Number(error?.status);
    const reason = normalizeString(error?.data?.message || error?.message);

    if (status === 404 || reason.toLowerCase().includes("account not found")) {
      return [];
    }

    throw buildRpcError(error, "Failed to fetch APT transaction history");
  }
}

module.exports = {
  normalizeExecutionParams,
  validateDestination,
  estimateTransfer,
  executeTransfer,
  fetchHistory,
  fetchTransactionByHash,
  resolveTransactionStatus,
  validateAddress: wallet.validateAddress,
};
