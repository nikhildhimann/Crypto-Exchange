const amount = require("./amount");
const client = require("./client");
const {
  resolveSupportedAsset,
  fromAssetBaseUnits,
} = require("../../../common/utils/assets");

function normalizeTimestamp(value) {
  if (!value && value !== 0) {
    return undefined;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value).trim(), 10);

  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  const timestamp = new Date(
    numericValue > 10_000_000_000 ? numericValue : numericValue * 1000,
  );
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
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeValue(nested),
      ]),
    );
  }

  return value;
}

function normalizeIntegerString(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number"
        ? String(Math.trunc(value))
        : String(value).trim();

  return /^\d+$/.test(normalized) ? normalized : null;
}

function isNativeTransferEntry(raw = {}) {
  const contractType = String(
    raw?.contractType ??
      raw?.contract_type ??
      raw?.contractRetType ??
      raw?.raw_data?.contract?.[0]?.type ??
      "",
  )
    .trim()
    .toLowerCase();
  const tokenAbbr = String(raw?.tokenInfo?.tokenAbbr || raw?.token_abbr || "")
    .trim()
    .toUpperCase();
  const hasNativeAmount =
    String(raw?.contractData?.amount ?? raw?.amount ?? "").trim() !== "";

  return (
    Number(raw?.contractType) === 1 ||
    contractType === "1" ||
    contractType === "transfercontract" ||
    (tokenAbbr === "TRX" && hasNativeAmount)
  );
}

function normalizeAddressForComparison(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    return String(client.TronWeb.address.toHex(normalized) || "")
      .trim()
      .toLowerCase();
  } catch (_error) {
    return normalized.toLowerCase();
  }
}

function hasExplicitFailureIndicator(raw = {}) {
  const failureCandidates = [
    raw?.finalResult,
    raw?.result,
    raw?.contractRet,
    raw?.receipt?.result,
    raw?.status,
    raw?.state,
    raw?.ret?.[0]?.contractRet,
    raw?.ret?.[0]?.status,
  ];

  return failureCandidates.some((candidate) => {
    const normalized = String(candidate || "")
      .trim()
      .toUpperCase();
    return (
      normalized &&
      !["SUCCESS", "SUCESS", "CONFIRMED", "OK"].includes(normalized) &&
      [
        "FAIL",
        "FAILED",
        "ERROR",
        "REVERT",
        "REVERTED",
        "OUT_OF_ENERGY",
        "OUT OF ENERGY",
        "TIMEOUT",
        "CANCEL",
        "DROPPED",
      ].some((token) => normalized.includes(token))
    );
  });
}

function hasExplicitSuccessIndicator(raw = {}) {
  const successCandidates = [
    raw?.finalResult,
    raw?.result,
    raw?.contractRet,
    raw?.receipt?.result,
    raw?.status,
    raw?.state,
    raw?.ret?.[0]?.contractRet,
    raw?.ret?.[0]?.status,
  ];

  return successCandidates.some((candidate) => {
    const normalized = String(candidate || "")
      .trim()
      .toUpperCase();
    return ["SUCCESS", "SUCESS", "CONFIRMED", "OK"].includes(normalized);
  });
}

function hasExplorerConfirmation(raw = {}) {
  // TronGrid TRC20 history endpoint only returns confirmed items but omits block metrics from the object.
  const isTronGridTrc20History =
    Boolean(raw?.token_info) && Boolean(raw?.transaction_id);

  return (
    isTronGridTrc20History ||
    raw?.confirmed === true ||
    typeof raw?.block === "number" ||
    typeof raw?.blockNumber === "number" ||
    typeof raw?.block_num === "number" ||
    normalizeIntegerString(raw?.block) !== null ||
    normalizeIntegerString(raw?.blockNumber) !== null ||
    normalizeIntegerString(raw?.block_num) !== null
  );
}

