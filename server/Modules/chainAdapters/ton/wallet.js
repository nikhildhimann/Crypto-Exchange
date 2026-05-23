const { mnemonicToPrivateKey } = require("@ton/crypto");
const { Address, WalletContractV4 } = require("@ton/ton");

const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");
const client = require("./client");

const KEY_TYPE = "ED25519";
const ADDRESS_TYPE = "wallet-contract-v4";
const DEFAULT_WORKCHAIN = 0;
const DERIVATION_LABEL = "ton-mnemonic";
const DISPLAY_ADDRESS_BOUNCEABLE = false;
const DISPLAY_ADDRESS_TEST_ONLY = false;

function normalizeString(value) {
  return String(value || "").trim();
}

function isRawTonAddress(value) {
  return /^[+-]?\d+:[0-9a-fA-F]{64}$/.test(normalizeString(value));
}

function parseTonAddress(address, network = client.DEFAULT_NETWORK) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedAddress = normalizeString(address);

  if (!normalizedAddress) {
    throw AppError.validation("Invalid TON address");
  }

  try {
    if (isRawTonAddress(normalizedAddress)) {
      const parsedRawAddress = Address.parseRaw(normalizedAddress);

      return {
        network: normalizedNetwork,
        address: parsedRawAddress,
        raw: parsedRawAddress.toRawString(),
        isBounceable: null,
        isTestOnly: false,
        isFriendly: false,
      };
    }

    const friendly = Address.parseFriendly(normalizedAddress);

    if (friendly.isTestOnly && normalizedNetwork === "mainnet") {
      throw AppError.validation("TON testnet addresses are not supported on mainnet");
    }

    return {
        network: normalizedNetwork,
        address: friendly.address,
        raw: friendly.address.toRawString(),
        isBounceable: friendly.isBounceable,
        isTestOnly: friendly.isTestOnly,
        isFriendly: true,
      };
  } catch (_error) {
    throw AppError.validation("Invalid TON address");
  }
}

function normalizeAddress(address, network = client.DEFAULT_NETWORK) {
  return parseTonAddress(address, network).raw;
}

function toUserFriendlyAddress(
  address,
  {
    bounceable = DISPLAY_ADDRESS_BOUNCEABLE,
    testOnly = DISPLAY_ADDRESS_TEST_ONLY,
    network = client.DEFAULT_NETWORK,
  } = {},
) {
  const parsed = parseTonAddress(address, network);

  return parsed.address.toString({
    urlSafe: true,
    bounceable,
    testOnly,
  });
}

function getAddressFormats(address, network = client.DEFAULT_NETWORK) {
  const parsed = parseTonAddress(address, network);
  const bounceable = parsed.address.toString({
    urlSafe: true,
    bounceable: true,
    testOnly: false,
  });
  const nonBounceable = parsed.address.toString({
    urlSafe: true,
    bounceable: false,
    testOnly: false,
  });

  return {
    raw: parsed.raw,
    canonical: parsed.raw,
    display: nonBounceable,
    bounceable,
    nonBounceable,
    isFriendlyInput: parsed.isFriendly,
    isBounceableInput: parsed.isBounceable,
    isTestOnlyInput: parsed.isTestOnly,
  };
}

function formatDisplayAddress(address, network = client.DEFAULT_NETWORK) {
  return getAddressFormats(address, network).display;
}

function validateAddress(address, network) {
  try {
    normalizeAddress(address, network);
    return true;
  } catch (_error) {
    return false;
  }
}

function buildManagedAddressRecord(address, derivationPath, metadata = {}) {
  return {
    address,
    derivationPath,
    branch: 0,
    addressIndex: 0,
    addressType: ADDRESS_TYPE,
    purpose: "receive",
    isActive: true,
    isChange: false,
    metadata,
  };
}

function buildFriendlyManagedAddresses(rawAddress, derivationPath, network) {
  const formats = getAddressFormats(rawAddress, network);
  const bounceableAddress = formats.bounceable;
  const nonBounceableAddress = formats.nonBounceable;
  const managedAddresses = [];

  if (bounceableAddress !== rawAddress) {
    managedAddresses.push(
      buildManagedAddressRecord(bounceableAddress, derivationPath, {
        format: "user-friendly",
        bounceable: true,
        network,
      }),
    );
  }

  if (nonBounceableAddress !== rawAddress && nonBounceableAddress !== bounceableAddress) {
    managedAddresses.push(
      buildManagedAddressRecord(nonBounceableAddress, derivationPath, {
        format: "user-friendly",
        bounceable: false,
        network,
      }),
    );
  }

  return {
    bounceableAddress,
    nonBounceableAddress,
    managedAddresses,
  };
}

