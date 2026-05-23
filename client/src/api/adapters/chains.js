import { mergeRuntimeChainMeta, normalizeChainCode } from "../../config/chains";

function normalizeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeNetwork(network) {
  if (!network) {
    return null;
  }

  if (typeof network === "string") {
    const code = normalizeString(network).toLowerCase();
    return code ? { code, label: network } : null;
  }

  const code = normalizeString(network.code || network.id).toLowerCase();
  if (!code) {
    return null;
  }

  return {
    code,
    label: normalizeString(network.label || network.name || network.code || network.id),
  };
}

function normalizeSupportedNetworks(item = {}) {
  const rawNetworks = Array.isArray(item.supportedNetworks)
    ? item.supportedNetworks
    : Array.isArray(item.networks)
      ? item.networks
      : [];
  const seen = new Set();

  return rawNetworks
    .map((network) => normalizeNetwork(network))
    .filter((network) => {
      if (!network?.code || seen.has(network.code)) {
        return false;
      }

      seen.add(network.code);
      return true;
    });
}

function normalizeProvisioning(item = {}, supportedNetworks = []) {
  const supportedCodes = new Set(supportedNetworks.map((network) => network.code));
  const rawProvisioning = normalizeObject(item.provisioning);
  const provisioningNetworks = Array.isArray(rawProvisioning.networks)
    ? rawProvisioning.networks
        .map((network) => normalizeString(network).toLowerCase())
        .filter((network) => supportedCodes.has(network))
    : supportedNetworks.map((network) => network.code);

  return {
    ...rawProvisioning,
    autoProvision: rawProvisioning.autoProvision !== false,
    networks: provisioningNetworks,
  };
}

function normalizeRuntimeChain(item = {}) {
  const supportedNetworks = normalizeSupportedNetworks(item);
  const supportedCodes = supportedNetworks.map((network) => network.code);
  const requestedDefaultNetwork = normalizeString(item.defaultNetwork).toLowerCase();
  const defaultNetwork = supportedCodes.includes(requestedDefaultNetwork)
    ? requestedDefaultNetwork
    : supportedCodes[0] || "";

  return {
    ...item,
    id: normalizeChainCode(item.id || item.code),
    code: normalizeChainCode(item.code || item.id),
    supportedNetworks,
    networks: supportedCodes,
    defaultNetwork,
    provisioning: normalizeProvisioning(item, supportedNetworks),
  };
}

function normalizeSupportedChainsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.supported)) {
    return payload.supported;
  }

  if (payload && typeof payload === "object") {
    return Object.values(payload);
  }

  return [];
}

export function normalizeSupportedChains(payload = {}) {
  return normalizeSupportedChainsPayload(payload)
    .map((item) => normalizeRuntimeChain(item))
    .filter((item) => item.code && item.supportedNetworks.length > 0)
    .map((item) => mergeRuntimeChainMeta(item));
}
