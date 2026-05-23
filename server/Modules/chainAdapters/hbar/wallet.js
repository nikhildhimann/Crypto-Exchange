const bip39 = require("bip39");
const { derivePath } = require("ed25519-hd-key");
const { PrivateKey } = require("@hashgraph/sdk");

const { AppError } = require("../../../helpers/errors");
const Wallet = require("../../wallet/model");
const WalletAddress = require("../../wallet/address.model");
const { validateMnemonic } = require("../../security/mnemonic.service");
const client = require("./client");

const DERIVATION_PATH = "m/44'/3030'/0'/0'/0'";
const KEY_TYPE = "ED25519";
const ADDRESS_TYPE_ACCOUNT_ID = "accountId";
const ADDRESS_TYPE_ALIAS = "alias";
const ADDRESS_TYPE_EVM = "evmAddress";
const ACTIVATION_STATUS_PENDING = "pending";
const ACTIVATION_STATUS_ACTIVE = "active";
const ACTIVATION_MODE_USER_FUNDED = "user_funded";
const ACTIVATION_MODE_OPERATOR_FUNDED = "operator_funded";

function normalizeString(value) {
  return String(value || "").trim();
}

function validateCanonicalAccountId(address) {
  try {
    client.normalizeCanonicalAccountId(address);
    return true;
  } catch (_error) {
    return false;
  }
}

function validateAliasAccountId(address) {
  try {
    client.normalizeAliasAccountId(address);
    return true;
  } catch (_error) {
    return false;
  }
}

function validateEvmAddress(address) {
  return /^0x[0-9a-f]{40}$/i.test(normalizeString(address));
}

function validateAddress(address) {
  return validateCanonicalAccountId(address) || validateAliasAccountId(address);
}

async function upsertManagedAddress(walletRecord, network, managedAddress = {}) {
  const address = normalizeString(managedAddress.address);
  if (!walletRecord?._id || !address) {
    return;
  }

  await WalletAddress.updateOne(
    {
      walletId: walletRecord._id,
      address,
    },
    {
      $set: {
        walletId: walletRecord._id,
        userId: walletRecord.userId,
        chain: "hbar",
        network,
        address,
        memo: "",
        derivationPath: normalizeString(managedAddress.derivationPath),
        branch: Number.isFinite(Number(managedAddress.branch))
          ? Number(managedAddress.branch)
          : 0,
        addressIndex: Number.isFinite(Number(managedAddress.addressIndex))
          ? Number(managedAddress.addressIndex)
          : 0,
        addressType: normalizeString(managedAddress.addressType),
        purpose: normalizeString(managedAddress.purpose) || "receive",
        isActive: managedAddress.isActive !== false,
        isChange: managedAddress.isChange === true,
        metadata:
          managedAddress.metadata && typeof managedAddress.metadata === "object"
            ? managedAddress.metadata
            : {},
        status: managedAddress.isActive === false ? "inactive" : "active",
      },
    },
    { upsert: true },
  );
}

async function persistFinalizedWalletMaterial(walletRecord, network, finalizedMaterial) {
  if (!walletRecord?._id || !finalizedMaterial?.address) {
    return walletRecord;
  }

  await Wallet.updateOne(
    { _id: walletRecord._id },
    {
      $set: {
        address: finalizedMaterial.address,
        metadata: finalizedMaterial.metadata,
      },
    },
  );

  const managedAddresses = [
    finalizedMaterial.managedAddress,
    ...(Array.isArray(finalizedMaterial.additionalManagedAddresses)
      ? finalizedMaterial.additionalManagedAddresses
      : []),
  ].filter((entry) => entry && typeof entry === "object");

  for (const managedAddress of managedAddresses) {
    await upsertManagedAddress(walletRecord, network, managedAddress);
  }

  return Wallet.findById(walletRecord._id).lean();
}

