import { normalizeChainCode } from "../../config/chains";

function normalizeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function buildCanonicalReceiveQrValue(payload = {}) {
  const existingQrValue = normalizeString(payload.qrValue || payload.qrCode?.value).trim();
  if (existingQrValue) {
    return existingQrValue;
  }

  const chain = normalizeChainCode(payload.chain);
  const address = normalizeString(payload.address).trim();

  if (!address) {
    return "";
  }

  if (chain === "solana") {
    return `solana:${address}`;
  }

  if (chain === "bnb") {
    return `bnb:${address}`;
  }

  if (chain === "eth") {
    return `ethereum:${address}`;
  }

  if (chain === "avax") {
    return `ethereum:${address}`;
  }

  if (chain === "polygon") {
    return `ethereum:${address}`;
  }

  if (chain === "btc") {
    return `bitcoin:${address}`;
  }

  // if (chain === "doge") {
  //   return `dogecoin:${address}`;
  // }

  if (chain === "tron") {
    return `tron:${address}`;
  }

  if (chain === "sui") {
    return `sui:${address}`;
  }

  if (chain === "ton") {
    return `ton:${address}`;
  }

  if (chain === "aptos") {
    return `aptos:${address}`;
  }

  if (chain === "ada" || chain === "hbar") {
    return address;
  }

  if (chain === "xrp") {
    const destinationTag =
      payload.destinationTag ??
      payload.qrParams?.destinationTag ??
      payload.executionParams?.destinationTag ??
      null;

    if (destinationTag === undefined || destinationTag === null || destinationTag === "") {
      return `xrp:${address}`;
    }

    const params = new URLSearchParams();
    params.set("dt", String(destinationTag));
    return `xrp:${address}?${params.toString()}`;
  }

  return address;
}

function normalizeWalletCore(wallet = {}) {
  const metadata = normalizeObject(wallet.metadata);

  return {
    walletId: normalizeString(wallet.walletId || wallet.id || wallet._id),
    accountId:
      wallet.accountId === undefined || wallet.accountId === null || wallet.accountId === ""
        ? null
        : normalizeString(wallet.accountId),
    chain: normalizeChainCode(wallet.chain),
    network: normalizeString(wallet.network).toLowerCase(),
    address: normalizeString(wallet.address),
    asset: normalizeString(wallet.asset || wallet.currency),
    label: normalizeString(wallet.label).trim(),
    isImported: Boolean(wallet.isImported),
    sourceType: normalizeString(wallet.sourceType),
    metadata,
  };
}

export function normalizeWallet(wallet = {}) {
  return {
    ...wallet,
    ...normalizeWalletCore(wallet),
  };
}

export function normalizeWalletList(payload = []) {
  return Array.isArray(payload) ? payload.map((wallet) => normalizeWallet(wallet)) : [];
}

export function normalizeWalletDetails(payload = {}) {
  return normalizeWallet(payload);
}

export function normalizeWalletCreateInit(payload = {}) {
  const provisioningTargets = Array.isArray(payload.provisioningTargets)
    ? payload.provisioningTargets.map((target) => ({
        chain: normalizeChainCode(target?.chain),
        network: normalizeString(target?.network).toLowerCase(),
      }))
    : [];

  return {
    sessionId: normalizeString(payload.sessionId),
    recoveryPhrase: normalizeString(payload.recoveryPhrase),
    chain: normalizeChainCode(payload.chain),
    network: normalizeString(payload.network).toLowerCase(),
    provisioningTargets,
    expiresAt: normalizeString(payload.expiresAt),
  };
}

function normalizeProvisionedWallets(wallets = []) {
  return Array.isArray(wallets) ? wallets.map((wallet) => normalizeWallet(wallet)) : [];
}

export function normalizeWalletProvisioningResult(payload = {}) {
  const normalizedPrimaryWallet = normalizeWallet(payload);
  const provisionedWallets = normalizeProvisionedWallets(
    payload.provisionedWallets?.length ? payload.provisionedWallets : [normalizedPrimaryWallet],
  );

  return {
    ...payload,
    ...normalizedPrimaryWallet,
    provisionedWallets,
    provisionedWalletCount:
      Number(payload.provisionedWalletCount) || provisionedWallets.length,
    provisioningTargets: Array.isArray(payload.provisioningTargets)
      ? payload.provisioningTargets.map((target) => ({
          chain: normalizeChainCode(target?.chain),
          network: normalizeString(target?.network).toLowerCase(),
        }))
      : [],
  };
}

export function normalizeReceivePayload(payload = {}) {
  const qrValue = buildCanonicalReceiveQrValue(payload);

  return {
    ...payload,
    walletId: normalizeString(payload.walletId),
    chain: normalizeChainCode(payload.chain),
    network: normalizeString(payload.network).toLowerCase(),
    address: normalizeString(payload.address),
    asset: normalizeString(payload.asset),
    amount: payload.amount == null ? null : normalizeString(payload.amount),
    executionParams: normalizeObject(payload.executionParams),
    qrParams: normalizeObject(payload.qrParams),
    destinationTag:
      payload.destinationTag === undefined || payload.destinationTag === null || payload.destinationTag === ""
        ? null
        : payload.destinationTag,
    supportsDestinationTag: Boolean(payload.supportsDestinationTag),
    qrValue,
    scanValue: normalizeString(payload.scanValue),
    copyAddress: normalizeString(payload.copyAddress),
    copyTag:
      payload.copyTag === undefined || payload.copyTag === null || payload.copyTag === ""
        ? null
        : payload.copyTag,
  };
}

export function normalizeReceiveQr(payload = {}) {
  const normalizedPayload = normalizeReceivePayload(payload);
  const qrCode = normalizeObject(payload.qrCode);

  return {
    ...normalizedPayload,
    qrCode: {
      value: normalizeString(qrCode.value) || normalizedPayload.qrValue,
      dataUrl: normalizeString(qrCode.dataUrl),
    },
  };
}