function resolveExplorerStatus(raw = {}) {
  const failed = hasExplicitFailureIndicator(raw);
  const confirmed = hasExplorerConfirmation(raw);
  const succeeded = failed
    ? false
    : hasExplicitSuccessIndicator(raw) || confirmed;
  const validated = confirmed || failed;
  const chainStatus = failed
    ? "failed"
    : validated && succeeded
      ? "confirmed"
      : "pending";

  return {
    validated,
    succeeded,
    chainStatus,
  };
}

function normalizeTronContractAddress(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    if (/^41[0-9a-fA-F]{40}$/.test(normalized)) {
      return client.TronWeb.address.fromHex(normalized);
    }

    if (client.TronWeb.isAddress(normalized)) {
      return normalized;
    }
  } catch (_error) {
    // ignore
  }

  return normalized;
}

module.exports = {
  mapTransaction(raw = {}, walletAddress) {
    if (!raw) {
      return null;
    }

    if (isNativeTransferEntry(raw)) {
      const txHash =
        typeof raw.hash === "string" && raw.hash.trim()
          ? raw.hash.trim()
          : typeof raw.txID === "string" && raw.txID.trim()
            ? raw.txID.trim()
            : typeof raw.txid === "string" && raw.txid.trim()
              ? raw.txid.trim()
              : typeof raw.transaction_id === "string" &&
                  raw.transaction_id.trim()
                ? raw.transaction_id.trim()
                : "";

      if (!txHash) {
        return null;
      }

      const fromAddress = String(
        raw.ownerAddress ||
          raw.contractData?.owner_address ||
          raw.raw_data?.contract?.[0]?.parameter?.value?.owner_address ||
          "",
      ).trim();
      const toAddress = String(
        raw.toAddress ||
          raw.contractData?.to_address ||
          raw.raw_data?.contract?.[0]?.parameter?.value?.to_address ||
          "",
      ).trim();
      const normalizedWalletAddress =
        normalizeAddressForComparison(walletAddress);
      const normalizedFromAddress = normalizeAddressForComparison(fromAddress);
      const normalizedToAddress = normalizeAddressForComparison(toAddress);

      const direction =
        normalizedToAddress === normalizedWalletAddress
          ? "incoming"
          : normalizedFromAddress === normalizedWalletAddress
            ? "outgoing"
            : null;

      if (!direction) {
        return null;
      }

      const amountBaseUnits =
        normalizeIntegerString(raw.contractData?.amount) ||
        normalizeIntegerString(
          raw.raw_data?.contract?.[0]?.parameter?.value?.amount,
        ) ||
        normalizeIntegerString(raw.amount);
      if (!amountBaseUnits) {
        return null;
      }

      const networkFeeBaseUnits =
        normalizeIntegerString(raw.cost?.fee) ||
        normalizeIntegerString(raw.fee) ||
        "0";
      const { validated, succeeded, chainStatus } = resolveExplorerStatus(raw);
      const chainTimestamp = normalizeTimestamp(
        raw.block_timestamp ||
          raw.block_ts ||
          raw.timestamp ||
          raw.blockTimeStamp,
      );

      return {
        tx: serializeValue(raw),
        meta: serializeValue(raw.cost || {}),
        txHash,
        amount: amount.fromBaseUnits(amountBaseUnits),
        amountBaseUnits,
        direction,
        fromAddress,
        toAddress,
        validated,
        networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
        networkFeeBaseUnits,
        networkFeeAsset: "TRX",
        networkFeeCurrency: "TRX",
        networkFeeAssetType: "native",
        executionParams: {},
        chainStatus,
        succeeded,
        ledgerIndex:
          typeof raw.block === "number"
            ? raw.block
            : normalizeIntegerString(raw.blockNumber)
              ? Number(raw.blockNumber)
              : normalizeIntegerString(raw.block_num)
                ? Number(raw.block_num)
                : normalizeIntegerString(raw.block)
                  ? Number(raw.block)
                  : undefined,
        chainTimestamp,
        confirmedAt: validated ? chainTimestamp : undefined,
      };
    }

    const txHash =
      typeof raw.transaction_id === "string" && raw.transaction_id.trim()
        ? raw.transaction_id.trim()
        : typeof raw.txID === "string" && raw.txID.trim()
          ? raw.txID.trim()
          : typeof raw.txid === "string" && raw.txid.trim()
            ? raw.txid.trim()
            : typeof raw.hash === "string" && raw.hash.trim()
              ? raw.hash.trim()
              : "";
    if (!txHash) {
      return null;
    }

    const contractAddress = normalizeTronContractAddress(
      raw.contract_address ||
        raw.token_info?.address ||
        raw.token_info?.tokenId ||
        raw.tokenInfo?.address ||
        raw.tokenInfo?.tokenId ||
        raw.token_address ||
        raw.contractAddress ||
        raw.token?.address ||
        "",
    );
    let assetDescriptor = null;

    try {
      const normalizedContract = normalizeTronContractAddress(contractAddress);
      assetDescriptor = resolveSupportedAsset(
        "tron",
        "mainnet",
        normalizedContract,
      );
    } catch (_error) {
      return null;
    }

    if (!assetDescriptor || assetDescriptor.assetType !== "token") {
      return null;
    }

    const fromAddress = String(
      raw.from || raw.from_address || raw.ownerAddress || "",
    ).trim();
    const toAddress = String(
      raw.to || raw.to_address || raw.toAddress || "",
    ).trim();
    const normalizedWalletAddress =
      normalizeAddressForComparison(walletAddress);
    const normalizedFromAddress = normalizeAddressForComparison(fromAddress);
    const normalizedToAddress = normalizeAddressForComparison(toAddress);

    const direction =
      normalizedToAddress === normalizedWalletAddress
        ? "incoming"
        : normalizedFromAddress === normalizedWalletAddress
          ? "outgoing"
          : null;

    if (!direction) {
      return null;
    }

    const amountBaseUnits =
      normalizeIntegerString(raw.quant) ||
      normalizeIntegerString(raw.value) ||
      normalizeIntegerString(raw.amount) ||
      normalizeIntegerString(raw.amount_str);
    if (!amountBaseUnits) {
      return null;
    }

    const networkFeeBaseUnits = normalizeIntegerString(raw.fee) || "0";
    const { validated, succeeded, chainStatus } = resolveExplorerStatus(raw);
    const chainTimestamp = normalizeTimestamp(
      raw.block_ts || raw.timestamp || raw.block_timestamp,
    );

    return {
      tx: serializeValue(raw),
      meta: serializeValue(raw.trigger_info || {}),
      txHash,
      amount: fromAssetBaseUnits(assetDescriptor, amountBaseUnits),
      amountBaseUnits,
      asset: assetDescriptor.asset,
      currency: assetDescriptor.symbol,
      assetType: assetDescriptor.assetType,
      standard: assetDescriptor.standard,
      contractAddress: assetDescriptor.contractAddress,
      direction,
      fromAddress,
      toAddress,
      validated,
      networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
      networkFeeBaseUnits,
      networkFeeAsset: "TRX",
      networkFeeCurrency: "TRX",
      networkFeeAssetType: "native",
      totalDebit: fromAssetBaseUnits(assetDescriptor, amountBaseUnits),
      totalDebitBaseUnits: amountBaseUnits,
      totalDebitAsset: assetDescriptor.asset,
      totalDebitCurrency: assetDescriptor.symbol,
      totalDebitAssetType: assetDescriptor.assetType,
      compositeDebit: {
        transferAmount: fromAssetBaseUnits(assetDescriptor, amountBaseUnits),
        transferAmountBaseUnits: amountBaseUnits,
        transferAsset: assetDescriptor.asset,
        networkFee: amount.fromBaseUnits(networkFeeBaseUnits),
        networkFeeBaseUnits,
        networkFeeAsset: "TRX",
      },
      executionParams: {},
      chainStatus,
      succeeded,
      ledgerIndex:
        typeof raw.block === "number"
          ? raw.block
          : normalizeIntegerString(raw.blockNumber)
            ? Number(raw.blockNumber)
            : normalizeIntegerString(raw.block_num)
              ? Number(raw.block_num)
              : undefined,
      chainTimestamp,
      confirmedAt: validated ? chainTimestamp : undefined,
    };
  },
};
