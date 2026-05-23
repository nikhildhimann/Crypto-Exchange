const bip39 = require("bip39");
const Cardano = require("@emurgo/cardano-serialization-lib-nodejs");

const { AppError } = require("../../../helpers/errors");
const { validateMnemonic } = require("../../security/mnemonic.service");
const client = require("./client");

const HARDENED = 0x80000000;
const PURPOSE = 1852;
const COIN_TYPE = 1815;
const DEFAULT_ACCOUNT_INDEX = 0;
const EXTERNAL_BRANCH = 0;
const CHANGE_BRANCH = 1;
const STAKE_BRANCH = 2;
const RECEIVE_ADDRESS_INDEX = 0;
const CHANGE_ADDRESS_INDEX = 0;
const STAKE_ADDRESS_INDEX = 0;
const ADDRESS_TYPE = "base";
const REWARD_ADDRESS_TYPE = "reward";

function getNetworkInfo(network) {
  return client.normalizeNetwork(network) === "mainnet"
    ? Cardano.NetworkInfo.mainnet()
    : Cardano.NetworkInfo.testnet_preprod();
}

function getAccountDerivationPath(accountIndex = DEFAULT_ACCOUNT_INDEX) {
  return `m/${PURPOSE}'/${COIN_TYPE}'/${Number(accountIndex)}'`;
}

function getPaymentDerivationPath(
  branch = EXTERNAL_BRANCH,
  addressIndex = RECEIVE_ADDRESS_INDEX,
  accountIndex = DEFAULT_ACCOUNT_INDEX,
) {
  return `${getAccountDerivationPath(accountIndex)}/${Number(branch)}/${Number(addressIndex)}`;
}

function getStakeDerivationPath(
  addressIndex = STAKE_ADDRESS_INDEX,
  accountIndex = DEFAULT_ACCOUNT_INDEX,
) {
  return `${getAccountDerivationPath(accountIndex)}/${STAKE_BRANCH}/${Number(addressIndex)}`;
}

function deriveAccountRootFromMnemonic(mnemonic, accountIndex = DEFAULT_ACCOUNT_INDEX) {
  const normalizedMnemonic = validateMnemonic(mnemonic);
  const entropyHex = bip39.mnemonicToEntropy(normalizedMnemonic);
  const entropy = Buffer.from(entropyHex, "hex");
  const rootKey = Cardano.Bip32PrivateKey.from_bip39_entropy(entropy, Buffer.from(""));
  const normalizedAccountIndex = Number(accountIndex);

  const accountKey = rootKey
    .derive(PURPOSE + HARDENED)
    .derive(COIN_TYPE + HARDENED)
    .derive(normalizedAccountIndex + HARDENED);

  return {
    mnemonic: normalizedMnemonic,
    rootKey,
    accountKey,
    accountIndex: normalizedAccountIndex,
  };
}

function buildCredentialFromBip32PublicKey(publicKey) {
  return Cardano.Credential.from_keyhash(publicKey.to_raw_key().hash());
}

function buildBaseAddressFromPublicKeys(network, paymentPublicKey, stakePublicKey) {
  return Cardano.BaseAddress.new(
    getNetworkInfo(network).network_id(),
    buildCredentialFromBip32PublicKey(paymentPublicKey),
    buildCredentialFromBip32PublicKey(stakePublicKey),
  )
    .to_address()
    .to_bech32();
}

function buildRewardAddressFromPublicKey(network, stakePublicKey) {
  return Cardano.RewardAddress.new(
    getNetworkInfo(network).network_id(),
    buildCredentialFromBip32PublicKey(stakePublicKey),
  )
    .to_address()
    .to_bech32();
}

function buildManagedAddressRecord(
  network,
  address,
  derivationPath,
  {
    branch = EXTERNAL_BRANCH,
    addressIndex = RECEIVE_ADDRESS_INDEX,
    addressType = ADDRESS_TYPE,
    purpose = "receive",
    isChange = false,
    metadata = {},
  } = {},
) {
  return {
    address,
    derivationPath,
    branch,
    addressIndex,
    addressType,
    purpose,
    isActive: true,
    isChange,
    metadata: {
      network: client.normalizeNetwork(network),
      account: Number(metadata.account ?? DEFAULT_ACCOUNT_INDEX),
      coinType: COIN_TYPE,
      purposeIndex: PURPOSE,
      ...metadata,
    },
  };
}