async function syncActivationState(walletRecord, network, { allowProvision = false } = {}) {
  if (!walletRecord) {
    return walletRecord;
  }

  const normalizedNetwork = client.normalizeNetwork(network || walletRecord?.network || client.DEFAULT_NETWORK);
  const aliasAccountId = getAliasAccountId(walletRecord);
  const canonicalAccountId = getCanonicalAccountId(walletRecord);

  let resolvedAccount = null;

  if (canonicalAccountId) {
    resolvedAccount = await client.getClient(normalizedNetwork).resolveAccount(canonicalAccountId, {
      allowNotFound: true,
    }).catch(() => null);
  }

  if (!resolvedAccount?.accountId && aliasAccountId) {
    resolvedAccount = await client.getClient(normalizedNetwork).resolveAccount(aliasAccountId, {
      allowNotFound: true,
    }).catch(() => null);
  }

  if (!resolvedAccount?.accountId && (!isPendingActivation(walletRecord) || !allowProvision)) {
    return walletRecord;
  }

  if (!resolvedAccount?.accountId && aliasAccountId && allowProvision) {
    resolvedAccount = await client.getClient(normalizedNetwork).ensureAccountForAlias({
      aliasAccountId,
    });
  }

  if (!resolvedAccount?.accountId) {
    throw AppError.conflict("HBAR receive address could not be resolved to a payable account");
  }

  const finalizedMaterial = buildFinalizedWalletMaterial(
    {
      address: walletRecord.address,
      publicKey: walletRecord.publicKey,
      derivationPath:
        walletRecord.metadata?.derivation?.path || DERIVATION_PATH,
      derivation: walletRecord.metadata?.derivation || {},
      metadata: walletRecord.metadata || {},
    },
    {
      ...resolvedAccount,
      aliasAccountId,
      network: normalizedNetwork,
    },
  );

  const resolvedCanonicalAccountId = normalizeString(resolvedAccount.accountId);
  const persistedCanonicalAccountId = getCanonicalAccountId(walletRecord);
  const persistedActivationStatus = getActivationStatus(walletRecord);
  const persistedAddress = normalizeString(walletRecord.address);
  const persistedActivationAddress = normalizeString(
    walletRecord?.metadata?.activation?.canonicalAddress,
  );
  const needsPersistence =
    !persistedCanonicalAccountId ||
    persistedCanonicalAccountId !== resolvedCanonicalAccountId ||
    persistedActivationStatus !== ACTIVATION_STATUS_ACTIVE ||
    persistedAddress !== resolvedCanonicalAccountId ||
    persistedActivationAddress !== resolvedCanonicalAccountId;

  if (!needsPersistence) {
    return walletRecord;
  }

  return persistFinalizedWalletMaterial(walletRecord, normalizedNetwork, finalizedMaterial);
}

function getActivationStatus(walletOrMetadata = {}) {
  const metadata =
    walletOrMetadata?.metadata && typeof walletOrMetadata.metadata === "object"
      ? walletOrMetadata.metadata
      : walletOrMetadata && typeof walletOrMetadata === "object"
        ? walletOrMetadata
        : {};
  const explicitStatus = normalizeString(metadata.activation?.status);

  if (explicitStatus) {
    return explicitStatus.toLowerCase();
  }

  if (getCanonicalAccountId(walletOrMetadata)) {
    return ACTIVATION_STATUS_ACTIVE;
  }

  if (getAliasAccountId(walletOrMetadata)) {
    return ACTIVATION_STATUS_PENDING;
  }

  return ACTIVATION_STATUS_ACTIVE;
}

function isPendingActivation(walletOrMetadata = {}) {
  return getActivationStatus(walletOrMetadata) === ACTIVATION_STATUS_PENDING;
}

function getAliasAccountId(walletOrMetadata = {}) {
  const metadata =
    walletOrMetadata?.metadata && typeof walletOrMetadata.metadata === "object"
      ? walletOrMetadata.metadata
      : walletOrMetadata && typeof walletOrMetadata === "object"
        ? walletOrMetadata
        : {};
  const candidates = [
    metadata.activation?.aliasAddress,
    metadata.aliasAccountId,
    metadata.derivation?.aliasAccountId,
    walletOrMetadata?.address,
  ];

  for (const candidate of candidates) {
    try {
      return client.normalizeAliasAccountId(candidate);
    } catch (_error) {
      continue;
    }
  }

  return null;
}

function getCanonicalAccountId(walletOrMetadata = {}) {
  const metadata =
    walletOrMetadata?.metadata && typeof walletOrMetadata.metadata === "object"
      ? walletOrMetadata.metadata
      : walletOrMetadata && typeof walletOrMetadata === "object"
        ? walletOrMetadata
        : {};
  const candidates = [
    metadata.activation?.canonicalAddress,
    metadata.canonicalAccountId,
    metadata.derivation?.canonicalAccountId,
    walletOrMetadata?.address,
  ];

  for (const candidate of candidates) {
    try {
      return client.normalizeCanonicalAccountId(candidate);
    } catch (_error) {
      continue;
    }
  }

  return null;
}