async function deriveWalletFromMnemonic(mnemonic, network) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedMnemonic = validateMnemonic(mnemonic).toLowerCase();
  const words = normalizedMnemonic.split(" ").filter(Boolean);
  const keyPair = await mnemonicToPrivateKey(words);
  const contract = WalletContractV4.create({
    workchain: DEFAULT_WORKCHAIN,
    publicKey: keyPair.publicKey,
  });
  const rawAddress = contract.address.toRawString();
  const derivationPath = DERIVATION_LABEL;
  const formats = getAddressFormats(rawAddress, normalizedNetwork);
  const friendly = buildFriendlyManagedAddresses(rawAddress, derivationPath, normalizedNetwork);

  return {
    mnemonic: normalizedMnemonic,
    seed: "",
    network: normalizedNetwork,
    address: formats.raw,
    publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
    derivationPath,
    keyType: KEY_TYPE,
    addressType: ADDRESS_TYPE,
    workchain: DEFAULT_WORKCHAIN,
    walletVersion: "v4",
    walletContract: contract,
    bounceableAddress: friendly.bounceableAddress,
    nonBounceableAddress: friendly.nonBounceableAddress,
    displayAddress: formats.display,
    additionalManagedAddresses: friendly.managedAddresses,
  };
}

async function deriveSigningWalletFromMnemonic(mnemonic, network) {
  const derived = await deriveWalletFromMnemonic(mnemonic, network);
  const words = derived.mnemonic.split(" ").filter(Boolean);
  const keyPair = await mnemonicToPrivateKey(words);

  return {
    ...derived,
    secretKey: keyPair.secretKey,
  };
}

function buildWalletMaterial(derived) {
  return {
    mnemonic: derived.mnemonic,
    seed: derived.seed,
    address: derived.address,
    publicKey: derived.publicKey,
    derivationPath: derived.derivationPath,
    derivation: {
      path: derived.derivationPath,
      keyType: derived.keyType,
      addressType: derived.addressType,
      network: derived.network,
      workchain: derived.workchain,
      walletVersion: derived.walletVersion,
    },
    metadata: {
      keyType: derived.keyType,
      addressType: derived.addressType,
      network: derived.network,
      workchain: derived.workchain,
      canonicalAddress: derived.address,
      bounceableAddress: derived.bounceableAddress,
      nonBounceableAddress: derived.nonBounceableAddress,
      displayAddress: derived.displayAddress,
      walletVersion: derived.walletVersion,
      publicKey: derived.publicKey,
      addressFormats: {
        raw: derived.address,
        bounceable: derived.bounceableAddress,
        nonBounceable: derived.nonBounceableAddress,
        display: derived.displayAddress,
      },
    },
    managedAddress: buildManagedAddressRecord(derived.address, derived.derivationPath, {
      format: "canonical-raw",
      bounceable: null,
      network: derived.network,
    }),
    additionalManagedAddresses: derived.additionalManagedAddresses,
  };
}

async function createWallet(network, mnemonic) {
  const derived = await deriveWalletFromMnemonic(mnemonic, network);
  return buildWalletMaterial(derived);
}

function importWalletFromMnemonic(mnemonic, network) {
  return createWallet(network, mnemonic);
}

async function resolveAddressFromSecret(secret) {
  const normalized = normalizeString(secret);

  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return (await importWalletFromMnemonic(normalized, client.DEFAULT_NETWORK)).address;
  }

  throw AppError.validation("Invalid TON wallet secret");
}

async function assignManagedReceiveExecutionParams() {
  return {};
}

async function resolveManagedReceiveExecutionParams() {
  return {};
}

async function resolveReceiveAddress({ wallet, network } = {}) {
  const sourceAddress = wallet?.address || "";
  return formatDisplayAddress(sourceAddress, network || wallet?.network || client.DEFAULT_NETWORK);
}

module.exports = {
  KEY_TYPE,
  ADDRESS_TYPE,
  DEFAULT_WORKCHAIN,
  DERIVATION_LABEL,
  DISPLAY_ADDRESS_BOUNCEABLE,
  DISPLAY_ADDRESS_TEST_ONLY,
  parseTonAddress,
  getAddressFormats,
  formatDisplayAddress,
  normalizeAddress,
  toUserFriendlyAddress,
  deriveWalletFromMnemonic,
  deriveSigningWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  createWallet,
  importWalletFromMnemonic,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
  resolveReceiveAddress,
};