function deriveWalletFromMnemonic(
  mnemonic,
  network,
  { accountIndex = DEFAULT_ACCOUNT_INDEX } = {},
) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const { mnemonic: normalizedMnemonic, accountKey } =
    deriveAccountRootFromMnemonic(mnemonic, accountIndex);

  const paymentPath = getPaymentDerivationPath(
    EXTERNAL_BRANCH,
    RECEIVE_ADDRESS_INDEX,
    accountIndex,
  );
  const stakePath = getStakeDerivationPath(STAKE_ADDRESS_INDEX, accountIndex);

  const paymentKey = accountKey.derive(EXTERNAL_BRANCH).derive(RECEIVE_ADDRESS_INDEX);
  const stakeKey = accountKey.derive(STAKE_BRANCH).derive(STAKE_ADDRESS_INDEX);
  const paymentPublicKey = paymentKey.to_public();
  const stakePublicKey = stakeKey.to_public();

  const address = buildBaseAddressFromPublicKeys(
    normalizedNetwork,
    paymentPublicKey,
    stakePublicKey,
  );
  const rewardAddress = buildRewardAddressFromPublicKey(normalizedNetwork, stakePublicKey);

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    accountIndex: Number(accountIndex),
    accountPath: getAccountDerivationPath(accountIndex),
    paymentPath,
    stakePath,
    address,
    rewardAddress,
    publicKey: paymentPublicKey.to_raw_key().to_hex(),
    stakePublicKey: stakePublicKey.to_raw_key().to_hex(),
    accountPublicKeyHex: accountKey.to_public().to_hex(),
    accountPublicKeyBech32: accountKey.to_public().to_bech32(),
    paymentPublicKeyBech32: paymentPublicKey.to_bech32(),
    stakePublicKeyBech32: stakePublicKey.to_bech32(),
  };
}

function deriveManagedAddressFromMnemonic(
  mnemonic,
  network,
  {
    accountIndex = DEFAULT_ACCOUNT_INDEX,
    branch = EXTERNAL_BRANCH,
    addressIndex = RECEIVE_ADDRESS_INDEX,
    purpose = branch === CHANGE_BRANCH ? "change" : "receive",
    isChange = branch === CHANGE_BRANCH,
    addressType = branch === STAKE_BRANCH ? REWARD_ADDRESS_TYPE : ADDRESS_TYPE,
  } = {},
) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const { mnemonic: normalizedMnemonic, accountKey } =
    deriveAccountRootFromMnemonic(mnemonic, accountIndex);
  const stakeKey = accountKey.derive(STAKE_BRANCH).derive(STAKE_ADDRESS_INDEX);
  const derivationPath =
    branch === STAKE_BRANCH
      ? getStakeDerivationPath(addressIndex, accountIndex)
      : getPaymentDerivationPath(branch, addressIndex, accountIndex);
  const childKey =
    branch === STAKE_BRANCH
      ? stakeKey
      : accountKey.derive(Number(branch)).derive(Number(addressIndex));
  const childPublicKey = childKey.to_public();
  const stakePublicKey = stakeKey.to_public();
  const address =
    branch === STAKE_BRANCH
      ? buildRewardAddressFromPublicKey(normalizedNetwork, stakePublicKey)
      : buildBaseAddressFromPublicKeys(normalizedNetwork, childPublicKey, stakePublicKey);

  return {
    mnemonic: normalizedMnemonic,
    network: normalizedNetwork,
    address,
    derivationPath,
    branch: Number(branch),
    addressIndex: Number(addressIndex),
    purpose,
    isChange,
    addressType,
    privateKey: childKey.to_raw_key(),
    publicKey: childPublicKey.to_raw_key().to_hex(),
    publicKeyBech32: childPublicKey.to_bech32(),
    managedAddress: buildManagedAddressRecord(normalizedNetwork, address, derivationPath, {
      branch: Number(branch),
      addressIndex: Number(addressIndex),
      addressType,
      purpose,
      isChange,
      metadata: {
        role: branch === STAKE_BRANCH ? "reward" : "payment",
        account: Number(accountIndex),
      },
    }),
  };
}

