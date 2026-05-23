function getProvisioningScope() {
  return String(import.meta.env.VITE_WALLET_PROVISIONING_SCOPE || "primary")
    .trim()
    .toLowerCase();
}

export function buildPrimaryProvisioningTargets(chain, network) {
  if (["all", "full", "legacy"].includes(getProvisioningScope())) {
    return undefined;
  }

  const normalizedChain = String(chain || "").trim().toLowerCase();
  const normalizedNetwork = String(network || "").trim().toLowerCase();

  if (!normalizedChain || !normalizedNetwork) {
    return undefined;
  }

  return [
    {
      chain: normalizedChain,
      network: normalizedNetwork,
      priority: 0,
    },
  ];
}
