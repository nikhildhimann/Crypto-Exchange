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

function getCoinType(network) {
  return client.normalizeNetwork(network) === "mainnet" ? 0 : 1;
}

function getBitcoinNetwork(network) {
  return client.normalizeNetwork(network) === "mainnet"
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;
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
  const bitcoinNetwork = getBitcoinNetwork(normalizedNetwork);
  const root = bip32.fromSeed(seed, bitcoinNetwork);
  const accountDerivationPath = getAccountDerivationPath(normalizedNetwork);
  const receiveDerivationPath = getReceiveDerivationPath(normalizedNetwork);
  const accountNode = root.derivePath(accountDerivationPath);
  const childNode = root.derivePath(receiveDerivationPath);
  const publicKeyBuffer = Buffer.from(childNode.publicKey);
  const payment = bitcoin.payments.p2wpkh({
    pubkey: publicKeyBuffer,
    network: bitcoinNetwork,
  });

  if (!payment.address) {
    throw AppError.internal("Failed to derive BTC receive address");
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
  const bitcoinNetwork = getBitcoinNetwork(normalizedNetwork);
  const root = bip32.fromSeed(seed, bitcoinNetwork);
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
    network: bitcoinNetwork,
  });

  if (!payment.address) {
    throw AppError.internal("Failed to derive BTC managed address");
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

function validateAddressForNetwork(address, network) {
  const normalizedAddress = String(address || "").trim();
  if (!normalizedAddress) {
    return false;
  }

  try {
    const decoded = bitcoin.address.fromBech32(normalizedAddress);
    const normalizedNetwork = network ? client.normalizeNetwork(network) : "";
    const expectedPrefix =
      normalizedNetwork === "mainnet" ? "bc" : normalizedNetwork === "testnet" ? "tb" : "";

    if (decoded.version !== 0 || decoded.data.length !== 20) {
      return false;
    }

    if (expectedPrefix) {
      return decoded.prefix === expectedPrefix;
    }

    return ["bc", "tb"].includes(decoded.prefix);
  } catch (_error) {
    return false;
  }
}

function validateAddress(address, network) {
  return validateAddressForNetwork(address, network);
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
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return (await importWalletFromMnemonic(normalized, client.DEFAULT_NETWORK)).address;
  }

  for (const network of ["mainnet", "testnet"]) {
    try {
      const pair = ECPair.fromWIF(normalized, getBitcoinNetwork(network));
      const payment = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(pair.publicKey),
        network: getBitcoinNetwork(network),
      });

      if (payment.address) {
        return payment.address;
      }
    } catch (_error) {
      continue;
    }
  }

  throw AppError.validation("Invalid BTC wallet secret");
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
  getBitcoinNetwork,
  getAccountDerivationPath,
  getReceiveDerivationPath,
  getManagedDerivationPath,
  deriveWalletFromMnemonic,
  deriveManagedAddressFromMnemonic,
  createWallet,
  importWalletFromMnemonic,
  validateAddress,
  validateAddressForNetwork,
  resolveAddressFromSecret,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
