const {
  defaultChain,
  assertSupportedChain: assertConfiguredSupportedChain,
  assertSupportedChainNetwork: assertConfiguredSupportedChainNetwork,
  buildRuntimeChainNetworkFilter,
  getChainConfig,
  getChainFeatures: getConfigChainFeatures,
  getChainNetworkCodes,
  getChainProvisioningConfig,
  getChainToggles: getConfigChainToggles,
  getEnabledChainCodes,
  getEnabledChains,
  getEnabledNetworks,
  getNetworkConfig,
  isChainEnabled,
  isNetworkEnabled,
} = require("../../config/chains");
const {
  buildNativeAssetDescriptor,
  listSupportedAssetMetadata,
  listSupportedTokenMetadata,
} = require("./assets");
const chainRegistry = require("../../Modules/chainAdapters/registry");
const { AppError } = require("../../helpers/errors");
const runtimeState = require("../../services/runtimeState");

const FEATURE_CAPABILITY_MAP = Object.freeze({
  create: "wallet",
  import: "wallet",
  send: "transaction",
  receive: "wallet",
  qr: "qr",
  history: "transaction",
  internalTransfer: "transaction",
});

const FEATURE_TOGGLE_KEY_MAP = Object.freeze({
  create: "createEnabled",
  import: "importEnabled",
  send: "sendEnabled",
  receive: "receiveEnabled",
  qr: "receiveEnabled",
  internalTransfer: "sendEnabled",
});

const FEATURE_LABELS = Object.freeze({
  create: "Wallet creation",
  import: "Wallet import",
  send: "Sending",
  receive: "Receiving",
  qr: "Receive QR generation",
  explorer: "Explorer access",
  history: "Transaction history sync",
  internalTransfer: "Internal transfers",
});

function getFeatureLabel(feature) {
  return FEATURE_LABELS[feature] || `Feature "${feature}"`;
}

function humanizeExecutionParamKey(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeProvisioningFeature(feature) {
  const normalized = String(feature || "").toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized === "created") {
    return "create";
  }

  if (normalized === "imported") {
    return "import";
  }

  return normalized;
}

function getRegisteredAdapterOrNull(chainCode) {
  return chainRegistry.getAdapterOrNull(chainCode);
}

function assertRegisteredAdapter(chainCode) {
  const adapter = getRegisteredAdapterOrNull(chainCode);
  if (!adapter) {
    throw AppError.validation(
      `Chain "${chainCode}" is enabled in config but no adapter is registered for the current runtime`,
    );
  }

  return adapter;
}

function buildChainContext(chain, adapter) {
  const metadata = adapter.metadata || {};

  return {
    chain: chain.code,
    chainConfig: chain,
    adapter,
    metadata: {
      ...metadata,
      supportedNetworks: chain.supportedNetworks,
      explorer: chain.explorer,
      features: chain.features,
      toggles: chain.toggles,
      enabled: true,
    },
    assetSymbol: metadata.nativeAssetSymbol || chain.nativeAssetSymbol,
    decimals: metadata.decimals ?? chain.decimals,
    baseUnitName: metadata.baseUnitName || chain.baseUnitName,
    supportedNetworks: chain.supportedNetworks,
    addressExtras: chain.addressExtras || metadata.addressExtras,
    explorer: chain.explorer,
    label: chain.label || metadata.label,
    features: chain.features,
    toggles: chain.toggles,
  };
}

function getChainContext(chainCode = defaultChain) {
  if (runtimeState.isChainDisabled(chainCode)) {
    const chainStatus = runtimeState
      .listChainStatuses()
      .find((entry) => entry.chain === String(chainCode || "").toLowerCase());
    throw AppError.validation(
      `Chain "${chainCode}" is temporarily disabled in the current runtime${chainStatus?.reason ? `: ${chainStatus.reason}` : ""}`,
    );
  }

  const chain = getChainConfig(chainCode);
  if (!chain) {
    throw AppError.validation(`Unsupported chain "${chainCode}"`);
  }

  if (!isChainEnabled(chain.code)) {
    throw AppError.validation(`Chain "${chain.code}" is currently disabled`);
  }

  const adapter = assertRegisteredAdapter(chain.code);
  return buildChainContext(chain, adapter);
}

function getChainAssetSymbol(input, fallbackChain = defaultChain) {
  if (input && typeof input === "object" && input.asset) {
    return input.asset;
  }

  if (input && typeof input === "string") {
    return getChainContext(input).assetSymbol;
  }

  return getChainContext(fallbackChain).assetSymbol;
}

function getChainLabel(chainCode = defaultChain) {
  return getChainConfig(chainCode)?.label || "";
}

function getNetworkLabel(chainCode = defaultChain, networkCode) {
  const chain = getChainConfig(chainCode);
  if (!chain) {
    return "";
  }

  const network = getNetworkConfig(chain.code, networkCode || chain.defaultNetwork);
  return network?.label || "";
}

