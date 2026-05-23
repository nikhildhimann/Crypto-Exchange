const bitcoin = require("bitcoinjs-lib");
const ecc = require("tiny-secp256k1");
const { ECPairFactory } = require("ecpair");
const mongoose = require("mongoose");

const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const client = require("./client");
const amount = require("./amount");
const wallet = require("./wallet");
const logger = require("../../../common/utils/logger");
const { AppError } = require("../../../helpers/errors");

bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const DEFAULT_CONFIRMATION_TARGET = 6;
const MIN_CONFIRMATION_TARGET = 1;
const MAX_CONFIRMATION_TARGET = 144;
const DEFAULT_FEE_RATE = 1;
const DUST_THRESHOLD_SATOSHIS = 546n;
const SUPPORTED_EXECUTION_PARAM_KEYS = new Set([
  "confirmationTarget",
  "feeRate",
]);

function normalizeAddress(address, label, network) {
  const normalized = String(address || "").trim();

  if (!wallet.validateAddress(normalized, network)) {
    throw AppError.validation(`Invalid BTC ${label}`);
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

function parseIntegerString(value, field, { min = 0 } = {}) {
  const normalized = String(value ?? "").trim();

  if (!/^\d+$/.test(normalized)) {
    throw AppError.validation(`${field} must be a non-negative integer`);
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw AppError.validation(`${field} must be at least ${min}`);
  }

  return parsed;
}

function normalizeExecutionParams(input = {}) {
  const executionParams =
    input.executionParams && typeof input.executionParams === "object"
      ? { ...input.executionParams }
      : {};
  const unsupportedKeys = Object.keys(executionParams).filter(
    (key) => !SUPPORTED_EXECUTION_PARAM_KEYS.has(key),
  );

  if (unsupportedKeys.length) {
    throw AppError.validation(
      `BTC transfers do not support execution params: ${unsupportedKeys.join(", ")}`,
    );
  }

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(executionParams, "confirmationTarget")) {
    const confirmationTarget = parseIntegerString(
      executionParams.confirmationTarget,
      "confirmationTarget",
      { min: MIN_CONFIRMATION_TARGET },
    );
    normalized.confirmationTarget = Math.min(confirmationTarget, MAX_CONFIRMATION_TARGET);
  }

  if (Object.prototype.hasOwnProperty.call(executionParams, "feeRate")) {
    const feeRate = parseIntegerString(executionParams.feeRate, "feeRate", { min: 1 });
    normalized.feeRate = String(feeRate);
  }

  return normalized;
}

function normalizeFeeEstimateValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.max(DEFAULT_FEE_RATE, Math.ceil(numeric));
}

function resolveConfirmationTarget(executionParams = {}) {
  const target = Number(executionParams.confirmationTarget || DEFAULT_CONFIRMATION_TARGET);
  if (!Number.isFinite(target) || target < MIN_CONFIRMATION_TARGET) {
    return DEFAULT_CONFIRMATION_TARGET;
  }

  return Math.min(Math.trunc(target), MAX_CONFIRMATION_TARGET);
}

function resolveFeeRateFromEstimates(estimates = {}, confirmationTarget = DEFAULT_CONFIRMATION_TARGET) {
  const explicitKeys = Object.entries(estimates)
    .map(([key, value]) => ({
      target: Number.parseInt(String(key).trim(), 10),
      feeRate: normalizeFeeEstimateValue(value),
    }))
    .filter((entry) => Number.isFinite(entry.target) && entry.target > 0 && entry.feeRate !== null)
    .sort((a, b) => a.target - b.target);

  if (!explicitKeys.length) {
    return {
      feeRate: DEFAULT_FEE_RATE,
      source: "default",
      confirmationTarget,
    };
  }

  const exact = explicitKeys.find((entry) => entry.target === confirmationTarget);
  if (exact) {
    return {
      feeRate: exact.feeRate,
      source: `estimate:${exact.target}`,
      confirmationTarget,
    };
  }

  const nextHigher = explicitKeys.find((entry) => entry.target >= confirmationTarget);
  if (nextHigher) {
    return {
      feeRate: nextHigher.feeRate,
      source: `estimate:${nextHigher.target}`,
      confirmationTarget,
    };
  }

  const fallback = explicitKeys[explicitKeys.length - 1];
  return {
    feeRate: fallback.feeRate,
    source: `estimate:${fallback.target}`,
    confirmationTarget,
  };
}