function buildManagedIdentifier(
  address,
  derivationPath,
  {
    addressType = ADDRESS_TYPE_ACCOUNT_ID,
    purpose = "receive",
    metadata = {},
  } = {},
) {
  const normalizedAddress = normalizeString(address);
  if (!normalizedAddress) {
    return null;
  }

  return {
    address: normalizedAddress,
    derivationPath,
    branch: 0,
    addressIndex: 0,
    addressType,
    purpose,
    isActive: true,
    isChange: false,
    metadata,
  };
}

function buildPendingActivationMetadata(baseMetadata = {}, aliasAccountId) {
  const existingActivation =
    baseMetadata.activation && typeof baseMetadata.activation === "object"
      ? baseMetadata.activation
      : {};

  return {
    ...(baseMetadata && typeof baseMetadata === "object" ? baseMetadata : {}),
    identifierType: ADDRESS_TYPE_ALIAS,
    canonicalAccountId: null,
    aliasAccountId,
    evmAddress: null,
    activation: {
      ...existingActivation,
      mode: ACTIVATION_MODE_USER_FUNDED,
      status: ACTIVATION_STATUS_PENDING,
      aliasAddress: aliasAccountId,
      canonicalAddress: null,
      displayAddress: aliasAccountId,
      pendingSince: existingActivation.pendingSince || new Date(),
      lastReason: existingActivation.lastReason || "awaiting_first_user_deposit",
    },
  };
}

function buildPendingWalletMaterial(baseMaterial = {}) {
  const derivationPath = normalizeString(
    baseMaterial?.derivationPath || baseMaterial?.derivation?.path || DERIVATION_PATH,
  );
  const aliasAccountId = getAliasAccountId(baseMaterial);

  if (!aliasAccountId) {
    throw AppError.validation("HBAR alias account identifier is required for pending activation");
  }

  return {
    ...baseMaterial,
    address: aliasAccountId,
    derivationPath,
    derivation: {
      ...(baseMaterial.derivation || {}),
      path: derivationPath,
      keyType: KEY_TYPE,
      aliasAccountId,
      canonicalAccountId: null,
      evmAddress: null,
      accountCreatedOnNetwork: false,
      activationStatus: ACTIVATION_STATUS_PENDING,
    },
    metadata: buildPendingActivationMetadata(baseMaterial.metadata || {}, aliasAccountId),
    managedAddress: buildManagedIdentifier(aliasAccountId, derivationPath, {
      addressType: ADDRESS_TYPE_ALIAS,
      purpose: "receive",
      metadata: {
        keyType: KEY_TYPE,
        identifierType: ADDRESS_TYPE_ALIAS,
        canonicalAccountId: null,
        aliasAccountId,
        evmAddress: null,
        activationStatus: ACTIVATION_STATUS_PENDING,
      },
    }),
    additionalManagedAddresses: [],
  };
}

function deriveWalletFromMnemonic(mnemonic, network) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
  const derived = derivePath(DERIVATION_PATH, seed.toString("hex"));
  const privateKey = PrivateKey.fromBytesED25519(derived.key);
  const publicKey = privateKey.publicKey;
  const aliasAccountId = publicKey.toAccountId(0, 0).toString();

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    privateKey,
    publicKey,
    publicKeyRaw: publicKey.toStringRaw(),
    publicKeyDer: publicKey.toStringDer(),
    privateKeyRaw: privateKey.toStringRaw(),
    privateKeyDer: privateKey.toStringDer(),
    aliasAccountId,
    address: aliasAccountId,
    derivationPath: DERIVATION_PATH,
  };
}

function buildDerivedWalletMaterial(derived) {
  return buildPendingWalletMaterial({
    mnemonic: derived.mnemonic,
    seed: "",
    address: derived.aliasAccountId,
    publicKey: derived.publicKeyRaw,
    derivationPath: derived.derivationPath,
    derivation: {
      path: derived.derivationPath,
      keyType: KEY_TYPE,
      network: derived.network,
      aliasAccountId: derived.aliasAccountId,
      publicKeyRaw: derived.publicKeyRaw,
      publicKeyDer: derived.publicKeyDer,
    },
    metadata: {
      identifierType: ADDRESS_TYPE_ALIAS,
      canonicalAccountId: null,
      aliasAccountId: derived.aliasAccountId,
      evmAddress: null,
      activation: {
        mode: ACTIVATION_MODE_USER_FUNDED,
        status: ACTIVATION_STATUS_PENDING,
        aliasAddress: derived.aliasAccountId,
        canonicalAddress: null,
        displayAddress: derived.aliasAccountId,
        lastReason: "awaiting_first_user_deposit",
      },
    },
  });
}

