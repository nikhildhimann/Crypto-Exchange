const bip39 = require("bip39");
const bitcoin = require("bitcoinjs-lib");
const ecc = require("tiny-secp256k1");
const { BIP32Factory } = require("bip32");
const { ECPairFactory } = require("ecpair");

const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");
const client = require("./client");

bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);
const ACCOUNT_INDEX = 0;
const EXTERNAL_BRANCH = 0;
const CHANGE_BRANCH = 1;
const RECEIVE_ADDRESS_INDEX = 0;
const CHANGE_ADDRESS_INDEX = 0;
const ADDRESS_TYPE = "p2wpkh";
const PURPOSE = 84;
const LITECOIN_NETWORK = Object.freeze({
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
});

function normalizeString(value) {
  return String(value || "").trim();
}

function getCoinType(network) {
  client.normalizeNetwork(network);
  return 2;
}

function getLitecoinNetwork(network) {
  client.normalizeNetwork(network);
  return LITECOIN_NETWORK;
}

function getAccountDerivationPath(network) {
  return `m/${PURPOSE}'/${getCoinType(network)}'/${ACCOUNT_INDEX}'`;
}

function getReceiveDerivationPath(network) {
  return `${getAccountDerivationPath(network)}/${EXTERNAL_BRANCH}/${RECEIVE_ADDRESS_INDEX}`;
}

function getManagedDerivationPath(
  network,
  branch = EXTERNAL_BRANCH,
  addressIndex = RECEIVE_ADDRESS_INDEX,
) {
  return `${getAccountDerivationPath(network)}/${Number(branch)}/${Number(addressIndex)}`;
}

function formatFingerprint(node) {
  if (!node) {
    return "";
  }

  const fingerprint = Buffer.isBuffer(node.fingerprint)
    ? node.fingerprint
    : Buffer.from(node.fingerprint || []);

  return fingerprint.toString("hex");
}

function buildManagedAddressRecord(
  network,
  address,
  derivationPath,
  {
    branch = EXTERNAL_BRANCH,
    addressIndex = RECEIVE_ADDRESS_INDEX,
    purpose = "receive",
    isChange = false,
  } = {},
) {
  return {
    address,
    derivationPath,
    branch,
    addressIndex,
    addressType: ADDRESS_TYPE,
    purpose,
    isActive: true,
    isChange,
    metadata: {
      scriptType: ADDRESS_TYPE,
      network: client.normalizeNetwork(network),
      coinType: getCoinType(network),
      account: ACCOUNT_INDEX,
    },
  };
}

function deriveWalletFromMnemonic(mnemonic, network) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
  const litecoinNetwork = getLitecoinNetwork(normalizedNetwork);
  const root = bip32.fromSeed(seed, litecoinNetwork);
  const accountDerivationPath = getAccountDerivationPath(normalizedNetwork);
  const receiveDerivationPath = getReceiveDerivationPath(normalizedNetwork);
  const accountNode = root.derivePath(accountDerivationPath);
  const childNode = root.derivePath(receiveDerivationPath);
  const publicKeyBuffer = Buffer.from(childNode.publicKey);
  const payment = bitcoin.payments.p2wpkh({
    pubkey: publicKeyBuffer,
    network: litecoinNetwork,
  });

  if (!payment.address) {
    throw AppError.internal("Failed to derive LTC receive address");
  }

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    root,
    accountNode,
    childNode,
    address: payment.address,
    publicKey: publicKeyBuffer.toString("hex"),
    derivationPath: receiveDerivationPath,
    accountDerivationPath,
    accountExtendedPublicKey: accountNode.neutered().toBase58(),
    masterFingerprint: formatFingerprint(root),
  };
}

function deriveManagedAddressFromMnemonic(
  mnemonic,
  network,
  {
    branch = EXTERNAL_BRANCH,
    addressIndex = RECEIVE_ADDRESS_INDEX,
    purpose = "receive",
    isChange = branch === CHANGE_BRANCH,
  } = {},
) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
  const litecoinNetwork = getLitecoinNetwork(normalizedNetwork);
  const root = bip32.fromSeed(seed, litecoinNetwork);
  const accountDerivationPath = getAccountDerivationPath(normalizedNetwork);
  const derivationPath = getManagedDerivationPath(
    normalizedNetwork,
    branch,
    addressIndex,
  );
  const accountNode = root.derivePath(accountDerivationPath);
  const childNode = root.derivePath(derivationPath);
  const publicKeyBuffer = Buffer.from(childNode.publicKey);
  const payment = bitcoin.payments.p2wpkh({
    pubkey: publicKeyBuffer,
    network: litecoinNetwork,
  });

  if (!payment.address) {
    throw AppError.internal("Failed to derive LTC managed address");
  }

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    root,
    accountNode,
    childNode,
    address: payment.address,
    publicKey: publicKeyBuffer.toString("hex"),
    derivationPath,
    accountDerivationPath,
    accountExtendedPublicKey: accountNode.neutered().toBase58(),
    masterFingerprint: formatFingerprint(root),
    managedAddress: buildManagedAddressRecord(
      normalizedNetwork,
      payment.address,
      derivationPath,
      {
        branch,
        addressIndex,
        purpose,
        isChange,
      },
    ),
  };
}