async function resolveFeeRate(network, executionParams = {}) {
  if (executionParams.feeRate) {
    return {
      feeRate: Number.parseInt(String(executionParams.feeRate), 10),
      source: "executionParams",
      confirmationTarget: resolveConfirmationTarget(executionParams),
    };
  }

  const confirmationTarget = resolveConfirmationTarget(executionParams);

  try {
    const estimates = await client.getClient(network).fetchFeeEstimates();
    return resolveFeeRateFromEstimates(estimates, confirmationTarget);
  } catch (error) {
    return {
      feeRate: DEFAULT_FEE_RATE,
      source: "default",
      confirmationTarget,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

function estimateVirtualSize(inputCount, outputCount) {
  return 11 + inputCount * 68 + outputCount * 31;
}

function isSpendableUtxo(entry = {}) {
  const txid = String(entry.txid || "").trim();
  const hasValidTxid = /^[a-fA-F0-9]{64}$/.test(txid);
  const vout = Number(entry.vout);
  const hasValidVout = Number.isInteger(vout) && vout >= 0;
  const value = BigInt(String(entry.value ?? "0"));
  const confirmed = entry.status?.confirmed === true;

  return hasValidTxid && hasValidVout && value > 0n && confirmed;
}

function normalizeUtxos(utxos = []) {
  return utxos
    .filter((entry) => {
      try {
        return isSpendableUtxo(entry);
      } catch (_error) {
        return false;
      }
    })
    .map((entry) => ({
      txid: String(entry.txid).trim(),
      vout: Number(entry.vout),
      value: BigInt(String(entry.value)),
      status: entry.status || {},
    }))
    .sort((a, b) => {
      if (a.value !== b.value) {
        return a.value < b.value ? -1 : 1;
      }

      const heightA = Number(a.status?.block_height || 0);
      const heightB = Number(b.status?.block_height || 0);
      if (heightA !== heightB) {
        return heightA - heightB;
      }

      if (a.txid !== b.txid) {
        return a.txid.localeCompare(b.txid);
      }

      return a.vout - b.vout;
    });
}

function buildPreparedSelection({
  selectedUtxos,
  totalInputBaseUnits,
  recipientAmountBaseUnits,
  feeRate,
  outputCount,
  networkFeeBaseUnits,
  changeBaseUnits,
}) {
  return {
    selectedUtxos,
    totalInputBaseUnits: totalInputBaseUnits.toString(),
    recipientAmountBaseUnits: recipientAmountBaseUnits.toString(),
    inputCount: selectedUtxos.length,
    outputCount,
    feeRate,
    estimatedVirtualSize: estimateVirtualSize(selectedUtxos.length, outputCount),
    networkFeeBaseUnits: networkFeeBaseUnits.toString(),
    changeBaseUnits: changeBaseUnits.toString(),
  };
}

function selectUtxos(utxos, recipientAmountBaseUnits, feeRate) {
  const availableUtxos = normalizeUtxos(utxos);
  if (!availableUtxos.length) {
    logger.warn("BTC UTXO selection failed because no confirmed spendable inputs were found", {
      feeRate,
    });
    throw AppError.validation("No confirmed BTC UTXOs are available for this wallet");
  }

  const targetAmount = BigInt(String(recipientAmountBaseUnits));
  const selectedUtxos = [];
  let totalInputBaseUnits = 0n;

  for (const utxo of availableUtxos) {
    selectedUtxos.push(utxo);
    totalInputBaseUnits += utxo.value;

    const feeWithChange = BigInt(
      estimateVirtualSize(selectedUtxos.length, 2) * feeRate,
    );
    const requiredWithChange = targetAmount + feeWithChange;
    if (totalInputBaseUnits < requiredWithChange) {
      continue;
    }

    const tentativeChange = totalInputBaseUnits - targetAmount - feeWithChange;
    if (tentativeChange >= DUST_THRESHOLD_SATOSHIS) {
      return buildPreparedSelection({
        selectedUtxos,
        totalInputBaseUnits,
        recipientAmountBaseUnits: targetAmount,
        feeRate,
        outputCount: 2,
        networkFeeBaseUnits: feeWithChange,
        changeBaseUnits: tentativeChange,
      });
    }

    const minimumFeeWithoutChange = BigInt(
      estimateVirtualSize(selectedUtxos.length, 1) * feeRate,
    );
    const requiredWithoutChange = targetAmount + minimumFeeWithoutChange;
    if (totalInputBaseUnits >= requiredWithoutChange) {
      return buildPreparedSelection({
        selectedUtxos,
        totalInputBaseUnits,
        recipientAmountBaseUnits: targetAmount,
        feeRate,
        outputCount: 1,
        networkFeeBaseUnits: totalInputBaseUnits - targetAmount,
        changeBaseUnits: 0n,
      });
    }
  }

  logger.warn("BTC UTXO selection failed due to insufficient confirmed balance after fee calculation", {
    feeRate,
    targetAmountBaseUnits: targetAmount.toString(),
    availableUtxoCount: availableUtxos.length,
    totalAvailableBaseUnits: availableUtxos.reduce((sum, utxo) => sum + utxo.value, 0n).toString(),
  });
  throw AppError.validation("Insufficient BTC balance to cover the amount and network fee");
}

function normalizeChainTimestamp(value) {
  if (!value && value !== 0) {
    return undefined;
  }

  const timestamp = new Date(Number(value) * 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function computeConfirmations(transaction = {}, tipHeight = 0) {
  if (transaction?.status?.confirmed !== true) {
    return 0;
  }

  const blockHeight = Number(transaction.status?.block_height || 0);
  if (!Number.isFinite(blockHeight) || blockHeight <= 0 || !Number.isFinite(tipHeight) || tipHeight <= 0) {
    return 1;
  }

  return Math.max(tipHeight - blockHeight + 1, 1);
}

function serializeValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]),
    );
  }

  return value;
}