function deriveManagedAddressFromAccountPublicKey(
  accountPublicKeyBech32,
  network,
  {
    stakePublicKeyBech32 = "",
    accountIndex,
    branch = EXTERNAL_BRANCH,
    addressIndex = RECEIVE_ADDRESS_INDEX,
    purpose = branch === CHANGE_BRANCH ? "change" : "receive",
    isChange = branch === CHANGE_BRANCH,
    addressType = branch === STAKE_BRANCH ? REWARD_ADDRESS_TYPE : ADDRESS_TYPE,
  } = {},
) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedAccountPublicKey = String(accountPublicKeyBech32 || "").trim();
  if (!normalizedAccountPublicKey) {
    throw AppError.validation("ADA account public key is required to derive managed addresses");
  }

  const accountPublicKey = Cardano.Bip32PublicKey.from_bech32(normalizedAccountPublicKey);
  const normalizedStakePublicKey = String(stakePublicKeyBech32 || "").trim();
  const stakePublicKey =
    branch === STAKE_BRANCH
      ? accountPublicKey.derive(STAKE_BRANCH).derive(Number(addressIndex))
      : normalizedStakePublicKey
        ? Cardano.Bip32PublicKey.from_bech32(normalizedStakePublicKey)
        : accountPublicKey.derive(STAKE_BRANCH).derive(STAKE_ADDRESS_INDEX);
  const childPublicKey =
    branch === STAKE_BRANCH
      ? stakePublicKey
      : accountPublicKey.derive(Number(branch)).derive(Number(addressIndex));

  const normalizedAccountIndex = Number.isFinite(Number(accountIndex))
    ? Number(accountIndex)
    : null;

  const derivationPath =
    branch === STAKE_BRANCH
      ? getStakeDerivationPath(
        addressIndex,
        normalizedAccountIndex ?? DEFAULT_ACCOUNT_INDEX,
      )
      : getPaymentDerivationPath(
        branch,
        addressIndex,
        normalizedAccountIndex ?? DEFAULT_ACCOUNT_INDEX,
      );

  const address =
    branch === STAKE_BRANCH
      ? buildRewardAddressFromPublicKey(normalizedNetwork, stakePublicKey)
      : buildBaseAddressFromPublicKeys(normalizedNetwork, childPublicKey, stakePublicKey);

  return {
    network: normalizedNetwork,
    address,
    derivationPath,
    branch: Number(branch),
    addressIndex: Number(addressIndex),
    purpose,
    isChange,
    addressType,
    publicKey: childPublicKey.to_raw_key().to_hex(),
    publicKeyBech32: childPublicKey.to_bech32(),
    managedAddress: buildManagedAddressRecord(normalizedNetwork, address, derivationPath, {
      branch: Number(branch),
      addressIndex: Number(addressIndex),
      addressType,
      purpose,
      isChange,
      metadata: {
        role: branch === STAKE_BRANCH ? "reward" : "payment",
        ...(normalizedAccountIndex !== null ? { account: normalizedAccountIndex } : {}),
      },
    }),
  };
}