function normalizeAddress(address, network = client.DEFAULT_NETWORK) {
  const normalizedAddress = normalizeString(address);
  if (!normalizedAddress) {
    throw AppError.validation("Invalid LTC address");
  }

  const normalizedNetwork = client.normalizeNetwork(network);

  try {
    const decoded = bitcoin.address.fromBech32(normalizedAddress);
    const canonicalAddress = normalizedAddress.toLowerCase();
    if (
      decoded.version !== 0 ||
      decoded.data.length !== 20 ||
      decoded.prefix !== getLitecoinNetwork(normalizedNetwork).bech32
    ) {
      throw AppError.validation("Invalid LTC address");
    }

    return canonicalAddress;
  } catch (_error) {
    try {
      const decoded = bitcoin.address.fromBase58Check(normalizedAddress);
      const litecoinNetwork = getLitecoinNetwork(normalizedNetwork);

      if (![litecoinNetwork.pubKeyHash, litecoinNetwork.scriptHash].includes(decoded.version)) {
        throw AppError.validation("Invalid LTC address");
      }

      return normalizedAddress;
    } catch (_nextError) {
      throw AppError.validation("Invalid LTC address");
    }
  }
}

function validateAddress(address, network) {
  try {
    normalizeAddress(address, network);
    return true;
  } catch (_error) {
    return false;
  }
}

function buildWalletMaterial(derived) {
  return {
    mnemonic: derived.mnemonic,
    seed: "",
    address: derived.address,
    publicKey: derived.publicKey,
    derivationPath: derived.derivationPath,
    derivation: {
      path: derived.derivationPath,
      accountPath: derived.accountDerivationPath,
      addressType: ADDRESS_TYPE,
      branch: EXTERNAL_BRANCH,
      addressIndex: RECEIVE_ADDRESS_INDEX,
      purpose: "receive",
      coinType: getCoinType(derived.network),
      account: ACCOUNT_INDEX,
      network: derived.network,
      masterFingerprint: derived.masterFingerprint,
      accountExtendedPublicKey: derived.accountExtendedPublicKey,
    },
    managedAddress: buildManagedAddressRecord(
      derived.network,
      derived.address,
      derived.derivationPath,
      {
        branch: EXTERNAL_BRANCH,
        addressIndex: RECEIVE_ADDRESS_INDEX,
        purpose: "receive",
        isChange: false,
      },
    ),
  };
}

async function createWallet(network, mnemonic) {
  const derived = deriveWalletFromMnemonic(mnemonic, network);
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

  try {
    const pair = ECPair.fromWIF(normalized, getLitecoinNetwork(client.DEFAULT_NETWORK));
    const payment = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(pair.publicKey),
      network: getLitecoinNetwork(client.DEFAULT_NETWORK),
    });

    if (payment.address) {
      return normalizeAddress(payment.address, client.DEFAULT_NETWORK);
    }
  } catch (_error) {
    throw AppError.validation("Invalid LTC wallet secret");
  }

  throw AppError.validation("Invalid LTC wallet secret");
}

async function assignManagedReceiveExecutionParams() {
  return {};
}

async function resolveManagedReceiveExecutionParams() {
  return {};
}

module.exports = {
  ACCOUNT_INDEX,
  EXTERNAL_BRANCH,
  CHANGE_BRANCH,
  RECEIVE_ADDRESS_INDEX,
  CHANGE_ADDRESS_INDEX,
  ADDRESS_TYPE,
  PURPOSE,
  getLitecoinNetwork,
  getAccountDerivationPath,
  getReceiveDerivationPath,
  getManagedDerivationPath,
  normalizeAddress,
  deriveWalletFromMnemonic,
  deriveManagedAddressFromMnemonic,
  createWallet,
  importWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