function getExecutionParamLabels(chainCode = defaultChain, networkCode) {
  const chain = getChainConfig(chainCode);
  if (!chain) {
    return {};
  }

  const resolvedNetwork = networkCode || chain.defaultNetwork;
  const context = assertSupportedChainNetwork(chain.code, resolvedNetwork);
  const addressExtras = context.addressExtras || {};
  const labels = {};

  if (addressExtras.destinationTag) {
    labels.destinationTag = "Destination Tag";
  }

  if (addressExtras.memo) {
    labels.memo = "Memo";
  }

  const extraParams = Array.isArray(addressExtras.extraParams)
    ? addressExtras.extraParams
    : [];

  for (const entry of extraParams) {
    const rawEntry =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry
        : { key: entry };
    const key = String(rawEntry.key || rawEntry.code || rawEntry.name || "").trim();

    if (!key) {
      continue;
    }

    labels[key] = rawEntry.label || humanizeExecutionParamKey(key);
  }

  return labels;
}

function assertSupportedChain(chainCode) {
  try {
    const chain = assertConfiguredSupportedChain(chainCode);
    return getChainContext(chain.code);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw AppError.validation(error.message);
  }
}

function isImplementedChainContext(context) {
  const metadata = context?.adapter?.metadata || {};
  return metadata.implementationStatus === "active" && metadata.isPlaceholder !== true;
}

function hasFeatureCapability(context, feature) {
  const requiredCapability = FEATURE_CAPABILITY_MAP[feature];
  if (!requiredCapability) {
    return true;
  }

  const capabilities = Array.isArray(context?.adapter?.metadata?.capabilities)
    ? context.adapter.metadata.capabilities
    : [];

  return capabilities.includes(requiredCapability);
}

function hasExplorerSupport(context, network) {
  if (!context?.explorer?.supported) {
    return false;
  }

  const explorerEntry = context.explorer.networks?.[network];
  return Boolean(
    explorerEntry &&
      (explorerEntry.addressBaseUrl || explorerEntry.transactionBaseUrl),
  );
}

function getRuntimeChainFeatures(chainCode, networkCode) {
  const context = getChainContext(chainCode);
  const network = networkCode || context.chainConfig.defaultNetwork;
  const configFeatures = getConfigChainFeatures(context.chain, network);

  if (!configFeatures) {
    return null;
  }

  const implementationReady = isImplementedChainContext(context);

  return {
    ...configFeatures,
    create:
      Boolean(configFeatures.create) &&
      implementationReady &&
      hasFeatureCapability(context, "create"),
    import:
      Boolean(configFeatures.import) &&
      implementationReady &&
      hasFeatureCapability(context, "import"),
    send:
      Boolean(configFeatures.send) &&
      implementationReady &&
      hasFeatureCapability(context, "send"),
    receive:
      Boolean(configFeatures.receive) &&
      implementationReady &&
      hasFeatureCapability(context, "receive"),
    qr:
      Boolean(configFeatures.qr) &&
      implementationReady &&
      hasFeatureCapability(context, "qr"),
    explorer:
      Boolean(configFeatures.explorer) &&
      implementationReady &&
      hasExplorerSupport(context, network),
    history:
      Boolean(configFeatures.history) &&
      implementationReady &&
      hasFeatureCapability(context, "history"),
    internalTransfer:
      Boolean(configFeatures.internalTransfer) &&
      implementationReady &&
      hasFeatureCapability(context, "internalTransfer"),
  };
}

function getRuntimeChainToggles(chainCode, networkCode) {
  const chain = getChainConfig(chainCode);
  if (!chain) {
    return null;
  }

  return getConfigChainToggles(chain.code, networkCode || chain.defaultNetwork);
}