function buildWalletMaterial(derived) {
  const changeManagedAddress = deriveManagedAddressFromAccountPublicKey(
    derived.accountPublicKeyBech32,
    derived.network,
    {
      stakePublicKeyBech32: derived.stakePublicKeyBech32,
      accountIndex: derived.accountIndex,
      branch: CHANGE_BRANCH,
      addressIndex: CHANGE_ADDRESS_INDEX,
      purpose: "change",
      isChange: true,
      addressType: ADDRESS_TYPE,
    },
  );

  return {
    mnemonic: derived.mnemonic,
    seed: "",
    address: derived.address,
    publicKey: derived.publicKey,
    derivationPath: derived.paymentPath,
    derivation: {
      path: derived.paymentPath,
      accountPath: derived.accountPath,
      paymentPath: derived.paymentPath,
      stakePath: derived.stakePath,
      addressType: ADDRESS_TYPE,
      branch: EXTERNAL_BRANCH,
      addressIndex: RECEIVE_ADDRESS_INDEX,
      stakeAddressIndex: STAKE_ADDRESS_INDEX,
      purpose: "receive",
      coinType: COIN_TYPE,
      account: Number(derived.accountIndex || DEFAULT_ACCOUNT_INDEX),
      network: derived.network,
      rewardAddress: derived.rewardAddress,
      accountPublicKeyHex: derived.accountPublicKeyHex,
      accountPublicKeyBech32: derived.accountPublicKeyBech32,
      paymentPublicKeyBech32: derived.paymentPublicKeyBech32,
      stakePublicKey: derived.stakePublicKey,
      stakePublicKeyBech32: derived.stakePublicKeyBech32,
    },
    managedAddress: buildManagedAddressRecord(
      derived.network,
      derived.address,
      derived.paymentPath,
      {
        branch: EXTERNAL_BRANCH,
        addressIndex: RECEIVE_ADDRESS_INDEX,
        addressType: ADDRESS_TYPE,
        purpose: "receive",
        isChange: false,
        metadata: {
          role: "payment",
          rewardAddress: derived.rewardAddress,
          account: Number(derived.accountIndex || DEFAULT_ACCOUNT_INDEX),
        },
      },
    ),
    additionalManagedAddresses: [
      changeManagedAddress.managedAddress,
      buildManagedAddressRecord(
        derived.network,
        derived.rewardAddress,
        derived.stakePath,
        {
          branch: STAKE_BRANCH,
          addressIndex: STAKE_ADDRESS_INDEX,
          addressType: REWARD_ADDRESS_TYPE,
          purpose: "stake",
          isChange: false,
          metadata: {
            role: "reward",
            receiveEnabled: false,
            account: Number(derived.accountIndex || DEFAULT_ACCOUNT_INDEX),
          },
        },
      ),
    ],
  };
}

function classifyAddress(address) {
  const normalized = String(address || "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = Cardano.Address.from_bech32(normalized);

    if (Cardano.BaseAddress.from_address(parsed)) {
      return {
        kind: "base",
        address: Cardano.BaseAddress.from_address(parsed),
      };
    }

    if (Cardano.EnterpriseAddress.from_address(parsed)) {
      return {
        kind: "enterprise",
        address: Cardano.EnterpriseAddress.from_address(parsed),
      };
    }

    if (Cardano.RewardAddress.from_address(parsed)) {
      return {
        kind: "reward",
        address: Cardano.RewardAddress.from_address(parsed),
      };
    }

    return {
      kind: "unknown",
      address: parsed,
    };
  } catch (_error) {
    return null;
  }
}

function validateAddressForNetwork(address, network, options = {}) {
  const classification = classifyAddress(address);
  if (!classification) {
    return false;
  }

  const expectedNetworkId = getNetworkInfo(network).network_id();
  const includeReward = options.includeReward === true;
  const paymentOnly = options.paymentOnly !== false;

  if (classification.address.network_id() !== expectedNetworkId) {
    return false;
  }

  if (classification.kind === "reward") {
    return includeReward;
  }

  if (classification.kind === "base" || classification.kind === "enterprise") {
    return paymentOnly;
  }

  return false;
}

function validateAddress(address, network) {
  const normalized = String(address || "").trim();

  if (!normalized) {
    return false;
  }

  if (network) {
    return validateAddressForNetwork(normalized, network, {
      paymentOnly: true,
      includeReward: false,
    });
  }

  return (
    validateAddressForNetwork(normalized, "mainnet", {
      paymentOnly: true,
      includeReward: false,
    }) ||
    validateAddressForNetwork(normalized, "preprod", {
      paymentOnly: true,
      includeReward: false,
    })
  );
}

function validateRewardAddress(address, network) {
  const normalized = String(address || "").trim();

  if (!normalized) {
    return false;
  }

  if (network) {
    return validateAddressForNetwork(normalized, network, {
      paymentOnly: false,
      includeReward: true,
    });
  }

  return (
    validateAddressForNetwork(normalized, "mainnet", {
      paymentOnly: false,
      includeReward: true,
    }) ||
    validateAddressForNetwork(normalized, "preprod", {
      paymentOnly: false,
      includeReward: true,
    })
  );
}

async function createWallet(network, mnemonic) {
  return buildWalletMaterial(deriveWalletFromMnemonic(mnemonic, network));
}

