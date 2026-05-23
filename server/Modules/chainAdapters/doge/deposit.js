const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const transaction = require("./transaction");
const amount = require("./amount");
const wallet = require("./wallet");
const client = require("./client");
const { AppError } = require("../../../helpers/errors");

const MAINNET_NETWORK = "mainnet";

function normalizeAddress(address, network) {
    const normalized = String(address || "").trim();

    if (!wallet.validateAddress(normalized, network)) {
        throw AppError.validation("DOGE deposit address is invalid");
    }

    return normalized;
}

function normalizeConfirmations(entry = {}) {
    const parsed = Number.parseInt(String(entry.confirmations ?? "0").trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeTimestamp(value) {
    if (!value && value !== 0) {
        return null;
    }

    const timestamp = new Date(Number(value) * 1000);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function buildCanonicalDepositEntry(rawTx, output, targetAddress) {
    const txHash = String(rawTx?.txid || "").trim();
    const vout = Number(output?.n);
    const amountBaseUnits = String(output?.value ?? "0").trim();

    const confirmations = normalizeConfirmations({
        confirmations: rawTx?.confirmations ?? 0,
    });

    if (!txHash || !Number.isInteger(vout) || vout < 0 || !/^\d+$/.test(amountBaseUnits)) {
        return null;
    }

    if (BigInt(amountBaseUnits) <= 0n) {
        return null;
    }

    const firstInputAddress =
        String(
            rawTx?.vin?.find((entry) => entry?.prevout?.scriptPubKey?.addresses?.[0])
                ?.prevout?.scriptPubKey?.addresses?.[0] ||
            rawTx?.vin?.find((entry) => entry?.prevout?.scriptpubkey_address)
                ?.prevout?.scriptpubkey_address ||
            "",
        ).trim() || "";

    return {
        hash: txHash,
        txHash,
        vout,
        amount: amount.fromBaseUnits(amountBaseUnits),
        amountBaseUnits,
        confirmations,
        fromAddress: firstInputAddress,
        toAddress: String(targetAddress || "").trim(),
        chainStatus: confirmations > 0 ? "confirmed" : "pending",
        succeeded: confirmations > 0,
        validated: confirmations > 0,
        chainTimestamp: normalizeTimestamp(
            rawTx?.blocktime ?? rawTx?.time ?? rawTx?.timereceived,
        ),
        rawEntry: rawTx,
    };
}

function extractOutputAddress(output = {}) {
    const direct =
        String(output?.scriptpubkey_address || "").trim() ||
        String(output?.scriptPubKey?.address || "").trim();

    if (direct) {
        return direct;
    }

    const addresses = Array.isArray(output?.scriptPubKey?.addresses)
        ? output.scriptPubKey.addresses
        : [];

    const first = String(addresses[0] || "").trim();
    return first || "";
}

function extractOutputValueBaseUnits(output = {}) {
    if (output?.value !== undefined && output?.value !== null) {
        const value = output.value;

        if (typeof value === "string" && /^\d+$/.test(value.trim())) {
            return value.trim();
        }

        if (typeof value === "number" && Number.isFinite(value)) {
            return amount.toBaseUnits(String(value));
        }
    }

    if (output?.valueSat !== undefined && output?.valueSat !== null) {
        return String(output.valueSat).trim();
    }

    return "0";
}

function extractInputAddress(input = {}) {
    return String(
        input?.prevout?.scriptPubKey?.addresses?.[0] ||
        input?.prevout?.scriptPubKey?.address ||
        input?.prevout?.scriptpubkey_address ||
        "",
    ).trim();
}

function buildOwnedAddressSet(entry = {}, fallbackAddress = "") {
    const values = new Set();

    for (const candidate of [
        fallbackAddress,
        ...(Array.isArray(entry?.walletAddresses) ? entry.walletAddresses : []),
        entry?.walletAddress,
    ]) {
        const normalized = String(candidate || "").trim().toLowerCase();
        if (normalized) {
            values.add(normalized);
        }
    }

    return values;
}

function extractErrorReason(error) {
    return String(
        error?.errors?.reason ||
        error?.response?.data?.error?.message ||
        error?.message ||
        "Dogecoin Core wallet RPC request failed",
    ).trim();
}

function isAlreadyImportedError(error) {
    const reason = extractErrorReason(error).toLowerCase();

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
        throw new AppError("DOGE watch address failed validation after import", {
            status: 502,
            errors: {
                address,
                validation,
            },
        });
    }

    if (hasWalletOwnershipFlags && !recognizedByWallet) {
        throw new AppError("DOGE watch address was not registered in the node wallet", {
            status: 502,
            errors: {
                address,
                validation,
            },
        });
    }

    return {
        isValid,
        isWatchOnly: validation?.iswatchonly === true,
        isMine: validation?.ismine === true,
    };
}

function transactionSpendsFromWallet(entry = {}, ownedAddressSet) {
    const category = String(entry?.walletTransaction?.category || entry?.category || "").trim().toLowerCase();
    if (category === "send") {
        return true;
    }

    return (Array.isArray(entry?.vin) ? entry.vin : []).some((input) =>
        ownedAddressSet.has(extractInputAddress(input).toLowerCase()),
    );
}

async function watchDeposits(input) {
    const network = client.normalizeNetwork(input?.network || MAINNET_NETWORK);
    const targetAddress = normalizeAddress(input?.address, network);
    const entries = await transaction.fetchHistory({
        network,
        address: targetAddress,
        limit: input?.limit || 50,
    });

    const seen = new Set();

    return entries
        .flatMap((entry) =>
            (Array.isArray(entry?.vout) ? entry.vout : [])
                .map((output, index) => {
                    const outputAddress = extractOutputAddress(output);
                    const ownedAddressSet = buildOwnedAddressSet(entry, targetAddress);
                    const spendsFromWallet = transactionSpendsFromWallet(entry, ownedAddressSet);

                    if (!ownedAddressSet.has(outputAddress.toLowerCase())) {
                        return null;
                    }

                    if (spendsFromWallet) {
                        return null;
                    }

                    const normalizedOutput = {
                        ...output,
                        n: output?.n ?? index,
                        value: extractOutputValueBaseUnits(output),
                    };

                    return buildCanonicalDepositEntry(entry, normalizedOutput, outputAddress);
                })
                .filter(Boolean),
        )
        .filter((entry) => {
            const identity = `${entry.txHash}:${entry.vout}`;
            if (seen.has(identity)) {
                return false;
            }

            seen.add(identity);
            return true;
        });
}

async function matchDepositToWallet(depositEntry, network = MAINNET_NETWORK) {
    const normalizedNetwork = client.normalizeNetwork(network);

    const destinationAddress = normalizeAddress(
        depositEntry?.toAddress ||
        depositEntry?.address ||
        extractOutputAddress(
            depositEntry?.rawEntry?.vout?.[depositEntry?.vout || 0] || {},
        ),
        normalizedNetwork,
    );

    const managedAddress = await WalletAddress.findOne({
        chain: "doge",
        network: normalizedNetwork,
        address: destinationAddress,
        isActive: true,
    }).lean();

    if (managedAddress?.walletId) {
        const matchedWallet = await Wallet.findOne({
            _id: managedAddress.walletId,
            chain: "doge",
            network: normalizedNetwork,
        }).lean();

        if (matchedWallet) {
            return {
                walletId: matchedWallet._id,
                accountId: matchedWallet.accountId,
                userId: matchedWallet.userId,
                matchedBy: "managedAddress",
                destinationAddress,
            };
        }
    }

    const matchedWallet = await Wallet.findOne({
        chain: "doge",
        network: normalizedNetwork,
        address: destinationAddress,
    }).lean();

    if (!matchedWallet) {
        return null;
    }

    return {
        walletId: matchedWallet._id,
        accountId: matchedWallet.accountId,
        userId: matchedWallet.userId,
        matchedBy: "address",
        destinationAddress,
    };
}

async function registerWatchAddress({
    network = MAINNET_NETWORK,
    address,
    label = "",
    rescan = false,
}) {
    const normalizedNetwork = client.normalizeNetwork(network);
    const normalizedAddress = normalizeAddress(address, normalizedNetwork);
    const rpc = client.getClient(normalizedNetwork);
    let alreadyRegistered = false;

    try {
        await rpc.importAddress(normalizedAddress, label, rescan);
    } catch (error) {
        if (!isAlreadyImportedError(error)) {
            throw error;
        }

        alreadyRegistered = true;
    }

    const validation = await rpc.validateAddress(normalizedAddress);
    const registration = assertImportedAddressState(normalizedAddress, validation);

    return {
        success: true,
        network: normalizedNetwork,
        address: normalizedAddress,
        label,
        rescan,
        alreadyRegistered,
        ...registration,
    };
}

module.exports = {
    watchDeposits,
    matchDepositToWallet,
    registerWatchAddress,
};
