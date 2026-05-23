import { superadminApiRequest } from "./client";

const DEFAULT_LIMIT = 25;

import { normalizeObject, normalizeArray, normalizeString, normalizeNumber, getData } from "../utils/common";



function normalizeListMeta(data = {}) {
  return {
    items: normalizeArray(data.items),
    page: normalizeNumber(data.page, 1),
    limit: normalizeNumber(data.limit, DEFAULT_LIMIT),
    total: normalizeNumber(data.total, 0),
    totalPages: normalizeNumber(data.totalPages, 0),
    hasNextPage: Boolean(data.hasNextPage),
    hasPrevPage: Boolean(data.hasPrevPage),
    appliedFilters: normalizeObject(data.appliedFilters),
    sort: normalizeObject(data.sort),
  };
}

function buildChainsQuery(query = {}) {
  const params = {};

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params[key] = value;
  });

  return params;
}

function normalizeChain(item = {}) {
  return {
    id: normalizeString(item.id),
    code: normalizeString(item.code),
    label: normalizeString(item.label),
    family: normalizeString(item.family),
    nativeAssetSymbol: normalizeString(item.nativeAssetSymbol),
    defaultNetwork: normalizeString(item.defaultNetwork),
    enabled: Boolean(item.enabled),
    runtimeStatus: normalizeString(item.runtimeStatus),
    runtimeStatusReason: normalizeString(item.runtimeStatusReason),
    maintenance: Boolean(item.maintenance),
    supportedNetworkCount: normalizeNumber(item.supportedNetworkCount, 0),
    tokenCount: normalizeNumber(item.tokenCount, 0),
    assetCount: normalizeNumber(item.assetCount, 0),
    updatedAt: normalizeString(item.updatedAt),
    configuredNetworks: normalizeArray(item.configuredNetworks),
    runtimeNetworks: normalizeArray(item.runtimeNetworks),
    features: normalizeObject(item.features),
    toggles: normalizeObject(item.toggles),
    explorer: normalizeObject(item.explorer),
    provisioning: normalizeObject(item.provisioning),
    addressExtras: normalizeObject(item.addressExtras),
    decimals: item.decimals == null ? null : normalizeNumber(item.decimals, null),
    baseUnitName: normalizeString(item.baseUnitName),
    environmentRequirements: normalizeArray(item.environmentRequirements),
    assets: normalizeArray(item.assets),
    tokens: normalizeArray(item.tokens),
  };
}

export async function fetchSuperadminChains(query = {}) {
  const response = await superadminApiRequest("/superadmin/chains", {
    query: buildChainsQuery(query),
  });
  const data = getData(response);

  return {
    ...normalizeListMeta(data),
    items: normalizeArray(data.items).map(normalizeChain),
  };
}

export async function fetchSuperadminChainDetail(chainId) {
  const response = await superadminApiRequest(`/superadmin/chains/${chainId}`);
  const data = getData(response);

  return normalizeChain(data);
}