function importWalletFromMnemonic(mnemonic, network) {
  return createWallet(network, mnemonic);
}

function normalizeProbeLimit(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

const amount = require("./amount");



function toSafeBigInt(value) {
  try {
    return BigInt(String(value || "0"));
  } catch (_error) {
    return 0n;
  }
}

async function mapWithConcurrency(items, limit, handler) {
  const safeLimit = Math.max(Number(limit) || 1, 1);
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(safeLimit, items.length) }, () =>
    (async () => {
      while (cursor < items.length) {
        const currentIndex = cursor;
        cursor += 1;
        results[currentIndex] = await handler(items[currentIndex], currentIndex);
      }
    })(),
  );

  await Promise.all(workers);
  return results;
}

async function discoverWalletFromMnemonic(
  mnemonic,
  network,
  {
    maxAccounts = 20,
    probeReceiveEnd = 20,
    probeChangeEnd = 20,
    probeConcurrency = 6,
  } = {},
) {
  const normalizedNetwork = client.normalizeNetwork(network);
  const adaClient = client.getClient(normalizedNetwork);
  const maxAccountIndex = normalizeProbeLimit(maxAccounts, 0);
  const receiveEnd = normalizeProbeLimit(probeReceiveEnd, 0);
  const changeEnd = normalizeProbeLimit(
    Number.isFinite(Number(probeChangeEnd)) ? probeChangeEnd : probeReceiveEnd,
    receiveEnd,
  );

  let bestMatch = null;

  for (let accountIndex = 0; accountIndex <= maxAccountIndex; accountIndex += 1) {
    const derived = deriveWalletFromMnemonic(mnemonic, normalizedNetwork, { accountIndex });
    const { accountKey } = deriveAccountRootFromMnemonic(mnemonic, accountIndex);
    const stakeKey = accountKey.derive(STAKE_BRANCH).derive(STAKE_ADDRESS_INDEX);
    const stakePublicKey = stakeKey.to_public();

    const probeAddresses = [];

    for (let i = 0; i <= receiveEnd; i += 1) {
      const paymentKey = accountKey.derive(EXTERNAL_BRANCH).derive(i);
      const paymentPublicKey = paymentKey.to_public();
      probeAddresses.push({
        address: buildBaseAddressFromPublicKeys(
          normalizedNetwork,
          paymentPublicKey,
          stakePublicKey,
        ),
        branch: EXTERNAL_BRANCH,
        addressIndex: i,
      });
    }

    for (let i = 0; i <= changeEnd; i += 1) {
      const paymentKey = accountKey.derive(CHANGE_BRANCH).derive(i);
      const paymentPublicKey = paymentKey.to_public();
      probeAddresses.push({
        address: buildBaseAddressFromPublicKeys(
          normalizedNetwork,
          paymentPublicKey,
          stakePublicKey,
        ),
        branch: CHANGE_BRANCH,
        addressIndex: i,
      });
    }

    let totalLovelace = 0n;
    let activeAddresses = 0;
    let transactionCount = 0;

    const probeResults = await mapWithConcurrency(
      probeAddresses,
      probeConcurrency,
      async ({ address }) => {
        try {
          const info = await adaClient.fetchAddressInfo(address).catch(() => null);
          if (!info) {
            return { lovelace: 0n, txCount: 0, hasActivity: false };
          }

          const lovelace = toSafeBigInt(amount.resolveLovelaceBalance(info?.amount));
          const infoTxCount =
            info?.tx_count ??
            info?.transactions_count ??
            info?.txCount ??
            null;
          let txCount = Number.isFinite(Number(infoTxCount)) ? Number(infoTxCount) : 0;

          if (!Number.isFinite(Number(infoTxCount))) {
            const txs = await adaClient
              .fetchAddressTransactions(address, 1, 1, "desc")
              .catch(() => []);
            txCount = Array.isArray(txs) ? txs.length : 0;
          }

          const hasActivity = lovelace > 0n || txCount > 0 || Boolean(info);
          return { lovelace, txCount, hasActivity };
        } catch (_error) {
          return { lovelace: 0n, txCount: 0, hasActivity: false };
        }
      },
    );

    for (const result of probeResults) {
      if (!result) {
        continue;
      }
      totalLovelace += result.lovelace;
      transactionCount += result.txCount;
      if (result.hasActivity) {
        activeAddresses += 1;
      }
    }

    const candidate = {
      accountIndex,
      material: buildWalletMaterial(derived),
      score: {
        totalLovelace,
        activeAddresses,
        transactionCount,
      },
    };

    if (
      !bestMatch ||
      candidate.score.totalLovelace > bestMatch.score.totalLovelace ||
      (candidate.score.totalLovelace === bestMatch.score.totalLovelace &&
        (candidate.score.activeAddresses > bestMatch.score.activeAddresses ||
          (candidate.score.activeAddresses === bestMatch.score.activeAddresses &&
            (candidate.score.transactionCount > bestMatch.score.transactionCount ||
              (candidate.score.transactionCount === bestMatch.score.transactionCount &&
                candidate.accountIndex < bestMatch.accountIndex)))))
    ) {
      bestMatch = candidate;
    }
  }

  const bestMaterial = bestMatch ? bestMatch.material : buildWalletMaterial(
    deriveWalletFromMnemonic(mnemonic, normalizedNetwork),
  );

  if (bestMatch) {
    bestMaterial.metadata = {
      ...(bestMaterial.metadata || {}),
      discovery: {
        accountIndex: bestMatch.accountIndex,
        totalLovelace: String(bestMatch.score.totalLovelace),
        activeAddresses: bestMatch.score.activeAddresses,
        transactionCount: bestMatch.score.transactionCount,
        scanRanges: { receiveEnd, changeEnd },
        discoveredAt: new Date(),
        version: 1
      }
    };
  }

  return bestMaterial;
}