function extractErrorMessage(error, fallback = "Bitcoin request failed") {
  const candidates = [
    error?.response?.data,
    error?.data?.message,
    error?.message,
    error?.reason,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

function buildRpcError(error, fallbackMessage) {
  if (error instanceof AppError) {
    return error;
  }

  const reason = extractErrorMessage(error, fallbackMessage);
  const normalizedReason = reason.toLowerCase();

  if (
    normalizedReason.includes("insufficient") ||
    normalizedReason.includes("not enough")
  ) {
    return AppError.validation("Insufficient BTC balance to cover the amount and network fee");
  }

  if (
    normalizedReason.includes("address") &&
    normalizedReason.includes("invalid")
  ) {
    return AppError.validation("Invalid BTC destination address");
  }

  if (
    normalizedReason.includes("missing inputs") ||
    normalizedReason.includes("inputs missing")
  ) {
    return AppError.conflict("The selected BTC inputs are no longer available. Please try again");
  }

  if (
    normalizedReason.includes("too-long-mempool-chain") ||
    normalizedReason.includes("mempool chain")
  ) {
    return AppError.conflict("This BTC wallet already has too many chained pending transactions");
  }

  if (
    normalizedReason.includes("network") ||
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("fetch") ||
    normalizedReason.includes("http")
  ) {
    return new AppError("Bitcoin provider is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError(fallbackMessage, {
    status: 502,
    errors: { reason },
  });
}

function assertNativeBtcAsset(input = {}) {
  const asset = String(input.asset || input.assetDescriptor?.asset || "BTC").trim().toUpperCase();
  const assetType = String(input.assetDescriptor?.assetType || "native").trim().toLowerCase();

  if (asset !== "BTC" || assetType !== "native") {
    throw AppError.validation("BTC adapter only supports native BTC transfers");
  }
}

async function resolveOwnerWallet(network, fromAddress) {
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  return Wallet.findOne({
    chain: "btc",
    network,
    address: fromAddress,
  }).select("_id userId accountId chain network address").lean();
}

async function findExistingChangeAddress(walletRecord, network) {
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  if (!walletRecord?._id) {
    return null;
  }

  return WalletAddress.findOne({
    walletId: walletRecord._id,
    chain: "btc",
    network,
    branch: wallet.CHANGE_BRANCH,
    addressIndex: wallet.CHANGE_ADDRESS_INDEX,
    isActive: true,
  }).lean();
}

async function resolveDedicatedChangeAddress(network, fromAddress, mnemonic, { persist = false } = {}) {
  const walletRecord = await resolveOwnerWallet(network, fromAddress);
  if (!walletRecord) {
    return null;
  }

  const existingAddress = await findExistingChangeAddress(walletRecord, network);
  if (existingAddress?.address) {
    return String(existingAddress.address).trim();
  }

  if (!persist || !mnemonic) {
    return null;
  }

  const derived = wallet.deriveManagedAddressFromMnemonic(mnemonic, network, {
    branch: wallet.CHANGE_BRANCH,
    addressIndex: wallet.CHANGE_ADDRESS_INDEX,
    purpose: "change",
    isChange: true,
  });
  const managedAddress = derived.managedAddress || {};
  const changeAddress = String(derived.address || managedAddress.address || "").trim();

  if (!changeAddress) {
    throw AppError.internal("Failed to derive BTC change address");
  }

  await WalletAddress.updateOne(
    {
      walletId: walletRecord._id,
      chain: "btc",
      network,
      branch: wallet.CHANGE_BRANCH,
      addressIndex: wallet.CHANGE_ADDRESS_INDEX,
    },
    {
      $set: {
        walletId: walletRecord._id,
        userId: walletRecord.userId,
        chain: "btc",
        network,
        address: changeAddress,
        memo: "",
        derivationPath: String(managedAddress.derivationPath || derived.derivationPath || "").trim(),
        branch: wallet.CHANGE_BRANCH,
        addressIndex: wallet.CHANGE_ADDRESS_INDEX,
        addressType: String(managedAddress.addressType || wallet.ADDRESS_TYPE),
        purpose: "change",
        isActive: true,
        isChange: true,
        metadata:
          managedAddress.metadata && typeof managedAddress.metadata === "object"
            ? managedAddress.metadata
            : {},
        status: "active",
      },
    },
    { upsert: true },
  );

  logger.info("Created dedicated BTC change address", {
    walletId: String(walletRecord._id),
    network,
    branch: wallet.CHANGE_BRANCH,
    addressIndex: wallet.CHANGE_ADDRESS_INDEX,
    address: changeAddress,
  });

  return changeAddress;
}

async function buildPreparedTransfer(network, input, options = {}) {
  assertNativeBtcAsset(input);
  const normalizedNetwork = client.normalizeNetwork(network || input.network);
  const executionParams = normalizeExecutionParams(input);
  const fromAddress = normalizeAddress(input.fromAddress, "source address", normalizedNetwork);
  const toAddress = normalizeAddress(
    input.toAddress || input.destinationAddress,
    "destination address",
    normalizedNetwork,
  );

  if (fromAddress === toAddress) {
    throw AppError.validation("Cannot send BTC to the same wallet address");
  }

  const normalizedAmount = amount.normalizeDisplayAmount(input.amount);
  const recipientAmountBaseUnits = BigInt(amount.toBaseUnits(normalizedAmount));

  if (recipientAmountBaseUnits <= 0n) {
    throw AppError.validation("BTC amount must be greater than 0");
  }

  if (recipientAmountBaseUnits < DUST_THRESHOLD_SATOSHIS) {
    throw AppError.validation(
      `BTC amount must be at least ${amount.fromBaseUnits(DUST_THRESHOLD_SATOSHIS.toString())} BTC`,
    );
  }

  const btcClient = client.getClient(normalizedNetwork);
  const [utxos, feeRateResolution] = await Promise.all([
    btcClient.fetchAddressUtxos(fromAddress),
    resolveFeeRate(normalizedNetwork, executionParams),
  ]);
  const selection = selectUtxos(
    Array.isArray(utxos) ? utxos : [],
    recipientAmountBaseUnits.toString(),
    feeRateResolution.feeRate,
  );
  const changeAddress =
    selection.changeBaseUnits !== "0"
      ? String(options.changeAddress || fromAddress).trim()
      : null;

  if (
    selection.changeBaseUnits !== "0" &&
    (!changeAddress || !wallet.validateAddress(changeAddress, normalizedNetwork))
  ) {
    throw AppError.validation("Unable to resolve a valid BTC change address");
  }

  return {
    executionParams: {
      ...executionParams,
      confirmationTarget: feeRateResolution.confirmationTarget,
      feeRate: String(feeRateResolution.feeRate),
    },
    transferInput: {
      fromAddress,
      toAddress,
      amount: normalizedAmount,
      amountBaseUnits: recipientAmountBaseUnits.toString(),
    },
    selection,
    feeResolution: feeRateResolution,
    networkFeeBaseUnits: selection.networkFeeBaseUnits,
    networkFee: amount.fromBaseUnits(selection.networkFeeBaseUnits),
    preparedTransaction: {
      fromAddress,
      toAddress,
      amount: normalizedAmount,
      amountBaseUnits: recipientAmountBaseUnits.toString(),
      selectedInputCount: selection.inputCount,
      selectedInputAmountBaseUnits: selection.totalInputBaseUnits,
      feeRate: String(feeRateResolution.feeRate),
      feeRateSource: feeRateResolution.source,
      confirmationTarget: feeRateResolution.confirmationTarget,
      estimatedVirtualSize: selection.estimatedVirtualSize,
      outputCount: selection.outputCount,
      recipientOutput: {
        address: toAddress,
        amountBaseUnits: recipientAmountBaseUnits.toString(),
      },
      changeOutput:
        selection.changeBaseUnits !== "0"
          ? {
              address: changeAddress,
              amountBaseUnits: selection.changeBaseUnits,
            }
          : null,
      selectedUtxos: selection.selectedUtxos.map((entry) => ({
        txid: entry.txid,
        vout: entry.vout,
        value: entry.value.toString(),
        blockHeight: Number(entry.status?.block_height || 0) || null,
      })),
    },
  };
}

function buildPsbt(network, prepared, signingAddress, signer) {
  const bitcoinNetwork = wallet.getBitcoinNetwork(network);
  const sourceScript = bitcoin.address.toOutputScript(signingAddress, bitcoinNetwork);
  const psbt = new bitcoin.Psbt({ network: bitcoinNetwork });

  for (const utxo of prepared.selection.selectedUtxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: sourceScript,
        value: utxo.value,
      },
    });
  }

  psbt.addOutput({
    address: prepared.transferInput.toAddress,
    value: BigInt(prepared.transferInput.amountBaseUnits),
  });

  if (prepared.selection.changeBaseUnits !== "0") {
    psbt.addOutput({
      address: signingAddress,
      value: BigInt(prepared.selection.changeBaseUnits),
    });
  }

  for (let index = 0; index < prepared.selection.selectedUtxos.length; index += 1) {
    psbt.signInput(index, signer);
  }

  psbt.finalizeAllInputs();
  return psbt;
}

