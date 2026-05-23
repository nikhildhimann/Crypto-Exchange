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
const ADDRESS_TYPE = "p2pkh";
const PURPOSE = 44;
const COIN_TYPE = 3;

const DOGE_MAINNET = {
  messagePrefix: "\u0019Dogecoin Signed Message:\n",
  bech32: "doge",
  bip32: {
    public: 0x02facafd,
    private: 0x02fac398,
  },
  pubKeyHash: 0x1e,
  scriptHash: 0x16,
  wif: 0x9e,
};

function getDogeNetwork(network) {
  const normalizedNetwork = client.normalizeNetwork(network);
  if (normalizedNetwork !== "mainnet") {
    throw AppError.validation(`Unsupported DOGE network "${network}"`);
  }
  return DOGE_MAINNET;
}

function getAccountDerivationPath(network) {
  client.normalizeNetwork(network);
  return `m/${PURPOSE}'/${COIN_TYPE}'/${ACCOUNT_INDEX}'`;
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
      coinType: COIN_TYPE,
      account: ACCOUNT_INDEX,
    },
  };
}

function deriveAddressFromNode(node, network) {
  const payment = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(node.publicKey),
    network: getDogeNetwork(network),
  });

  if (!payment.address) {
    throw AppError.internal("Failed to derive DOGE address");
  }

  return payment.address;
}

function deriveWalletFromMnemonic(mnemonic, network) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
  const dogeNetwork = getDogeNetwork(normalizedNetwork);
  const root = bip32.fromSeed(seed, dogeNetwork);
  const accountDerivationPath = getAccountDerivationPath(normalizedNetwork);
  const receiveDerivationPath = getReceiveDerivationPath(normalizedNetwork);
  const accountNode = root.derivePath(accountDerivationPath);
  const childNode = root.derivePath(receiveDerivationPath);
  const publicKeyBuffer = Buffer.from(childNode.publicKey);
  const address = deriveAddressFromNode(childNode, normalizedNetwork);

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    root,
    accountNode,
    childNode,
    address,
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
  const dogeNetwork = getDogeNetwork(normalizedNetwork);
  const root = bip32.fromSeed(seed, dogeNetwork);
  const accountDerivationPath = getAccountDerivationPath(normalizedNetwork);
  const derivationPath = getManagedDerivationPath(
    normalizedNetwork,
    branch,
    addressIndex,
  );
  const accountNode = root.derivePath(accountDerivationPath);
  const childNode = root.derivePath(derivationPath);
  const publicKeyBuffer = Buffer.from(childNode.publicKey);
  const address = deriveAddressFromNode(childNode, normalizedNetwork);

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    root,
    accountNode,
    childNode,
    address,
    publicKey: publicKeyBuffer.toString("hex"),
    derivationPath,
    accountDerivationPath,
    accountExtendedPublicKey: accountNode.neutered().toBase58(),
    masterFingerprint: formatFingerprint(root),
    managedAddress: buildManagedAddressRecord(
      normalizedNetwork,
      address,
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

function validateAddress(address, network = "mainnet") {
  const normalizedAddress = String(address || "").trim();
  if (!normalizedAddress) {
    return false;
  }

  try {
    bitcoin.address.toOutputScript(normalizedAddress, getDogeNetwork(network));
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
      coinType: COIN_TYPE,
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
  const changeDerived = deriveManagedAddressFromMnemonic(mnemonic, network, {
    branch: CHANGE_BRANCH,
    addressIndex: CHANGE_ADDRESS_INDEX,
    purpose: "change",
    isChange: true,
  });

  return {
    ...buildWalletMaterial(derived),
    additionalManagedAddresses: [
      changeDerived.managedAddress,
    ].filter(Boolean),
  };
}

function importWalletFromMnemonic(mnemonic, network) {
  return createWallet(network, mnemonic);
}

async function resolveAddressFromSecret(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return (await importWalletFromMnemonic(normalized, "mainnet")).address;
  }

  try {
    const pair = ECPair.fromWIF(normalized, getDogeNetwork("mainnet"));
    const payment = bitcoin.payments.p2pkh({
      pubkey: Buffer.from(pair.publicKey),
      network: getDogeNetwork("mainnet"),
    });

    if (payment.address) {
      return payment.address;
    }
  } catch (_error) {
    // ignore
  }

  throw AppError.validation("Invalid DOGE wallet secret");
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
  COIN_TYPE,
  getDogeNetwork,
  getAccountDerivationPath,
  getReceiveDerivationPath,
  getManagedDerivationPath,
  deriveWalletFromMnemonic,
  deriveManagedAddressFromMnemonic,
  createWallet,
  importWalletFromMnemonic,
  validateAddress,
  resolveAddressFromSecret,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