function assertSupportedChainNetwork(chainCode, networkCode) {
  try {
    const resolvedChain = assertConfiguredSupportedChainNetwork(chainCode, networkCode);
    const context = getChainContext(resolvedChain.code);

    if (!isNetworkEnabled(context.chain, resolvedChain.network)) {
      const allowedNetworks = getChainNetworkCodes(context.chain).join(", ");
      throw AppError.validation(
        `Network "${resolvedChain.network}" is not available for chain "${context.chain}" in the current runtime. Allowed networks: ${allowedNetworks}`,
      );
    }

    return {
      ...context,
      network: resolvedChain.network,
      features: getRuntimeChainFeatures(context.chain, resolvedChain.network),
      toggles: getRuntimeChainToggles(context.chain, resolvedChain.network),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw AppError.validation(error.message);
  }
}

function assertChainFeature(chainCode, networkCode, feature) {
  const normalizedFeature = String(feature || "").trim();
  const context = assertSupportedChainNetwork(chainCode, networkCode);
  const features = context.features || {};
  const toggles = context.toggles || {};

  if (toggles.maintenance) {
    throw AppError.validation(
      `Chain "${context.chain}" on "${context.network}" is currently under maintenance`,
    );
  }

  const toggleKey = FEATURE_TOGGLE_KEY_MAP[normalizedFeature];
  if (toggleKey && toggles[toggleKey] === false) {
    throw AppError.validation(
      `${getFeatureLabel(normalizedFeature)} is currently disabled for chain "${context.chain}" on "${context.network}"`,
    );
  }

  if (features[normalizedFeature] !== true) {
    throw AppError.validation(
      `${getFeatureLabel(normalizedFeature)} is not available for chain "${context.chain}" on "${context.network}"`,
    );
  }

  return context;
}

function withRuntimeChainNetworkFilter(
  filter = {},
  { chainField = "chain", networkField = "network" } = {},
) {
  const runtimeFilter = buildRuntimeChainNetworkFilter({ chainField, networkField });
  if (!filter || !Object.keys(filter).length) {
    return runtimeFilter;
  }

  return {
    $and: [filter, runtimeFilter],
  };
}

function listChainContexts() {
  return getEnabledChainCodes()
    .filter((chainCode) => !runtimeState.isChainDisabled(chainCode))
    .filter((chainCode) => chainRegistry.hasAdapter(chainCode))
    .map((chainCode) => getChainContext(chainCode));
}

function listImplementedChainContexts() {
  return listChainContexts().filter((context) => isImplementedChainContext(context));
}

function listSupportedChainMetadata() {
  return listImplementedChainContexts().map((context) => ({
    ...context.metadata,
    supportedNetworks: context.supportedNetworks,
    explorer: context.explorer,
    features: context.features,
    toggles: context.toggles,
    enabled: true,
    nativeAsset: buildNativeAssetDescriptor(context.chain, context.chainConfig.defaultNetwork),
    tokens: context.supportedNetworks.flatMap((network) =>
      listSupportedTokenMetadata(context.chain, network.code)),
    assets: context.supportedNetworks.flatMap((network) =>
      listSupportedAssetMetadata(context.chain, network.code)),
  }));
}

function listAutoProvisionTargets(feature) {
  const normalizedFeature = normalizeProvisioningFeature(feature);
  const targets = listImplementedChainContexts().flatMap((context, chainIndex) => {
    const provisioning = getChainProvisioningConfig(context.chain);
    const shouldAutoProvision =
      provisioning.autoProvision !== false ||
      (normalizedFeature === "import" && provisioning.autoProvisionImport === true);

    if (!shouldAutoProvision) {
      return [];
    }

    const configuredTargets =
      Array.isArray(provisioning.targets) && provisioning.targets.length
        ? provisioning.targets
        : provisioning.networks.map((network, networkIndex) => ({
            chain: context.chain,
            network,
            priority: networkIndex,
          }));

    return configuredTargets
      .filter((target) => isNetworkEnabled(context.chain, target.network))
      .filter((target) => {
        if (!normalizedFeature) {
          return true;
        }

        const features = getRuntimeChainFeatures(context.chain, target.network);
        const toggles = getRuntimeChainToggles(context.chain, target.network);
        const toggleKey = FEATURE_TOGGLE_KEY_MAP[normalizedFeature];

        if (!features || features[normalizedFeature] !== true) {
          return false;
        }

        if (toggles?.maintenance) {
          return false;
        }

        return !toggleKey || toggles?.[toggleKey] !== false;
      })
      .map((target, targetIndex) => ({
        chain: context.chain,
        network: target.network,
        priority:
          (Number(provisioning.priority) || 0) * 1000 +
          (Number(target.priority) || targetIndex) +
          chainIndex,
      }));
  });

  return targets.sort((a, b) => {
    if ((a.priority || 0) !== (b.priority || 0)) {
      return (a.priority || 0) - (b.priority || 0);
    }

    return `${a.chain}:${a.network}`.localeCompare(`${b.chain}:${b.network}`);
  });
}

module.exports = {
  defaultChain,
  getEnabledChains,
  getEnabledChainCodes,
  getEnabledNetworks,
  getChainConfig,
  getNetworkConfig,
  getChainLabel,
  getNetworkLabel,
  getExecutionParamLabels,
  isChainEnabled,
  isNetworkEnabled,
  getChainContext,
  getChainAssetSymbol,
  getChainFeatures: getRuntimeChainFeatures,
  getChainToggles: getRuntimeChainToggles,
  assertSupportedChain,
  assertSupportedChainNetwork,
  assertChainFeature,
  withRuntimeChainNetworkFilter,
  listChainContexts,
  isImplementedChainContext,
  listImplementedChainContexts,
  listSupportedChainMetadata,
  listAutoProvisionTargets,
};
