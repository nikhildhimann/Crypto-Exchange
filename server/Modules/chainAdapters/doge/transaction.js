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

function ceilDiv(dividend, divisor) {
    return (dividend + divisor - 1n) / divisor;
}

function normalizeConfiguredBaseUnitValue(rawValue, fieldName) {
    try {
        return BigInt(amount.toBaseUnits(String(rawValue ?? "").trim() || "0"));
    } catch (_error) {
        throw AppError.validation(`${fieldName} must be a valid DOGE amount`);
    }
}

const DEFAULT_FEE_PER_KB_DOGE = String(process.env.DOGE_DEFAULT_FEE_PER_KB || "0.01").trim();
const DEFAULT_FEE_PER_KB_KOINU = normalizeConfiguredBaseUnitValue(
    DEFAULT_FEE_PER_KB_DOGE,
    "DOGE_DEFAULT_FEE_PER_KB",
);
const DEFAULT_FEE_RATE_KOINU_PER_BYTE = Number(
    ceilDiv(DEFAULT_FEE_PER_KB_KOINU, 1000n) > 0n
        ? ceilDiv(DEFAULT_FEE_PER_KB_KOINU, 1000n)
        : 1n,
);

const DUST_LIMIT_DOGE = String(process.env.DOGE_DUST_LIMIT || "0.01").trim();
const DUST_THRESHOLD_KOINU = normalizeConfiguredBaseUnitValue(
    DUST_LIMIT_DOGE,
    "DOGE_DUST_LIMIT",
);

const SUPPORTED_EXECUTION_PARAM_KEYS = new Set([
    "confirmationTarget",
    "feeRate",
]);

