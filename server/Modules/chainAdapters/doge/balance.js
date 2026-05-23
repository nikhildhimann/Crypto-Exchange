const mongoose = require("mongoose");

const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const client = require("./client");
const wallet = require("./wallet");
const amount = require("./amount");
const logger = require("../../../common/utils/logger");
const { AppError } = require("../../../helpers/errors");

function buildCanonicalBalance({
    baseUnitBalance = "0",
    availableBaseUnits = "0",
    rentExemptMinimumBaseUnits = "0",
    exists = false,
    confirmed = false,
    raw = {},
} = {}) {
    return {
        baseUnitBalance: String(baseUnitBalance),
        availableBaseUnits: String(availableBaseUnits),
        rentExemptMinimumBaseUnits: String(rentExemptMinimumBaseUnits),
        exists: Boolean(exists),
        confirmed: Boolean(confirmed),
        raw: raw && typeof raw === "object" ? raw : {},
    };
}

function normalizeBaseUnits(value) {
    const normalized =
        typeof value === "bigint"
            ? value.toString()
            : String(value ?? "0").trim();

    if (!/^\d+$/.test(normalized)) {
        return 0n;
    }

    return BigInt(normalized);
}

function dogeToBaseUnits(value) {
    try {
        return BigInt(amount.toBaseUnits(String(value ?? "0")));
    } catch (_error) {
        return 0n;
    }
}

async function resolveOwnerWallet(network, address) {
    if (mongoose.connection.readyState !== 1) {
        return null;
    }

    return Wallet.findOne({
        chain: "doge",
        network,
        address,
    })
        .select("_id address")
        .lean();
}

async function resolveManagedAddresses(network, address) {
    const normalizedAddress = String(address || "").trim();
    const addressSet = new Set(normalizedAddress ? [normalizedAddress] : []);

    if (mongoose.connection.readyState !== 1) {
        return {
            addresses: Array.from(addressSet),
            walletResolved: false,
            databaseAvailable: false,
        };
    }

    try {
        const walletRecord = await resolveOwnerWallet(network, normalizedAddress);
        if (!walletRecord?._id) {
            return {
                addresses: Array.from(addressSet),
                walletResolved: false,
                databaseAvailable: true,
            };
        }

        const managedAddresses = await WalletAddress.find({
            walletId: walletRecord._id,
            chain: "doge",
            network,
            isActive: true,
        })
            .select("address")
            .lean();

        for (const entry of managedAddresses) {
            const managedAddress = String(entry?.address || "").trim();
            if (managedAddress) {
                addressSet.add(managedAddress);
            }
        }

        return {
            addresses: Array.from(addressSet),
            walletResolved: true,
            databaseAvailable: true,
        };
    } catch (error) {
        logger.warn("DOGE balance fallback to root address because managed address lookup failed", {
            address: normalizedAddress,
            network,
            reason: error instanceof Error ? error.message : String(error),
        });

        return {
            addresses: Array.from(addressSet),
            walletResolved: false,
            databaseAvailable: true,
            lookupError: error instanceof Error ? error.message : String(error),
        };
    }
}

function summarizeUtxos(utxos = []) {
    return (Array.isArray(utxos) ? utxos : []).reduce(
        (summary, entry = {}) => {
            const valueBaseUnits =
                entry?.amountSat !== undefined && entry?.amountSat !== null
                    ? normalizeBaseUnits(entry.amountSat)
                    : dogeToBaseUnits(entry.amount);
            const confirmations = Number(entry.confirmations || 0);
            const isConfirmed = confirmations > 0;
            const isSpendable = entry.spendable !== false && entry.solvable !== false;

            summary.total += valueBaseUnits;
            summary.utxoCount += 1;

            if (isConfirmed) {
                summary.confirmed += valueBaseUnits;
                summary.confirmedUtxoCount += 1;
            } else {
                summary.unconfirmed += valueBaseUnits;
                summary.unconfirmedUtxoCount += 1;
            }

            if (isConfirmed && isSpendable) {
                summary.available += valueBaseUnits;
                summary.spendableUtxoCount += 1;
            }

            return summary;
        },
        {
            total: 0n,
            confirmed: 0n,
            unconfirmed: 0n,
            available: 0n,
            utxoCount: 0,
            confirmedUtxoCount: 0,
            unconfirmedUtxoCount: 0,
            spendableUtxoCount: 0,
        },
    );
}

async function fetchBalance(input = {}) {
    const network = client.normalizeNetwork(input.network);
    const address = String(input.address || "").trim();

    if (!wallet.validateAddress(address, network)) {
        throw AppError.validation("Failed to fetch DOGE balance: invalid DOGE address");
    }

    const rpc = client.getClient(network);
    const managedResolution = await resolveManagedAddresses(network, address);
    const managedAddresses = managedResolution.addresses.length
        ? managedResolution.addresses
        : [address];

    try {
        const utxos = await rpc.listUnspent(0, 9999999, managedAddresses);
        const summary = summarizeUtxos(utxos);
        const hasObservedUtxos = summary.utxoCount > 0;
        const walletKnownToBackend = managedResolution.walletResolved === true;

        return buildCanonicalBalance({
            baseUnitBalance: summary.total.toString(),
            availableBaseUnits: summary.available.toString(),
            rentExemptMinimumBaseUnits: "0",
            exists: walletKnownToBackend || hasObservedUtxos,
            confirmed: summary.unconfirmed === 0n,
            raw: {
                address,
                network,
                source: "listunspent",
                currency: "DOGE",
                asset: "DOGE",
                decimals: 8,
                baseUnitName: "koinu",
                addressCount: managedAddresses.length,
                addresses: managedAddresses,
                walletResolved: managedResolution.walletResolved === true,
                databaseAvailable: managedResolution.databaseAvailable === true,
                lookupError: managedResolution.lookupError || undefined,
                confirmedBalance: summary.confirmed.toString(),
                availableBalance: summary.available.toString(),
                unconfirmedBalance: summary.unconfirmed.toString(),
                totalBalance: summary.total.toString(),
                utxoCount: summary.utxoCount,
                confirmedUtxoCount: summary.confirmedUtxoCount,
                unconfirmedUtxoCount: summary.unconfirmedUtxoCount,
                spendableUtxoCount: summary.spendableUtxoCount,
            },
        });
    } catch (error) {
        logger.error("DOGE balance fetch failed against Dogecoin Core wallet RPC", {
            address,
            network,
            reason: error instanceof Error ? error.message : String(error),
            method: error?.errors?.method || null,
            httpStatus: error?.errors?.httpStatus || null,
        });

        throw new AppError("Failed to fetch DOGE balance from Dogecoin Core wallet RPC", {
            status: 502,
            errors: error?.errors && typeof error.errors === "object"
                ? error.errors
                : { reason: error instanceof Error ? error.message : String(error) },
        });
    }
}

module.exports = { fetchBalance };