function buildFinalizedWalletMaterial(baseMaterial, accountInfo = {}) {
  const canonicalAccountId = normalizeString(accountInfo.accountId);
  if (!validateCanonicalAccountId(canonicalAccountId)) {
    throw AppError.conflict("HBAR provisioning did not resolve a canonical account ID");
  }

  const aliasAccountId = normalizeString(
    accountInfo.aliasAccountId ||
      accountInfo.alias ||
      baseMaterial?.derivation?.aliasAccountId,
  );
  const evmAddress = normalizeString(accountInfo.evmAddress);
  const derivationPath = normalizeString(
    baseMaterial?.derivationPath || baseMaterial?.derivation?.path || DERIVATION_PATH,
  );
  const activationMode =
    normalizeString(accountInfo.activationMode) ||
    (accountInfo.creationTransactionId
      ? ACTIVATION_MODE_OPERATOR_FUNDED
      : ACTIVATION_MODE_USER_FUNDED);
  const activationReason =
    normalizeString(accountInfo.activationReason) ||
    (accountInfo.creationTransactionId
      ? "created_during_wallet_provisioning"
      : "activated_by_incoming_deposit");
  const publicKeyRaw = normalizeString(
    accountInfo.publicKey ||
      baseMaterial?.derivation?.publicKeyRaw ||
      baseMaterial?.publicKey,
  );
  const identifierMetadata = {
    keyType: KEY_TYPE,
    canonicalAccountId,
    aliasAccountId: aliasAccountId || null,
    evmAddress: evmAddress || null,
  };
  const managedAddress = buildManagedIdentifier(canonicalAccountId, derivationPath, {
    addressType: ADDRESS_TYPE_ACCOUNT_ID,
    purpose: "receive",
    metadata: {
      ...identifierMetadata,
      identifierType: ADDRESS_TYPE_ACCOUNT_ID,
    },
  });
  const additionalManagedAddresses = [];

  if (aliasAccountId && aliasAccountId !== canonicalAccountId) {
    additionalManagedAddresses.push(
      buildManagedIdentifier(aliasAccountId, derivationPath, {
        addressType: ADDRESS_TYPE_ALIAS,
        purpose: "alias",
        metadata: {
          ...identifierMetadata,
          identifierType: ADDRESS_TYPE_ALIAS,
        },
      }),
    );
  }

  if (evmAddress && validateEvmAddress(evmAddress)) {
    additionalManagedAddresses.push(
      buildManagedIdentifier(evmAddress, derivationPath, {
        addressType: ADDRESS_TYPE_EVM,
        purpose: "alias",
        metadata: {
          ...identifierMetadata,
          identifierType: ADDRESS_TYPE_EVM,
        },
      }),
    );
  }

  return {
    ...baseMaterial,
    address: canonicalAccountId,
    derivationPath,
    derivation: {
      ...(baseMaterial.derivation || {}),
      path: derivationPath,
      keyType: KEY_TYPE,
      network: accountInfo.network || baseMaterial?.derivation?.network || client.DEFAULT_NETWORK,
      canonicalAccountId,
      aliasAccountId: aliasAccountId || null,
      evmAddress: evmAddress || null,
      publicKeyRaw: publicKeyRaw || null,
      accountCreatedOnNetwork: true,
      activationStatus: ACTIVATION_STATUS_ACTIVE,
    },
    metadata: {
      ...(baseMaterial.metadata && typeof baseMaterial.metadata === "object"
        ? baseMaterial.metadata
        : {}),
      keyType: KEY_TYPE,
      identifierType: ADDRESS_TYPE_ACCOUNT_ID,
      canonicalAccountId,
      aliasAccountId: aliasAccountId || null,
      evmAddress: evmAddress || null,
      publicKey: publicKeyRaw || null,
      accountCreatedOnNetwork: true,
      creationTransactionId: accountInfo.creationTransactionId || null,
      activation: {
        ...(baseMaterial.metadata?.activation &&
        typeof baseMaterial.metadata.activation === "object"
          ? baseMaterial.metadata.activation
          : {}),
        mode: activationMode,
        status: ACTIVATION_STATUS_ACTIVE,
        aliasAddress: aliasAccountId || null,
        canonicalAddress: canonicalAccountId,
        displayAddress: canonicalAccountId,
        activatedAt: new Date(),
        lastReason: activationReason,
      },
    },
    managedAddress,
    additionalManagedAddresses,
  };
}