function normalizeAddress(address, label, network) {
    const normalized = String(address || "").trim();

    if (!wallet.validateAddress(normalized, network)) {
        throw AppError.validation(`Invalid DOGE ${label}`);
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
            `DOGE transfers do not support execution params: ${unsupportedKeys.join(", ")}`,
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

function resolveConfirmationTarget(executionParams = {}) {
    const target = Number(executionParams.confirmationTarget || DEFAULT_CONFIRMATION_TARGET);
    if (!Number.isFinite(target) || target < MIN_CONFIRMATION_TARGET) {
        return DEFAULT_CONFIRMATION_TARGET;
    }

    return Math.min(Math.trunc(target), MAX_CONFIRMATION_TARGET);
}

function resolveFeeRateFromEstimateSmartFee(result = {}, confirmationTarget = DEFAULT_CONFIRMATION_TARGET) {
    const feeRateDogePerKb = String(result?.feerate ?? "").trim();

    if (feeRateDogePerKb) {
        try {
            const feeRateKoinuPerKb = normalizeConfiguredBaseUnitValue(
                feeRateDogePerKb,
                "DOGE smart fee estimate",
            );
            const feeRate = Math.max(
                DEFAULT_FEE_RATE_KOINU_PER_BYTE,
                Number(ceilDiv(feeRateKoinuPerKb, 1000n)),
            );

            return {
                feeRate,
                source: "estimateSmartFee",
                confirmationTarget,
            };
        } catch (_error) {
            // fall back to the configured floor below
        }
    }

    return {
        feeRate: DEFAULT_FEE_RATE_KOINU_PER_BYTE,
        source: "default",
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
        const estimate = await client.getClient(network).estimateSmartFee(confirmationTarget);
        return resolveFeeRateFromEstimateSmartFee(estimate, confirmationTarget);
    } catch (error) {
        return {
            feeRate: DEFAULT_FEE_RATE_KOINU_PER_BYTE,
            source: "default",
            confirmationTarget,
            warning: error instanceof Error ? error.message : String(error),
        };
    }
}

function estimateVirtualSize(inputCount, outputCount) {
    return 10 + inputCount * 148 + outputCount * 34;
}

function dogeAmountToBaseUnits(value) {
    return BigInt(amount.toBaseUnits(String(value ?? "0")));
}

function isSpendableUtxo(entry = {}) {
    const txid = String(entry.txid || "").trim();
    const hasValidTxid = /^[a-fA-F0-9]{64}$/.test(txid);
    const vout = Number(entry.vout);
    const hasValidVout = Number.isInteger(vout) && vout >= 0;
    const confirmations = Number(entry.confirmations || 0);
    const value = dogeAmountToBaseUnits(entry.amount);

    return hasValidTxid && hasValidVout && confirmations > 0 && value > 0n;
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
            value: dogeAmountToBaseUnits(entry.amount),
            amount: String(entry.amount ?? "0"),
            address: String(entry.address || "").trim(),
            confirmations: Number(entry.confirmations || 0),
            spendable: entry.spendable !== false,
            solvable: entry.solvable !== false,
            safe: entry.safe !== false,
        }))
        .filter((entry) => entry.spendable !== false && entry.solvable !== false)
        .sort((a, b) => {
            if (a.value !== b.value) {
                return a.value < b.value ? -1 : 1;
            }

            if (a.confirmations !== b.confirmations) {
                return b.confirmations - a.confirmations;
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
        logger.warn("DOGE UTXO selection failed because no confirmed spendable inputs were found", {
            feeRate,
        });
        throw AppError.validation("No confirmed DOGE UTXOs are available for this wallet");
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

        if (tentativeChange >= DUST_THRESHOLD_KOINU) {
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

        const feeWithoutChange = BigInt(
            estimateVirtualSize(selectedUtxos.length, 1) * feeRate,
        );
        const requiredWithoutChange = targetAmount + feeWithoutChange;

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

    logger.warn("DOGE UTXO selection failed due to insufficient confirmed balance after fee calculation", {
        feeRate,
        targetAmountBaseUnits: targetAmount.toString(),
        availableUtxoCount: availableUtxos.length,
        totalAvailableBaseUnits: availableUtxos.reduce((sum, utxo) => sum + utxo.value, 0n).toString(),
    });

    throw AppError.validation("Insufficient DOGE balance to cover the amount and network fee");
}

function normalizeChainTimestamp(value) {
    if (!value && value !== 0) {
        return undefined;
    }

    const timestamp = new Date(Number(value) * 1000);
    return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
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

function extractErrorMessage(error, fallback = "Dogecoin request failed") {
    const candidates = [
        error?.response?.data?.error?.message,
        error?.response?.data?.message,
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

function isAlreadyImportedError(error) {
    const reason = extractErrorMessage(error).toLowerCase();

    return (
        reason.includes("already") ||
        reason.includes("exists") ||
        reason.includes("watch-only") ||
        reason.includes("wallet already contains")
    );
}

function assertImportedAddressState(address, validation = {}) {
    const isValid = validation?.isvalid !== false;
    const hasWalletOwnershipFlags =
        typeof validation?.iswatchonly === "boolean" ||
        typeof validation?.ismine === "boolean";
    const recognizedByWallet =
        validation?.iswatchonly === true ||
        validation?.ismine === true;

    if (!isValid) {
        throw new AppError("DOGE change address failed validation after import", {
            status: 502,
            errors: {
                address,
                validation,
            },
        });
    }

    if (hasWalletOwnershipFlags && !recognizedByWallet) {
        throw new AppError("DOGE change address was not registered in the node wallet", {
            status: 502,
            errors: {
                address,
                validation,
            },
        });
    }
}

async function ensureImportedWalletAddress(network, address, label, rescan = false) {
    const rpc = client.getClient(network);

    try {
        await rpc.importAddress(address, label, rescan);
    } catch (error) {
        if (!isAlreadyImportedError(error)) {
            throw error;
        }
    }

    const validation = await rpc.validateAddress(address);
    assertImportedAddressState(address, validation);

    return validation;
}

function buildRpcError(error, fallbackMessage) {
    if (client.isWalletRpcUnavailableError(error)) {
        return new AppError(
            "Dogecoin Core node does not expose the wallet RPC methods required for this operation",
            {
                status: 502,
                errors: {
                    ...(error?.errors && typeof error.errors === "object" ? error.errors : {}),
                    reason: extractErrorMessage(error, fallbackMessage),
                },
            },
        );
    }

    if (error instanceof AppError) {
        return error;
    }

    const reason = extractErrorMessage(error, fallbackMessage);
    const normalizedReason = reason.toLowerCase();

    if (
        normalizedReason.includes("insufficient") ||
        normalizedReason.includes("not enough")
    ) {
        return AppError.validation("Insufficient DOGE balance to cover the amount and network fee");
    }

    if (
        normalizedReason.includes("address") &&
        normalizedReason.includes("invalid")
    ) {
        return AppError.validation("Invalid DOGE destination address");
    }

    if (
        normalizedReason.includes("missing inputs") ||
        normalizedReason.includes("inputs missing")
    ) {
        return AppError.conflict("The selected DOGE inputs are no longer available. Please try again");
    }

    if (
        normalizedReason.includes("mempool") ||
        normalizedReason.includes("too-long-mempool-chain")
    ) {
        return AppError.conflict("This DOGE wallet already has too many chained pending transactions");
    }

    if (
        normalizedReason.includes("network") ||
        normalizedReason.includes("timeout") ||
        normalizedReason.includes("fetch") ||
        normalizedReason.includes("http")
    ) {
        return new AppError("Dogecoin Core node RPC is currently unavailable", {
            status: 502,
            errors: { reason },
        });
    }

    return new AppError(fallbackMessage, {
        status: 502,
        errors: { reason },
    });
}

function assertNativeDogeAsset(input = {}) {
    const asset = String(input.asset || input.assetDescriptor?.asset || "DOGE").trim().toUpperCase();
    const assetType = String(input.assetDescriptor?.assetType || "native").trim().toLowerCase();

    if (asset !== "DOGE" || assetType !== "native") {
        throw AppError.validation("DOGE adapter only supports native DOGE transfers");
    }
}

async function resolveOwnerWallet(network, fromAddress) {
    if (mongoose.connection.readyState !== 1) {
        return null;
    }

    return Wallet.findOne({
        chain: "doge",
        network,
        address: fromAddress,
    }).select("_id userId accountId chain network address").lean();
}

async function findExistingChangeAddress(walletRecord, network) {
    if (mongoose.connection.readyState !== 1 || !walletRecord?._id) {
        return null;
    }

    return WalletAddress.findOne({
        walletId: walletRecord._id,
        chain: "doge",
        network,
        branch: wallet.CHANGE_BRANCH,
        addressIndex: wallet.CHANGE_ADDRESS_INDEX,
        isActive: true,
    }).lean();
}

function buildChangeWatchLabel(walletRecord, network) {
    return [
        "wallet",
        String(walletRecord?._id || "").trim(),
        "doge",
        network,
        "change",
        `b${wallet.CHANGE_BRANCH}`,
        `i${wallet.CHANGE_ADDRESS_INDEX}`,
    ]
        .filter(Boolean)
        .join(":");
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
        throw AppError.internal("Failed to derive DOGE change address");
    }

    await WalletAddress.updateOne(
        {
            walletId: walletRecord._id,
            chain: "doge",
            network,
            branch: wallet.CHANGE_BRANCH,
            addressIndex: wallet.CHANGE_ADDRESS_INDEX,
        },
        {
            $set: {
                walletId: walletRecord._id,
                userId: walletRecord.userId,
                chain: "doge",
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

    logger.info("Created dedicated DOGE change address", {
        walletId: String(walletRecord._id),
        network,
        branch: wallet.CHANGE_BRANCH,
        addressIndex: wallet.CHANGE_ADDRESS_INDEX,
        address: changeAddress,
    });

    await ensureImportedWalletAddress(
        network,
        changeAddress,
        buildChangeWatchLabel(walletRecord, network),
        false,
    );

    return changeAddress;
}

async function resolveSpendableAddresses(network, fromAddress) {
    const normalizedFromAddress = normalizeAddress(fromAddress, "source address", network);

    if (mongoose.connection.readyState !== 1) {
        return [normalizedFromAddress];
    }

    const walletRecord = await resolveOwnerWallet(network, normalizedFromAddress);
    if (!walletRecord?._id) {
        return [normalizedFromAddress];
    }

    const managedAddresses = await WalletAddress.find({
        walletId: walletRecord._id,
        chain: "doge",
        network,
        isActive: true,
    })
        .select("address")
        .lean();

    const addressSet = new Set([normalizedFromAddress]);

    for (const entry of managedAddresses) {
        const address = String(entry?.address || "").trim();
        if (address) {
            addressSet.add(address);
        }
    }

    return Array.from(addressSet);
}

async function loadManagedAddressMap(network, fromAddress) {
    const normalizedFromAddress = normalizeAddress(fromAddress, "source address", network);
    const defaultRecord = {
        address: normalizedFromAddress,
        branch: wallet.EXTERNAL_BRANCH,
        addressIndex: wallet.RECEIVE_ADDRESS_INDEX,
        derivationPath: wallet.getReceiveDerivationPath(network),
        purpose: "receive",
        isChange: false,
    };

    if (mongoose.connection.readyState !== 1) {
        return new Map([[normalizedFromAddress, defaultRecord]]);
    }

    const walletRecord = await resolveOwnerWallet(network, normalizedFromAddress);
    if (!walletRecord?._id) {
        return new Map([[normalizedFromAddress, defaultRecord]]);
    }

    const managedAddresses = await WalletAddress.find({
        walletId: walletRecord._id,
        chain: "doge",
        network,
        isActive: true,
    })
        .select("address branch addressIndex derivationPath purpose isChange")
        .lean();

    const map = new Map([[normalizedFromAddress, defaultRecord]]);

    for (const entry of managedAddresses) {
        const address = String(entry?.address || "").trim();
        if (!address) {
            continue;
        }

        map.set(address, {
            address,
            branch: Number.isFinite(Number(entry.branch)) ? Number(entry.branch) : 0,
            addressIndex: Number.isFinite(Number(entry.addressIndex)) ? Number(entry.addressIndex) : 0,
            derivationPath: String(entry.derivationPath || "").trim(),
            purpose: String(entry.purpose || "").trim() || "receive",
            isChange: entry.isChange === true,
        });
    }

    return map;
}

function normalizeOwnedAddressSet(addresses = []) {
    const values = new Set();

    for (const entry of addresses) {
        const normalized = String(entry || "").trim().toLowerCase();
        if (normalized) {
            values.add(normalized);
        }
    }

    return values;
}

function extractHistoryOutputAddress(output = {}) {
    const direct =
        String(output?.scriptpubkey_address || "").trim() ||
        String(output?.scriptPubKey?.address || "").trim();

    if (direct) {
        return direct;
    }

    if (Array.isArray(output?.scriptPubKey?.addresses)) {
        return String(output.scriptPubKey.addresses[0] || "").trim();
    }

    return "";
}

function extractHistoryPrevoutAddress(input = {}) {
    return String(
        input?.prevout?.scriptpubkey_address ||
        input?.prevout?.scriptPubKey?.address ||
        input?.prevout?.scriptPubKey?.addresses?.[0] ||
        "",
    ).trim();
}

function normalizeHistoryValueBaseUnits(output = {}) {
    if (output?.valueSat !== undefined && output?.valueSat !== null) {
        return String(output.valueSat).trim();
    }

    if (output?.value !== undefined && output?.value !== null) {
        return amount.toBaseUnits(String(output.value));
    }

    return "0";
}

async function enrichRawTransactionInputs(rpc, rawTx, previousTransactionCache) {
    const inputs = Array.isArray(rawTx?.vin) ? rawTx.vin : [];
    if (!inputs.length) {
        return rawTx;
    }

    const enrichedInputs = await Promise.all(
        inputs.map(async (input) => {
            const previousTxHash = String(input?.txid || "").trim();
            const previousOutputIndex = Number(input?.vout);

            if (!previousTxHash || !Number.isInteger(previousOutputIndex) || previousOutputIndex < 0) {
                return input;
            }

            let previousTransactionPromise = previousTransactionCache.get(previousTxHash);
            if (!previousTransactionPromise) {
                previousTransactionPromise = rpc.getRawTransaction(previousTxHash, true).catch(() => null);
                previousTransactionCache.set(previousTxHash, previousTransactionPromise);
            }

            const previousTransaction = await previousTransactionPromise;
            const previousOutputs = Array.isArray(previousTransaction?.vout)
                ? previousTransaction.vout
                : [];
            const previousOutput = previousOutputs[previousOutputIndex];

            if (!previousOutput || typeof previousOutput !== "object") {
                return input;
            }

            const previousOutputAddress = extractHistoryOutputAddress(previousOutput);
            const previousOutputValueBaseUnits = normalizeHistoryValueBaseUnits(previousOutput);

            return {
                ...input,
                prevout: {
                    ...(input?.prevout && typeof input.prevout === "object" ? input.prevout : {}),
                    scriptpubkey_address: previousOutputAddress,
                    scriptPubKey: {
                        ...(
                            input?.prevout?.scriptPubKey && typeof input.prevout.scriptPubKey === "object"
                                ? input.prevout.scriptPubKey
                                : {}
                        ),
                        ...(previousOutputAddress
                            ? {
                                address: previousOutputAddress,
                                addresses: [previousOutputAddress],
                            }
                            : {}),
                    },
                    value: previousOutput?.value,
                    valueSat: previousOutputValueBaseUnits,
                },
            };
        }),
    );

    return {
        ...rawTx,
        vin: enrichedInputs,
    };
}

function resolveHistoryOwnership(rawTx, ownedAddressSet) {
    const inputs = Array.isArray(rawTx?.vin) ? rawTx.vin : [];
    const outputs = Array.isArray(rawTx?.vout) ? rawTx.vout : [];

    const inputMatches = inputs.some((input) =>
        ownedAddressSet.has(extractHistoryPrevoutAddress(input).toLowerCase()),
    );
    const outputMatches = outputs.some((output) =>
        ownedAddressSet.has(extractHistoryOutputAddress(output).toLowerCase()),
    );

    return {
        inputMatches,
        outputMatches,
        touchesWallet: inputMatches || outputMatches,
    };
}

function isOutgoingHistoryItem(item = {}) {
    return String(item?.category || "").trim().toLowerCase() === "send";
}

function isIncomingHistoryItem(item = {}) {
    return ["receive", "generate", "immature"].includes(
        String(item?.category || "").trim().toLowerCase(),
    );
}

function selectWalletHistoryItem(items, ownership, ownedAddressSet) {
    const entries = Array.isArray(items) ? items : [];
    const entriesWithOwnedAddress = entries.filter((item) =>
        ownedAddressSet.has(String(item?.address || "").trim().toLowerCase()),
    );

    if (ownership.inputMatches) {
        return (
            entries.find((item) => isOutgoingHistoryItem(item)) ||
            entriesWithOwnedAddress.find((item) => isOutgoingHistoryItem(item)) ||
            entries[0] ||
            null
        );
    }

    if (ownership.outputMatches) {
        return (
            entriesWithOwnedAddress.find((item) => isIncomingHistoryItem(item)) ||
            entries.find((item) => isIncomingHistoryItem(item)) ||
            entriesWithOwnedAddress[0] ||
            entries[0] ||
            null
        );
    }

    return null;
}

async function buildPreparedTransfer(network, input, options = {}) {
    assertNativeDogeAsset(input);

    const normalizedNetwork = client.normalizeNetwork(network || input.network);
    const executionParams = normalizeExecutionParams(input);
    const fromAddress = normalizeAddress(input.fromAddress, "source address", normalizedNetwork);
    const toAddress = normalizeAddress(
        input.toAddress || input.destinationAddress,
        "destination address",
        normalizedNetwork,
    );

    if (fromAddress === toAddress) {
        throw AppError.validation("Cannot send DOGE to the same wallet address");
    }

    const normalizedAmount = amount.normalizeDisplayAmount(input.amount);
    const recipientAmountBaseUnits = BigInt(amount.toBaseUnits(normalizedAmount));

    if (recipientAmountBaseUnits <= 0n) {
        throw AppError.validation("DOGE amount must be greater than 0");
    }

    if (recipientAmountBaseUnits < DUST_THRESHOLD_KOINU) {
        throw AppError.validation(
            `DOGE amount must be at least ${amount.fromBaseUnits(DUST_THRESHOLD_KOINU.toString())} DOGE`,
        );
    }

    const rpc = client.getClient(normalizedNetwork);
    const [spendableAddresses, feeRateResolution] = await Promise.all([
        resolveSpendableAddresses(normalizedNetwork, fromAddress),
        resolveFeeRate(normalizedNetwork, executionParams),
    ]);

    const utxos = await rpc.listUnspent(1, 9999999, spendableAddresses);
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
        throw AppError.validation("Unable to resolve a valid DOGE change address");
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
                address: entry.address,
                confirmations: entry.confirmations,
            })),
        },
    };
}

async function buildPsbt(network, prepared, signerMap) {
    const dogeNetwork = wallet.getDogeNetwork(network);
    const rpc = client.getClient(network);
    const psbt = new bitcoin.Psbt({ network: dogeNetwork });

    for (const utxo of prepared.selection.selectedUtxos) {
        const prevTxHex = await rpc.getRawTransaction(utxo.txid, false);

        if (!prevTxHex || typeof prevTxHex !== "string") {
            throw new AppError("Unable to load DOGE input transaction", {
                status: 502,
                errors: { txid: utxo.txid },
            });
        }

        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            nonWitnessUtxo: Buffer.from(prevTxHex, "hex"),
        });
    }

    psbt.addOutput({
        address: prepared.transferInput.toAddress,
        value: BigInt(prepared.transferInput.amountBaseUnits),
    });

    if (prepared.selection.changeBaseUnits !== "0") {
        psbt.addOutput({
            address: prepared.preparedTransaction.changeOutput.address,
            value: BigInt(prepared.selection.changeBaseUnits),
        });
    }

    for (let index = 0; index < prepared.selection.selectedUtxos.length; index += 1) {
        const utxo = prepared.selection.selectedUtxos[index];
        const signer = signerMap.get(String(utxo.address || "").trim());

        if (!signer) {
            throw AppError.conflict(`Unable to resolve DOGE signing key for input address ${utxo.address}`);
        }

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
        throw AppError.validation("Cannot send DOGE to the same wallet address");
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
        throw buildRpcError(error, "Failed to estimate DOGE transfer");
    }
}

async function assertPreviewTransferAllowed({ preview }) {
    const amountBaseUnits = BigInt(String(
        preview?.amountBaseUnits ?? preview?.recipientGetsBaseUnits ?? "0",
    ));
    const networkFeeBaseUnits = BigInt(String(preview?.networkFeeBaseUnits ?? "0"));

    if (amountBaseUnits <= 0n) {
        throw AppError.validation("DOGE amount must be greater than 0");
    }

    if (amountBaseUnits < DUST_THRESHOLD_KOINU) {
        throw AppError.validation(
            `DOGE amount must be at least ${amount.fromBaseUnits(DUST_THRESHOLD_KOINU.toString())} DOGE`,
        );
    }

    if (networkFeeBaseUnits <= 0n) {
        throw new AppError("Unable to determine DOGE network fee", {
            status: 502,
            errors: {
                reason: "Dogecoin fee estimate returned a zero network fee",
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

        const managedAddressMap = await loadManagedAddressMap(normalizedNetwork, normalizedFromAddress);
        const signerMap = new Map();

        for (const utxo of prepared.selection.selectedUtxos) {
            const utxoAddress = String(utxo.address || "").trim();
            if (!utxoAddress) {
                throw AppError.conflict(`Unable to resolve DOGE source address for input ${utxo.txid}:${utxo.vout}`);
            }

            if (signerMap.has(utxoAddress)) {
                continue;
            }

            const managedAddress =
                managedAddressMap.get(utxoAddress) ||
                (utxoAddress === normalizedFromAddress
                    ? {
                        branch: wallet.EXTERNAL_BRANCH,
                        addressIndex: wallet.RECEIVE_ADDRESS_INDEX,
                    }
                    : null);

            if (!managedAddress) {
                throw AppError.conflict(`Managed DOGE address metadata not found for ${utxoAddress}`);
            }

            const derived = wallet.deriveManagedAddressFromMnemonic(input.mnemonic, normalizedNetwork, {
                branch: Number(managedAddress.branch || 0),
                addressIndex: Number(managedAddress.addressIndex || 0),
                purpose: managedAddress.purpose || (managedAddress.isChange ? "change" : "receive"),
                isChange: managedAddress.isChange === true,
            });

            if (String(derived.address).trim() !== utxoAddress) {
                throw AppError.conflict(`Derived DOGE address mismatch for signer ${utxoAddress}`);
            }

            const privateKey = derived.childNode?.privateKey
                ? Buffer.from(derived.childNode.privateKey)
                : null;

            if (!privateKey || !privateKey.length) {
                throw AppError.conflict(`Derived DOGE signing key is unavailable for ${utxoAddress}`);
            }

            const signer = ECPair.fromPrivateKey(privateKey, {
                network: wallet.getDogeNetwork(normalizedNetwork),
            });

            signerMap.set(utxoAddress, signer);
        }

        const psbt = await buildPsbt(normalizedNetwork, prepared, signerMap);
        const extracted = psbt.extractTransaction();
        const rawHex = extracted.toHex();
        const localTxHash = extracted.getId();

        const rpc = client.getClient(normalizedNetwork);
        const broadcastTxHash = await rpc.sendRawTransaction(rawHex);
        const txHash = broadcastTxHash || localTxHash;
        const submittedTransaction = await rpc.getRawTransaction(txHash, true).catch(() => null);

        const confirmations = Number(submittedTransaction?.confirmations || 0);
        const validated = confirmations > 0;
        const chainTimestamp = normalizeChainTimestamp(
            submittedTransaction?.blocktime || submittedTransaction?.time,
        );

        return {
            txHash,
            ledgerIndex:
                validated
                    ? Number(submittedTransaction?.blockhash ? confirmations : 0) || undefined
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
        throw buildRpcError(error, "Failed to submit DOGE transfer");
    }
}

async function fetchHistory(input = {}) {
    const normalizedNetwork = client.normalizeNetwork(input.network);
    const address = String(input.address || "").trim();
    const limit = normalizeHistoryLimit(input.limit);

    if (!wallet.validateAddress(address, normalizedNetwork)) {
        logger.warn("Skipping DOGE history fetch because the wallet address is invalid", {
            address,
            network: normalizedNetwork,
        });
        return [];
    }

    try {
        const rpc = client.getClient(normalizedNetwork);
        const seen = new Set();
        const entries = [];
        const previousTransactionCache = new Map();
        const managedAddressMap = await loadManagedAddressMap(normalizedNetwork, address);
        const walletAddresses = Array.from(managedAddressMap.keys());
        const ownedAddressSet = normalizeOwnedAddressSet(walletAddresses);
        let skip = 0;
        const pageSize = Math.min(limit * 2, 100);

        while (entries.length < limit) {
            const batch = await rpc.listTransactions("*", pageSize, skip, true);

            if (!Array.isArray(batch) || !batch.length) {
                break;
            }

            const groupedByTransactionHash = new Map();

            for (const item of batch) {
                const txHash = String(item?.txid || "").trim();
                if (!txHash || seen.has(txHash)) {
                    continue;
                }

                const group = groupedByTransactionHash.get(txHash) || [];
                group.push(item);
                groupedByTransactionHash.set(txHash, group);
            }

            for (const [txHash, items] of groupedByTransactionHash.entries()) {
                const rawTx = await rpc.getRawTransaction(txHash, true).catch(() => null);
                const enrichedRawTx =
                    rawTx && typeof rawTx === "object"
                        ? await enrichRawTransactionInputs(rpc, rawTx, previousTransactionCache)
                        : null;
                const ownership = resolveHistoryOwnership(enrichedRawTx || {}, ownedAddressSet);
                const walletTransaction = selectWalletHistoryItem(items, ownership, ownedAddressSet);

                if (!ownership.touchesWallet && !walletTransaction) {
                    continue;
                }

                seen.add(txHash);

                entries.push({
                    ...(enrichedRawTx && typeof enrichedRawTx === "object" ? enrichedRawTx : {}),
                    txid: txHash,
                    network: normalizedNetwork,
                    walletAddress: address,
                    walletAddresses,
                    walletTransaction,
                    confirmations: Number(
                        enrichedRawTx?.confirmations ?? walletTransaction?.confirmations ?? 0,
                    ),
                    time: enrichedRawTx?.time ?? walletTransaction?.time ?? null,
                    timereceived:
                        enrichedRawTx?.timereceived ??
                        walletTransaction?.timereceived ??
                        walletTransaction?.time ??
                        null,
                    category: walletTransaction?.category || null,
                    address: String(walletTransaction?.address || "").trim(),
                    amount: walletTransaction?.amount,
                    fee: walletTransaction?.fee,
                });

                if (entries.length >= limit) {
                    break;
                }
            }

            if (batch.length < pageSize) {
                break;
            }

            skip += batch.length;
        }

        return entries.slice(0, limit);
    } catch (error) {
        logger.error("Failed to fetch DOGE history from Dogecoin Core wallet RPC", {
            address,
            network: normalizedNetwork,
            limit,
            reason: error instanceof Error ? error.message : String(error),
        });
        throw buildRpcError(error, "Failed to fetch DOGE transaction history");
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
