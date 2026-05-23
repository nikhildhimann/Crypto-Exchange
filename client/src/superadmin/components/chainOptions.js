import { CHAIN_REGISTRY } from "../../config/chains";

function sortChainOptions(left, right) {
  return left.label.localeCompare(right.label);
}

export const SUPERADMIN_CHAIN_OPTIONS = Object.freeze(
  Object.values(CHAIN_REGISTRY)
    .map((chain) => ({
      value: String(chain.code || chain.id || "").toLowerCase(),
      label: chain.label || chain.name || String(chain.code || chain.id || "").toUpperCase(),
    }))
    .filter((chain) => chain.value)
    .sort(sortChainOptions),
);