async function finalizeProvisioningMaterial(input = {}) {
  const normalizedNetwork = client.normalizeNetwork(input.network || client.DEFAULT_NETWORK);
  const material = buildPendingWalletMaterial(input.material || {});
  const aliasAccountId = client.normalizeAliasAccountId(
    material?.derivation?.aliasAccountId || material.address,
  );
  const hbarClient = client.getClient(normalizedNetwork);
  const accountInfo = await hbarClient.resolveAccount(aliasAccountId, {
    allowNotFound: true,
  });

  if (accountInfo?.accountId) {
    return buildFinalizedWalletMaterial(material, {
      ...accountInfo,
      aliasAccountId,
      network: normalizedNetwork,
      activationMode: "active_existing_account",
      activationReason: "resolved_existing_account",
    });
  }

  const createdAccount = await hbarClient.createAccountFromPublicKey({
    publicKey:
      material?.derivation?.publicKeyRaw ||
      material?.publicKey,
    aliasAccountId,
  });

  return buildFinalizedWalletMaterial(material, {
    ...createdAccount,
    aliasAccountId,
    network: normalizedNetwork,
  });
}

async function createWallet(network, mnemonic) {
  return buildDerivedWalletMaterial(deriveWalletFromMnemonic(mnemonic, network));
}

function importWalletFromMnemonic(mnemonic, network) {
  return createWallet(network, mnemonic);
}

function normalizePrivateKeySecret(secret) {
  const normalized = normalizeString(secret);
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  const candidates = [
    () => PrivateKey.fromString(normalized),
    () => PrivateKey.fromStringDer(normalized),
    () => PrivateKey.fromStringED25519(normalized),
  ];

  for (const candidate of candidates) {
    try {
      return candidate();
    } catch (_error) {
      continue;
    }
  }

  throw AppError.validation("Invalid HBAR wallet secret");
}

async function resolveAddressFromSecret(secret) {
  const normalized = normalizeString(secret);
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  const normalizedNetwork = client.DEFAULT_NETWORK;

  if (normalized.includes(" ")) {
    const material = await importWalletFromMnemonic(normalized, normalizedNetwork);
    const existingAccount = await client.getClient(normalizedNetwork).resolveAccount(
      material.derivation.aliasAccountId,
      { allowNotFound: true },
    );

    return existingAccount?.accountId || material.derivation.aliasAccountId;
  }

  const privateKey = normalizePrivateKeySecret(normalized);
  const aliasAccountId = privateKey.publicKey.toAccountId(0, 0).toString();
  const existingAccount = await client.getClient(normalizedNetwork).resolveAccount(
    aliasAccountId,
    { allowNotFound: true },
  );

  return existingAccount?.accountId || aliasAccountId;
}

async function resolveReceiveAddress(input = {}) {
  const finalizedWallet = await syncActivationState(
    input.wallet,
    input.network || input.wallet?.network,
    { allowProvision: true },
  );

  if (finalizedWallet && input.wallet && typeof input.wallet === "object") {
    input.wallet.address = finalizedWallet.address;
    input.wallet.metadata = finalizedWallet.metadata || input.wallet.metadata;
  }

  return (
    getCanonicalAccountId(finalizedWallet || input.wallet) ||
    normalizeString(finalizedWallet?.address || input.wallet?.address || "")
  );
}

async function assignManagedReceiveExecutionParams() {
  return {};
}

async function resolveManagedReceiveExecutionParams() {
  return {};
}

module.exports = {
  DERIVATION_PATH,
  KEY_TYPE,
  ADDRESS_TYPE_ACCOUNT_ID,
  ADDRESS_TYPE_ALIAS,
  ADDRESS_TYPE_EVM,
  deriveWalletFromMnemonic,
  buildFinalizedWalletMaterial,
  buildPendingWalletMaterial,
  validateCanonicalAccountId,
  validateAliasAccountId,
  validateEvmAddress,
  validateAddress,
  getActivationStatus,
  isPendingActivation,
  getAliasAccountId,
  getCanonicalAccountId,
  createWallet,
  importWalletFromMnemonic,
  finalizeProvisioningMaterial,
  normalizePrivateKeySecret,
  resolveAddressFromSecret,
  syncActivationState,
  resolveReceiveAddress,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