async function resolveAddressFromSecret(secret, { accountIndex = DEFAULT_ACCOUNT_INDEX } = {}) {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw AppError.validation("Wallet secret is required");
  }

  if (normalized.includes(" ")) {
    return (await importWalletFromMnemonic(normalized, client.DEFAULT_NETWORK)).address;
  }

  try {
    const rootKey = Cardano.Bip32PrivateKey.from_bech32(normalized);
    const accountKey = rootKey
      .derive(PURPOSE + HARDENED)
      .derive(COIN_TYPE + HARDENED)
      .derive(Number(accountIndex) + HARDENED);
    const paymentKey = accountKey.derive(EXTERNAL_BRANCH).derive(RECEIVE_ADDRESS_INDEX);
    const stakeKey = accountKey.derive(STAKE_BRANCH).derive(STAKE_ADDRESS_INDEX);
    const paymentCredential = buildCredentialFromBip32PublicKey(paymentKey.to_public());
    const stakeCredential = buildCredentialFromBip32PublicKey(stakeKey.to_public());

    return Cardano.BaseAddress.new(
      getNetworkInfo(client.DEFAULT_NETWORK).network_id(),
      paymentCredential,
      stakeCredential,
    )
      .to_address()
      .to_bech32();
  } catch (_error) {
    throw AppError.validation("Invalid ADA wallet secret");
  }
}

async function assignManagedReceiveExecutionParams() {
  return {};
}

async function resolveManagedReceiveExecutionParams() {
  return {};
}

module.exports = {
  PURPOSE,
  COIN_TYPE,
  DEFAULT_ACCOUNT_INDEX,
  EXTERNAL_BRANCH,
  CHANGE_BRANCH,
  STAKE_BRANCH,
  RECEIVE_ADDRESS_INDEX,
  CHANGE_ADDRESS_INDEX,
  STAKE_ADDRESS_INDEX,
  ADDRESS_TYPE,
  REWARD_ADDRESS_TYPE,
  getNetworkInfo,
  getAccountDerivationPath,
  getPaymentDerivationPath,
  getStakeDerivationPath,
  deriveWalletFromMnemonic,
  deriveManagedAddressFromMnemonic,
  deriveManagedAddressFromAccountPublicKey,
  discoverWalletFromMnemonic,
  validateAddress,
  validateAddressForNetwork,
  validateRewardAddress,
  resolveAddressFromSecret,
  createWallet,
  importWalletFromMnemonic,
  assignManagedReceiveExecutionParams,
  resolveManagedReceiveExecutionParams,
};