async function validateDestination(input) {
  const normalizedNetwork = client.normalizeNetwork(input.network);
  const executionParams = normalizeExecutionParams(input);
  const destinationAddress = normalizeAddress(
    input.destinationAddress,
    "destination address",
    normalizedNetwork,
  );
  const sourceAddress = normalizeAddress(input.fromAddress, "source address", normalizedNetwork);

  if (destinationAddress === sourceAddress) {
    throw AppError.validation("Cannot send BTC to the same wallet address");
  }

  return {
    destinationAddress,
    executionParams,
  };
}

async function estimateTransfer(input) {
  try {
    const normalizedNetwork = client.normalizeNetwork(input.network);
    const normalizedFromAddress = normalizeAddress(
      input.fromAddress,
      "source address",
      normalizedNetwork,
    );
    const existingChangeAddress = await resolveDedicatedChangeAddress(
      normalizedNetwork,
      normalizedFromAddress,
      null,
      { persist: false },
    );
    const prepared = await buildPreparedTransfer(normalizedNetwork, input, {
      changeAddress: existingChangeAddress || normalizedFromAddress,
    });

    return {
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      networkFee: prepared.networkFee,
      preparedTransaction: prepared.preparedTransaction,
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to estimate BTC transfer");
  }
}

async function assertPreviewTransferAllowed({
  preview,
}) {
  const amountBaseUnits = BigInt(String(
    preview?.amountBaseUnits ?? preview?.recipientGetsBaseUnits ?? "0",
  ));
  const networkFeeBaseUnits = BigInt(String(preview?.networkFeeBaseUnits ?? "0"));

  if (amountBaseUnits <= 0n) {
    throw AppError.validation("BTC amount must be greater than 0");
  }

  if (amountBaseUnits < DUST_THRESHOLD_SATOSHIS) {
    throw AppError.validation(
      `BTC amount must be at least ${amount.fromBaseUnits(DUST_THRESHOLD_SATOSHIS.toString())} BTC`,
    );
  }

  if (networkFeeBaseUnits <= 0n) {
    throw new AppError("Unable to determine BTC network fee", {
      status: 502,
      errors: {
        reason: "Bitcoin fee estimate returned a zero network fee",
      },
    });
  }
}

async function executeTransfer(input) {
  try {
    const normalizedNetwork = client.normalizeNetwork(input.network);
    const normalizedFromAddress = normalizeAddress(
      input.fromAddress,
      "source address",
      normalizedNetwork,
    );
    const dedicatedChangeAddress = await resolveDedicatedChangeAddress(
      normalizedNetwork,
      normalizedFromAddress,
      input.mnemonic,
      { persist: true },
    );
    const prepared = await buildPreparedTransfer(normalizedNetwork, input, {
      changeAddress: dedicatedChangeAddress || normalizedFromAddress,
    });
    const derived = wallet.deriveWalletFromMnemonic(input.mnemonic, normalizedNetwork);

    if (derived.address !== normalizedFromAddress) {
      throw AppError.conflict("Derived wallet address mismatch");
    }

    const privateKey = derived.childNode?.privateKey
      ? Buffer.from(derived.childNode.privateKey)
      : null;
    if (!privateKey || !privateKey.length) {
      throw AppError.conflict("Derived BTC signing key is unavailable");
    }

    const signer = ECPair.fromPrivateKey(privateKey, {
      network: wallet.getBitcoinNetwork(normalizedNetwork),
    });
    const psbt = buildPsbt(normalizedNetwork, prepared, normalizedFromAddress, signer);
    const extracted = psbt.extractTransaction();
    const rawHex = extracted.toHex();
    const localTxHash = extracted.getId();
    const btcClient = client.getClient(normalizedNetwork);
    const broadcastTxHash = await btcClient.broadcastTransaction(rawHex);
    const txHash = broadcastTxHash || localTxHash;
    const submittedTransaction = await btcClient.fetchTransaction(txHash).catch(() => null);
    const tipHeight =
      submittedTransaction?.status?.confirmed === true
        ? await btcClient.fetchTipHeight().catch(() => 0)
        : 0;
    const chainTimestamp = submittedTransaction?.status?.confirmed
      ? normalizeChainTimestamp(submittedTransaction.status.block_time)
      : undefined;
    const confirmations = computeConfirmations(submittedTransaction || {}, tipHeight);
    const validated = submittedTransaction?.status?.confirmed === true;

    return {
      txHash,
      ledgerIndex:
        submittedTransaction?.status?.confirmed === true
          ? Number(submittedTransaction.status.block_height || 0) || undefined
          : undefined,
      networkFeeBaseUnits: prepared.networkFeeBaseUnits,
      networkFee: prepared.networkFee,
      chainStatus: validated ? "confirmed" : "submitted",
      succeeded: validated,
      validated,
      confirmations,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
      rawRequest: {
        network: normalizedNetwork,
        baseUrl: btcClient.baseUrl,
        transaction: prepared.preparedTransaction,
        executionParams: prepared.executionParams,
      },
      rawResponse: {
        txHash,
        localTxHash,
        virtualSize: extracted.virtualSize(),
        weight: extracted.weight(),
        providerTransaction: serializeValue(submittedTransaction || {}),
      },
      executionParams: prepared.executionParams,
    };
  } catch (error) {
    throw buildRpcError(error, "Failed to submit BTC transfer");
  }
}

async function fetchHistory(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network);
  const address = String(input.address || "").trim();
  const limit = normalizeHistoryLimit(input.limit);

  if (!wallet.validateAddress(address, normalizedNetwork)) {
    logger.warn("Skipping BTC history fetch because the wallet address is invalid", {
      address,
      network: normalizedNetwork,
    });
    return [];
  }

  try {
    const btcClient = client.getClient(normalizedNetwork);
    const tipHeightPromise = btcClient.fetchTipHeight().catch(() => 0);
    const entries = [];
    const seen = new Set();
    let batch = await btcClient.fetchAddressTransactions(address);

    while (Array.isArray(batch) && batch.length && entries.length < limit) {
      for (const entry of batch) {
        const txHash = String(entry?.txid || "").trim();
        if (!txHash || seen.has(txHash)) {
          continue;
        }

        seen.add(txHash);
        entries.push(entry);

        if (entries.length >= limit) {
          break;
        }
      }

      if (!Array.isArray(batch) || batch.length < 25 || entries.length >= limit) {
        break;
      }

      const lastSeenTxId = String(batch[batch.length - 1]?.txid || "").trim();
      if (!lastSeenTxId) {
        break;
      }

      batch = await btcClient.fetchAddressTransactionsChain(address, lastSeenTxId);
    }

    const tipHeight = await tipHeightPromise;

    return entries.slice(0, limit).map((entry) => ({
      ...entry,
      network: normalizedNetwork,
      walletAddress: address,
      tipHeight,
    }));
  } catch (error) {
    logger.warn("Failed to fetch BTC history from provider", {
      address,
      network: normalizedNetwork,
      limit,
      reason: error instanceof Error ? error.message : String(error),
      baseUrl: client.getBaseUrl(normalizedNetwork),
    });
    return [];
  }
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
