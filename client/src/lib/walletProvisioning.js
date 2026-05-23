function normalizeNetworkCode(network) {
  return String(network?.code || network || "").toLowerCase();
}

export function getSupportedNetworkOptions(chainMeta) {
  const supportedNetworks = Array.isArray(chainMeta?.supportedNetworks)
    ? chainMeta.supportedNetworks
    : Array.isArray(chainMeta?.networks)
      ? chainMeta.networks
      : [];
  const provisioningNetworks = Array.isArray(chainMeta?.provisioning?.networks)
    ? chainMeta.provisioning.networks.map((network) => normalizeNetworkCode(network))
    : [];
  const hasProvisioningNetworks = provisioningNetworks.length > 0;
  const seen = new Set();

  if (supportedNetworks.length) {
    return supportedNetworks
      .map((network) => ({
        code: normalizeNetworkCode(network),
        label:
          typeof network === "string"
            ? network
            : network?.label || network?.code || "",
      }))
      .filter((network) => {
        if (!network.code || seen.has(network.code)) {
          return false;
        }

        if (hasProvisioningNetworks && !provisioningNetworks.includes(network.code)) {
          return false;
        }

        seen.add(network.code);
        return true;
      });
  }

  return [];
}

function supportsPreferredNetwork(chainMeta, preferredNetwork = "") {
  const normalizedPreferredNetwork = normalizeNetworkCode(preferredNetwork);
  if (!normalizedPreferredNetwork) {
    return false;
  }

  return getSupportedNetworkOptions(chainMeta).some((network) => network.code === normalizedPreferredNetwork);
}

export function getPrimaryProvisioningChain(supportedChains = [], preferredNetwork = "") {
  const provisionableChains = supportedChains.filter(
    (chainMeta) =>
      chainMeta?.code &&
      chainMeta?.provisioning?.autoProvision !== false &&
      getSupportedNetworkOptions(chainMeta).length > 0,
  );

  // Minimal Aptos-only fix: prioritize Aptos when available without affecting other chains
  const aptosChain = provisionableChains.find((chainMeta) => 
    String(chainMeta?.code || "").toLowerCase() === "aptos"
  );
  
  return (
    provisionableChains.find((chainMeta) => supportsPreferredNetwork(chainMeta, preferredNetwork)) ||
    aptosChain ||
    provisionableChains[0] ||
    null
  );
}

export function resolveProvisioningNetwork(chainMeta, preferredNetwork = "") {
  const networkOptions = getSupportedNetworkOptions(chainMeta);
  const normalizedPreferredNetwork = String(preferredNetwork || "").toLowerCase();

  if (normalizedPreferredNetwork) {
    const matchingNetwork = networkOptions.find((network) => network.code === normalizedPreferredNetwork);
    if (matchingNetwork) {
      return matchingNetwork.code;
    }
  }

  return chainMeta?.defaultNetwork || networkOptions[0]?.code || "";
}

export function resolveExplicitProvisioningTarget(
  supportedChains = [],
  requestedChain = "",
  preferredNetwork = "",
) {
  const normalizedRequestedChain = String(requestedChain || "").toLowerCase();
  const chainMeta = supportedChains.find(
    (item) =>
      String(item?.code || item?.id || "").toLowerCase() === normalizedRequestedChain,
  );

  if (!chainMeta) {
    return {
      chain: "",
      network: "",
    };
  }

  return {
    chain: chainMeta.code || chainMeta.id || "",
    network: resolveProvisioningNetwork(chainMeta, preferredNetwork),
  };
}

export function resolveProvisioningTarget(supportedChains = [], preferredNetwork = "") {
  const primaryChain = getPrimaryProvisioningChain(supportedChains, preferredNetwork);

  return {
    chain: primaryChain?.code || primaryChain?.id || "",
    network: resolveProvisioningNetwork(primaryChain, preferredNetwork),
  };
}
