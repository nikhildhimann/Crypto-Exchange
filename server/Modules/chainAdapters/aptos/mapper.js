const amount = require("./amount");
const wallet = require("./wallet");
const { buildTransactionExplorerUrl } = require("../../../common/utils/explorer");

const USER_TRANSACTION_TYPE = "user_transaction";
const PENDING_TRANSACTION_TYPE = "pending_transaction";
const FUNGIBLE_STORE_TYPE = "0x1::fungible_asset::fungiblestore";
const OBJECT_CORE_TYPE = "0x1::object::objectcore";
const FUNGIBLE_DEPOSIT_EVENT_TYPE = "0x1::fungible_asset::deposit";
const FUNGIBLE_WITHDRAW_EVENT_TYPE = "0x1::fungible_asset::withdraw";
const TRANSFER_FUNCTION_NAMES = new Set([
  "0x1::aptos_account::transfer",
  "0x1::aptos_account::transfer_coins",
  "0x1::aptos_account::batch_transfer",
  "0x1::aptos_account::batch_transfer_coins",
  "0x1::aptos_account::batch_transfer_fungible_assets",
]);
const APT_METADATA_ADDRESSES = new Set([
  wallet.normalizeAddress("0xa"),
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeOptionalAddress(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  try {
    return wallet.normalizeAddress(normalized);
  } catch (_error) {
    return "";
  }
}

function normalizeTransactionHash(value) {
  const normalized = normalizeString(value).toLowerCase();
  return /^0x[0-9a-f]{64}$/.test(normalized) ? normalized : "";
}

function normalizeWalletAddressSet(raw = {}, walletAddress = "") {
  const values = new Set();
  const candidates = [
    walletAddress,
    raw.walletAddress,
    ...(Array.isArray(raw.walletAddresses) ? raw.walletAddresses : []),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOptionalAddress(candidate);
    if (normalized) {
      values.add(normalized);
    }
  }

  return values;
}

function normalizeTimestamp(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }

  const timestamp = new Date(raw / 1000);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

function normalizeLedgerIndex(value) {
  const normalized = normalizeString(value);
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const asBigInt = BigInt(normalized);
  return asBigInt <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(normalized) : undefined;
}

function computeNetworkFeeBaseUnits(raw = {}) {
  const gasUsed = normalizeString(raw.gas_used || "0");
  const gasUnitPrice = normalizeString(raw.gas_unit_price || "0");

  if (!/^\d+$/.test(gasUsed) || !/^\d+$/.test(gasUnitPrice)) {
    return "0";
  }

  return (BigInt(gasUsed) * BigInt(gasUnitPrice)).toString();
}

function resolveStoreMetadataAddress(rawMetadata) {
  if (typeof rawMetadata === "string") {
    return normalizeOptionalAddress(rawMetadata);
  }

  if (rawMetadata && typeof rawMetadata === "object") {
    return normalizeOptionalAddress(
      rawMetadata.inner ||
        rawMetadata.address ||
        rawMetadata.account_address ||
        "",
    );
  }

  return "";
}

function buildStoreMaps(raw = {}) {
  const storeMetadataMap = new Map();
  const storeOwnerMap = new Map();
  const changes = Array.isArray(raw.changes) ? raw.changes : [];

  for (const change of changes) {
    if (String(change?.type || "").trim().toLowerCase() !== "write_resource") {
      continue;
    }

    const resourceAddress = normalizeOptionalAddress(change?.address);
    const resourceType = String(change?.data?.type || "").trim().toLowerCase();

    if (!resourceAddress || !resourceType) {
      continue;
    }

    if (resourceType === FUNGIBLE_STORE_TYPE) {
      const metadataAddress = resolveStoreMetadataAddress(change?.data?.data?.metadata);
      if (metadataAddress) {
        storeMetadataMap.set(resourceAddress, metadataAddress);
      }
      continue;
    }

    if (resourceType === OBJECT_CORE_TYPE) {
      const ownerAddress = normalizeOptionalAddress(change?.data?.data?.owner);
      if (ownerAddress) {
        storeOwnerMap.set(resourceAddress, ownerAddress);
      }
    }
  }

  return {
    storeMetadataMap,
    storeOwnerMap,
  };
}

function isAptMetadataAddress(value) {
  const normalized = normalizeOptionalAddress(value);
  return normalized ? APT_METADATA_ADDRESSES.has(normalized) : false;
}

function normalizeFungibleEventEntries(raw = {}) {
  const { storeMetadataMap, storeOwnerMap } = buildStoreMaps(raw);
  const events = Array.isArray(raw.events) ? raw.events : [];

  return events
    .map((event, index) => {
      const eventType = String(event?.type || "").trim().toLowerCase();
      if (
        eventType !== FUNGIBLE_DEPOSIT_EVENT_TYPE &&
        eventType !== FUNGIBLE_WITHDRAW_EVENT_TYPE
      ) {
        return null;
      }

      const storeAddress = normalizeOptionalAddress(event?.data?.store);
      const ownerAddress = storeOwnerMap.get(storeAddress) || "";
      const metadataAddress = storeMetadataMap.get(storeAddress) || "";
      const rawAmount = normalizeString(event?.data?.amount || "0");

      if (!ownerAddress || !metadataAddress || !/^\d+$/.test(rawAmount)) {
        return null;
      }

      if (!isAptMetadataAddress(metadataAddress)) {
        return null;
      }

      const amountBaseUnits = BigInt(rawAmount);
      if (amountBaseUnits <= 0n) {
        return null;
      }

      return {
        index,
        eventType,
        storeAddress,
        ownerAddress,
        metadataAddress,
        amountBaseUnits,
      };
    })
    .filter(Boolean);
}

function sumEventAmounts(entries = []) {
  return entries.reduce((total, entry) => total + entry.amountBaseUnits, 0n);
}

function sortPositiveEntries(entries = []) {
  return [...entries].sort((left, right) => {
    if (left.amountBaseUnits !== right.amountBaseUnits) {
      return left.amountBaseUnits > right.amountBaseUnits ? -1 : 1;
    }

    return left.ownerAddress.localeCompare(right.ownerAddress);
  });
}

function resolveTransferFromEvents(raw = {}, walletAddressSet) {
  const entries = normalizeFungibleEventEntries(raw);
  if (!entries.length) {
    return null;
  }

  const senderAddress = normalizeOptionalAddress(raw.sender);
  const walletDeposits = entries.filter(
    (entry) =>
      entry.eventType === FUNGIBLE_DEPOSIT_EVENT_TYPE &&
      walletAddressSet.has(entry.ownerAddress),
  );
  const walletWithdrawals = entries.filter(
    (entry) =>
      entry.eventType === FUNGIBLE_WITHDRAW_EVENT_TYPE &&
      walletAddressSet.has(entry.ownerAddress),
  );
  const externalDeposits = sortPositiveEntries(
    entries.filter(
      (entry) =>
        entry.eventType === FUNGIBLE_DEPOSIT_EVENT_TYPE &&
        !walletAddressSet.has(entry.ownerAddress),
    ),
  );
  const externalWithdrawals = sortPositiveEntries(
    entries.filter(
      (entry) =>
        entry.eventType === FUNGIBLE_WITHDRAW_EVENT_TYPE &&
        !walletAddressSet.has(entry.ownerAddress),
    ),
  );

  const incomingAmountBaseUnits = sumEventAmounts(walletDeposits);
  const outgoingAmountBaseUnits = sumEventAmounts(externalDeposits);

  if (
    incomingAmountBaseUnits > 0n &&
    (!senderAddress || !walletAddressSet.has(senderAddress))
  ) {
    return {
      functionName: normalizeString(raw?.payload?.function).toLowerCase(),
      direction: "incoming",
      toAddress: walletDeposits[0]?.ownerAddress || "",
      fromAddress:
        externalWithdrawals[0]?.ownerAddress ||
        senderAddress ||
        "",
      amountBaseUnits: incomingAmountBaseUnits.toString(),
    };
  }

  if (senderAddress && walletAddressSet.has(senderAddress) && outgoingAmountBaseUnits > 0n) {
    return {
      functionName: normalizeString(raw?.payload?.function).toLowerCase(),
      direction: "outgoing",
      fromAddress: senderAddress,
      toAddress: externalDeposits[0]?.ownerAddress || "",
      amountBaseUnits: outgoingAmountBaseUnits.toString(),
    };
  }

  return null;
}

function resolvePayload(raw = {}) {
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
  const functionName = normalizeString(payload.function).toLowerCase();
  const argumentsList = Array.isArray(payload.arguments) ? payload.arguments : [];

  if (!TRANSFER_FUNCTION_NAMES.has(functionName) || argumentsList.length < 2) {
    return null;
  }

  const toAddress = normalizeOptionalAddress(argumentsList[0]);
  const amountBaseUnits = normalizeString(argumentsList[1]);

  if (!toAddress || !/^\d+$/.test(amountBaseUnits)) {
    return null;
  }

  return {
    functionName,
    toAddress,
    amountBaseUnits,
  };
}

function resolveTransfer(raw = {}, walletAddressSet) {
  const eventTransfer = resolveTransferFromEvents(raw, walletAddressSet);
  if (eventTransfer) {
    return eventTransfer;
  }

  const payloadTransfer = resolvePayload(raw);
  if (!payloadTransfer) {
    return null;
  }

  const fromAddress = normalizeOptionalAddress(raw.sender);
  const toAddress = payloadTransfer.toAddress;
  const senderMatches = fromAddress && walletAddressSet.has(fromAddress);
  const recipientMatches = toAddress && walletAddressSet.has(toAddress);

  if (recipientMatches && !senderMatches) {
    return {
      ...payloadTransfer,
      direction: "incoming",
      fromAddress,
      toAddress,
    };
  }

  if (senderMatches) {
    return {
      ...payloadTransfer,
      direction: "outgoing",
      fromAddress,
      toAddress,
    };
  }

  return null;
}

module.exports = {
  normalizeTransactionHash,
  computeNetworkFeeBaseUnits,
  mapTransaction(raw = {}, walletAddress) {
    const txHash = normalizeTransactionHash(raw.hash || raw.txHash);
    const walletAddressSet = normalizeWalletAddressSet(raw, walletAddress);

    if (!txHash || !walletAddressSet.size) {
      return null;
    }

    if (
      normalizeString(raw.type || USER_TRANSACTION_TYPE).toLowerCase() ===
      PENDING_TRANSACTION_TYPE
    ) {
      return null;
    }

    const transfer = resolveTransfer(raw, walletAddressSet);
    if (!transfer) {
      return null;
    }

    const amountBaseUnits = normalizeString(transfer.amountBaseUnits);
    if (!/^\d+$/.test(amountBaseUnits) || BigInt(amountBaseUnits) <= 0n) {
      return null;
    }

    const succeeded = raw.success === true;
    const pending =
      normalizeString(raw.type || "").toLowerCase() === PENDING_TRANSACTION_TYPE;
    const validated = !pending && Boolean(raw.timestamp || raw.version);
    const networkFeeBaseUnits = computeNetworkFeeBaseUnits(raw);
    const chainTimestamp = normalizeTimestamp(raw.timestamp);

    return {
      tx: raw.payload || raw,
      meta: {
        type: raw.type || USER_TRANSACTION_TYPE,
        success: raw.success === true,
        vmStatus: raw.vm_status || null,
        functionName: transfer.functionName || null,
      },
      txHash,
      explorerUrl:
        buildTransactionExplorerUrl(
          "aptos",
          raw.network,
          txHash,
        ) || null,
      amount: amount.fromBaseUnits(amountBaseUnits),
      amountBaseUnits,
      direction: transfer.direction,
      fromAddress: transfer.fromAddress || "",
      toAddress: transfer.toAddress || "",
      validated,
      confirmations: validated ? 1 : 0,
      network: raw.network || undefined,
      networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
      networkFeeBaseUnits,
      executionParams: {},
      chainStatus: pending
        ? "pending"
        : succeeded
          ? validated
            ? "confirmed"
            : "submitted"
          : "failed",
      succeeded,
      ledgerIndex: normalizeLedgerIndex(raw.version),
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },
};
