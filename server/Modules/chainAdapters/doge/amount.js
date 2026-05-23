const { AppError } = require("../../../helpers/errors");

const DECIMALS = 8n;
const BASE = 10n ** DECIMALS;

function normalizeDisplayAmount(value) {
    const normalized = String(value ?? "").trim();

    if (!/^\d+(\.\d{1,8})?$/.test(normalized)) {
        throw AppError.validation("Invalid DOGE amount");
    }

    return normalized;
}

function toBaseUnits(value) {
    const normalized = normalizeDisplayAmount(value);
    const [whole, fraction = ""] = normalized.split(".");
    const paddedFraction = `${fraction}00000000`.slice(0, 8);

    return (BigInt(whole) * BASE + BigInt(paddedFraction)).toString();
}

function fromBaseUnits(value) {
    const raw = BigInt(String(value ?? "0"));
    const whole = raw / BASE;
    const fraction = (raw % BASE).toString().padStart(8, "0").replace(/0+$/, "");

    return fraction ? `${whole}.${fraction}` : whole.toString();
}

module.exports = {
    normalizeDisplayAmount,
    toBaseUnits,
    fromBaseUnits,
};
