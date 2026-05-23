const {
  AccountId,
  AccountCreateTransaction,
  AccountInfoQuery,
  Client,
  Hbar,
  PrivateKey,
  PublicKey,
  TransactionRecordQuery,
  TransferTransaction,
} = require("@hashgraph/sdk");

const { AppError } = require("../../../helpers/errors");

const DEFAULT_NETWORK = String(process.env.HBAR_DEFAULT_NETWORK || "mainnet")
  .trim()
  .toLowerCase();
const DEFAULT_TIMEOUT_MS = 10000;
const ACCOUNT_LOOKUP_RETRY_COUNT = 10;
const ACCOUNT_LOOKUP_RETRY_DELAY_MS = 1500;
const CANONICAL_ACCOUNT_ID_PATTERN = /^\d+\.\d+\.\d+$/;
const CANONICAL_ACCOUNT_ID_WITH_CHECKSUM_PATTERN =
  /^(\d+\.\d+\.\d+)(?:-[a-z0-9]{5})?$/i;
const ALIAS_ACCOUNT_ID_PATTERN = /^\d+\.\d+\.[0-9a-f]+$/i;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

function normalizeNetwork(network = DEFAULT_NETWORK) {
  const normalized = String(network || DEFAULT_NETWORK).trim().toLowerCase();

  if (!["mainnet", "testnet"].includes(normalized)) {
    throw AppError.validation(`Unsupported HBAR network "${network}"`);
  }

  return normalized;
}

function ensureHttpUrl(url, fieldName) {
  const normalized = String(url || "").trim();

  if (!normalized) {
    throw AppError.validation(`${fieldName} is required for Hedera operations`);
  }

  if (!/^https?:\/\//.test(normalized)) {
    throw AppError.validation(`${fieldName} must be a valid HTTP or HTTPS URL`);
  }

  return normalized.replace(/\/+$/, "");
}

function getMirrorBaseUrl(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  if (normalizedNetwork === "mainnet") {
    return ensureHttpUrl(
      process.env.HBAR_MAINNET_MIRROR_API_URL,
      "HBAR_MAINNET_MIRROR_API_URL",
    );
  }

  return ensureHttpUrl(
    process.env.HBAR_TESTNET_MIRROR_API_URL,
    "HBAR_TESTNET_MIRROR_API_URL",
  );
}

function normalizeOperatorField(value, fieldName) {
  const normalized = String(value || "").trim();

  if (!normalized || normalized.toLowerCase().startsWith("your_operator_")) {
    throw AppError.validation(`${fieldName} is required for Hedera account provisioning`);
  }

  return normalized;
}

function getOperatorConfig(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);
  const operatorId =
    normalizedNetwork === "mainnet"
      ? process.env.HBAR_MAINNET_OPERATOR_ID
      : process.env.HBAR_TESTNET_OPERATOR_ID;
  const operatorKey =
    normalizedNetwork === "mainnet"
      ? process.env.HBAR_MAINNET_OPERATOR_KEY
      : process.env.HBAR_TESTNET_OPERATOR_KEY;

  return {
    network: normalizedNetwork,
    operatorId: normalizeOperatorField(
      operatorId,
      normalizedNetwork === "mainnet"
        ? "HBAR_MAINNET_OPERATOR_ID"
        : "HBAR_TESTNET_OPERATOR_ID",
    ),
    operatorKey: normalizeOperatorField(
      operatorKey,
      normalizedNetwork === "mainnet"
        ? "HBAR_MAINNET_OPERATOR_KEY"
        : "HBAR_TESTNET_OPERATOR_KEY",
    ),
  };
}

function getInitialAccountBalance() {
  const configured = String(process.env.HBAR_ACCOUNT_CREATE_INITIAL_BALANCE || "").trim();

  if (!configured) {
    throw AppError.validation(
      "HBAR_ACCOUNT_CREATE_INITIAL_BALANCE is required for Hedera account provisioning",
    );
  }

  if (!/^\d+(\.\d+)?$/.test(configured)) {
    throw AppError.validation(
      "HBAR_ACCOUNT_CREATE_INITIAL_BALANCE must be a valid positive HBAR amount",
    );
  }

  try {
    return Hbar.fromString(configured);
  } catch (_error) {
    throw AppError.validation(
      "HBAR_ACCOUNT_CREATE_INITIAL_BALANCE must be a valid HBAR amount",
    );
  }
}

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeProvisioningPublicKey(publicKey) {
  const normalized = normalizeString(publicKey);

  if (!normalized) {
    throw AppError.validation("HBAR public key is required for account creation");
  }

  const candidates = [
    () => PublicKey.fromString(normalized),
    () => PublicKey.fromStringED25519(normalized),
    () =>
      /^[0-9a-f]+$/i.test(normalized)
        ? PublicKey.fromBytesED25519(Buffer.from(normalized, "hex"))
        : null,
  ];

  for (const candidate of candidates) {
    try {
      const resolved = candidate();
      if (resolved?.type !== "ED25519") {
        throw AppError.validation("HBAR account creation currently requires an ED25519 public key");
      }

      return resolved;
    } catch (_error) {
      continue;
    }
  }

  throw AppError.validation("HBAR public key is invalid for account creation");
}

function normalizeCanonicalAccountId(identifier) {
  const normalized = normalizeString(identifier);
  const match = normalized
    ? normalized.match(CANONICAL_ACCOUNT_ID_WITH_CHECKSUM_PATTERN)
    : null;

  if (!match || !match[1] || !CANONICAL_ACCOUNT_ID_PATTERN.test(match[1])) {
    throw AppError.validation("HBAR canonical account identifier is invalid");
  }

  try {
    return AccountId.fromString(match[1]).toString();
  } catch (_error) {
    throw AppError.validation("HBAR canonical account identifier is invalid");
  }
}

function isCanonicalAccountId(identifier) {
  try {
    normalizeCanonicalAccountId(identifier);
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeAliasAccountId(identifier) {
  const normalized = normalizeString(identifier);

  if (
    !normalized ||
    isCanonicalAccountId(normalized) ||
    !ALIAS_ACCOUNT_ID_PATTERN.test(normalized)
  ) {
    throw AppError.validation("HBAR alias account identifier is invalid");
  }

  try {
    AccountId.fromString(normalized);
    return normalized;
  } catch (_error) {
    throw AppError.validation("HBAR alias account identifier is invalid");
  }
}

function extractAliasPathIdentifier(identifier) {
  const normalized = normalizeAliasAccountId(identifier);
  const [, , aliasHex = ""] = normalized.split(".");
  return aliasHex.toLowerCase();
}

function isAliasAccountId(identifier) {
  try {
    normalizeAliasAccountId(identifier);
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeEvmAddress(address) {
  const normalized = normalizeString(address);

  if (!normalized || !EVM_ADDRESS_PATTERN.test(normalized)) {
    throw AppError.validation("HBAR EVM address is invalid");
  }

  return normalized;
}

function isEvmAddress(address) {
  try {
    normalizeEvmAddress(address);
    return true;
  } catch (_error) {
    return false;
  }
}

function selectCanonicalAccountId(accountLike = {}) {
  const candidates = [
    accountLike.accountId,
    accountLike.account,
    accountLike.account_id,
    accountLike.accountID,
    accountLike.receipt?.accountId,
    accountLike.receipt?.accountID,
  ];

  for (const candidate of candidates) {
    const normalized =
      candidate && typeof candidate.toString === "function"
        ? candidate.toString()
        : normalizeString(candidate);

    if (isCanonicalAccountId(normalized)) {
      return normalized;
    }
  }

  return null;
}

function toSdkAliasAccountId(aliasKey) {
  if (!aliasKey || typeof aliasKey.toAccountId !== "function") {
    return null;
  }

  try {
    return aliasKey.toAccountId(0, 0).toString();
  } catch (_error) {
    return null;
  }
}

function normalizeSdkAccountInfo(info) {
  if (!info || typeof info !== "object") {
    return null;
  }

  const contractAccountId = normalizeString(info.contractAccountId);
  const evmAddress =
    contractAccountId && /^[0-9a-f]{40}$/i.test(contractAccountId)
      ? `0x${contractAccountId.toLowerCase()}`
      : null;
  const publicKey =
    info.key && typeof info.key.toStringRaw === "function"
      ? normalizeString(info.key.toStringRaw())
      : normalizeString(info.key?.toString?.());

  return {
    accountId: selectCanonicalAccountId(info),
    alias: toSdkAliasAccountId(info.aliasKey),
    evmAddress,
    publicKey,
    tinybarBalance:
      info.balance && typeof info.balance.toTinybars === "function"
        ? String(info.balance.toTinybars())
        : "0",
    memo: normalizeString(info.accountMemo),
    deleted: info.isDeleted === true,
    raw: typeof info.toJSON === "function" ? info.toJSON() : info,
  };
}

function mergeAccountDetails(primaryAccount, secondaryAccount, overrides = {}) {
  const primary =
    primaryAccount && typeof primaryAccount === "object" ? primaryAccount : {};
  const secondary =
    secondaryAccount && typeof secondaryAccount === "object" ? secondaryAccount : {};

  return {
    accountId:
      overrides.accountId ||
      selectCanonicalAccountId(primary) ||
      selectCanonicalAccountId(secondary) ||
      null,
    alias:
      overrides.alias ||
      normalizeString(primary.alias) ||
      normalizeString(secondary.alias) ||
      null,
    evmAddress:
      overrides.evmAddress ||
      normalizeString(primary.evmAddress) ||
      normalizeString(secondary.evmAddress) ||
      null,
    publicKey:
      overrides.publicKey ||
      normalizeString(primary.publicKey) ||
      normalizeString(secondary.publicKey) ||
      null,
    tinybarBalance:
      normalizeString(primary.tinybarBalance) ||
      normalizeString(secondary.tinybarBalance) ||
      "0",
    memo:
      overrides.memo ||
      normalizeString(primary.memo) ||
      normalizeString(secondary.memo) ||
      null,
    deleted:
      overrides.deleted === true ||
      primary.deleted === true ||
      secondary.deleted === true,
    raw: {
      sdk: primary.raw || null,
      mirror: secondary.raw || null,
    },
  };
}

function getErrorReason(error) {
  if (!error) {
    return "";
  }

  if (error instanceof AppError) {
    return error.message || "";
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return String(error);
}

function isAccountLookupMiss(error) {
  const reason = getErrorReason(error).toLowerCase();

  return [
    "account_id_does_not_exist",
    "invalid_account_id",
    "invalid alias",
    "invalid_alias_key",
    "account not found",
    "record_not_found",
    "receipt_not_found",
  ].some((token) => reason.includes(token));
}

function isTransactionLookupMiss(error) {
  const reason = getErrorReason(error).toLowerCase();

  return [
    "record_not_found",
    "receipt_not_found",
    "invalid_transaction_id",
    "transaction not found",
  ].some((token) => reason.includes(token));
}

async function queryAccountInfo(network, identifier, options = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedIdentifier = String(identifier || "").trim();

  if (!normalizedIdentifier) {
    throw AppError.validation("HBAR account identifier is required");
  }

  try {
    const sdkClient = createSdkClient(normalizedNetwork, { withOperator: true });
    const info = await new AccountInfoQuery()
      .setAccountId(AccountId.fromString(normalizedIdentifier))
      .execute(sdkClient);

    return normalizeSdkAccountInfo(info);
  } catch (error) {
    if (options.allowNotFound === true && isAccountLookupMiss(error)) {
      return null;
    }

    const reason = getErrorReason(error);
    if (reason.toLowerCase().includes("invalid_signature")) {
      throw new AppError("HBAR operator configuration is invalid for SDK-backed account queries", {
        status: 503,
        errors: {
          network: normalizedNetwork,
          identifier: normalizedIdentifier,
          reason,
        },
      });
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw new Error(
      `Failed HBAR account info query for ${normalizedNetwork}: ${reason}`,
    );
  }
}

async function queryTransactionRecord(network, transactionId, options = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedTransactionId = String(transactionId || "").trim();

  if (!normalizedTransactionId) {
    throw AppError.validation("HBAR transaction ID is required");
  }

  try {
    const sdkClient = createSdkClient(normalizedNetwork, { withOperator: true });
    const query = new TransactionRecordQuery()
      .setTransactionId(normalizedTransactionId)
      .setIncludeChildren(options.includeChildren !== false);

    if (options.validateReceiptStatus === false) {
      query.setValidateReceiptStatus(false);
    }

    return await query.execute(sdkClient);
  } catch (error) {
    if (options.allowNotFound === true && isTransactionLookupMiss(error)) {
      return null;
    }

    const reason = getErrorReason(error);
    if (reason.toLowerCase().includes("invalid_signature")) {
      throw new AppError(
        "HBAR operator configuration is invalid for SDK-backed transaction record queries",
        {
          status: 503,
          errors: {
            network: normalizedNetwork,
            transactionId: normalizedTransactionId,
            reason,
          },
        },
      );
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw new Error(
      `Failed HBAR transaction record query for ${normalizedNetwork}: ${reason}`,
    );
  }
}

function extractCanonicalAccountIdFromRecord(record) {
  const parentAccountId = selectCanonicalAccountId(record);
  if (parentAccountId) {
    return parentAccountId;
  }

  const children = Array.isArray(record?.children) ? record.children : [];
  for (const child of children) {
    const childAccountId = selectCanonicalAccountId(child);
    if (childAccountId) {
      return childAccountId;
    }
  }

  return null;
}

function createSdkClient(network = DEFAULT_NETWORK, { withOperator = true } = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const sdkClient =
    normalizedNetwork === "mainnet" ? Client.forMainnet() : Client.forTestnet();

  if (!withOperator) {
    return sdkClient;
  }

  const operator = getOperatorConfig(normalizedNetwork);
  sdkClient.setOperator(
    AccountId.fromString(operator.operatorId),
    PrivateKey.fromString(operator.operatorKey),
  );

  return sdkClient;
}

async function request(network, path, options = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const baseUrl = getMirrorBaseUrl(normalizedNetwork);
  const normalizedPath = String(path || "").trim().replace(/^\/+/, "");
  const url = `${baseUrl}/${normalizedPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const method = String(options.method || "GET").toUpperCase();
  const responseType = options.responseType === "text" ? "text" : "json";

  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: responseType === "json" ? "application/json" : "*/*",
        ...(options.headers && typeof options.headers === "object" ? options.headers : {}),
      },
      body: options.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      if (response.status === 404 && options.allowNotFound === true) {
        return null;
      }

      throw new Error(
        body
          ? `HBAR mirror API HTTP ${response.status}: ${body}`
          : `HBAR mirror API HTTP ${response.status}`,
      );
    }

    if (responseType === "text") {
      return response.text();
    }

    return response.json();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new Error(
      `Failed HBAR mirror API request for ${normalizedNetwork}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function requestJson(network, path, options = {}) {
  return request(network, path, {
    ...options,
    responseType: "json",
  });
}

function normalizeMirrorAccount(account) {
  if (!account || typeof account !== "object" || Array.isArray(account)) {
    return null;
  }

  const accountId = normalizeString(
    account.account || account.account_id || account.accountId,
  );
  if (!accountId) {
    return null;
  }

  const tinybarBalance = String(
    account.balance?.balance ??
      account.balance ??
      account.tinybar_balance ??
      "0",
  ).trim();

  return {
    accountId,
    alias: normalizeString(account.alias),
    evmAddress: normalizeString(account.evm_address || account.evmAddress),
    publicKey:
      normalizeString(account.key?.key) ||
      normalizeString(account.key) ||
      null,
    tinybarBalance: /^\d+$/.test(tinybarBalance) ? tinybarBalance : "0",
    memo: normalizeString(account.memo),
    deleted: account.deleted === true,
    raw: account,
  };
}

async function fetchAccount(network, identifier, options = {}) {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) {
    throw AppError.validation("HBAR account identifier is required");
  }

  const pathIdentifier = isAliasAccountId(normalizedIdentifier)
    ? extractAliasPathIdentifier(normalizedIdentifier)
    : normalizedIdentifier;

  const result = await requestJson(
    network,
    `accounts/${encodeURIComponent(pathIdentifier)}`,
    { allowNotFound: options.allowNotFound === true },
  );

  return normalizeMirrorAccount(result);
}

async function fetchAccountTransactions(network, identifier, limit = 50, order = "desc") {
  const normalizedIdentifier = String(identifier || "").trim();
  const options =
    typeof limit === "object" && limit !== null
      ? limit
      : {
          limit,
          order,
        };
  const params = new URLSearchParams({
    "account.id": normalizedIdentifier,
    limit: String(options.limit || 50),
    order: String(options.order || "desc"),
  });

  if (options.transactionType) {
    params.set("transactiontype", String(options.transactionType).trim().toUpperCase());
  }

  if (options.timestamp) {
    params.set("timestamp", String(options.timestamp).trim());
  }

  const result = await requestJson(network, `transactions?${params.toString()}`, {
    allowNotFound: true,
  });

  return {
    transactions: Array.isArray(result?.transactions) ? result.transactions : [],
    links: result?.links && typeof result.links === "object" ? result.links : {},
  };
}

async function fetchNextTransactions(network, nextLink) {
  const normalizedNextLink = String(nextLink || "").trim();
  if (!normalizedNextLink) {
    return {
      transactions: [],
      links: {},
    };
  }

  const normalizedPath = normalizedNextLink.startsWith("/api/v1/")
    ? normalizedNextLink.slice("/api/v1/".length)
    : normalizedNextLink.replace(/^\/+/, "");
  const result = await requestJson(network, normalizedPath, {
    allowNotFound: true,
  });

  return {
    transactions: Array.isArray(result?.transactions) ? result.transactions : [],
    links: result?.links && typeof result.links === "object" ? result.links : {},
  };
}

async function fetchTransaction(network, transactionId, options = {}) {
  const normalizedTransactionId = String(transactionId || "").trim();
  if (!normalizedTransactionId) {
    throw AppError.validation("HBAR transaction ID is required");
  }

  const encodedTransactionId = encodeURIComponent(normalizedTransactionId);
  const result = await requestJson(
    network,
    `transactions/${encodedTransactionId}`,
    { allowNotFound: options.allowNotFound === true },
  );

  const transactions = Array.isArray(result?.transactions) ? result.transactions : [];
  return transactions[0] || null;
}

async function resolveAccount(network, identifier, options = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedIdentifier = String(identifier || "").trim();

  if (!normalizedIdentifier) {
    throw AppError.validation("HBAR account identifier is required");
  }

  if (isCanonicalAccountId(normalizedIdentifier)) {
    const canonicalAccountId = normalizeCanonicalAccountId(normalizedIdentifier);
    const mirrorAccount = await fetchAccount(normalizedNetwork, canonicalAccountId, {
      allowNotFound: true,
    }).catch(() => null);
    if (mirrorAccount?.accountId) {
      return mirrorAccount;
    }

    const infoAccount = await queryAccountInfo(normalizedNetwork, canonicalAccountId, {
      allowNotFound: options.allowNotFound === true,
    });
    if (!infoAccount?.accountId) {
      return null;
    }

    return mergeAccountDetails(infoAccount, mirrorAccount);
  }

  if (isAliasAccountId(normalizedIdentifier)) {
    const aliasAccountId = normalizeAliasAccountId(normalizedIdentifier);
    const mirrorAccount = await fetchAccount(normalizedNetwork, aliasAccountId, {
      allowNotFound: true,
    }).catch(() => null);

    if (mirrorAccount?.accountId) {
      return {
        ...mirrorAccount,
        alias: mirrorAccount.alias || aliasAccountId,
      };
    }

    const infoAccount = await queryAccountInfo(normalizedNetwork, aliasAccountId, {
      allowNotFound: options.allowNotFound === true,
    });

    if (!infoAccount?.accountId) {
      return null;
    }

    return mergeAccountDetails(infoAccount, mirrorAccount, {
      alias: aliasAccountId,
    });
  }

  if (isEvmAddress(normalizedIdentifier)) {
    const evmAddress = normalizeEvmAddress(normalizedIdentifier);
    const mirrorAccount = await fetchAccount(normalizedNetwork, evmAddress, {
      allowNotFound: true,
    }).catch(() => null);
    if (mirrorAccount?.accountId) {
      return mirrorAccount;
    }

    const evmAliasAccountId = `0.0.${evmAddress.slice(2).toLowerCase()}`;
    const infoAccount = await queryAccountInfo(normalizedNetwork, evmAliasAccountId, {
      allowNotFound: options.allowNotFound === true,
    });

    if (!infoAccount?.accountId) {
      return null;
    }

    return mergeAccountDetails(infoAccount, mirrorAccount, {
      alias: evmAliasAccountId,
      evmAddress,
    });
  }

  throw AppError.validation("HBAR account identifier is invalid");
}

async function requireAccount(network, identifier, options = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedIdentifier = String(identifier || "").trim();
  const label = normalizeString(options.label) || "HBAR account";

  let account = null;

  try {
    account = await resolveAccount(normalizedNetwork, normalizedIdentifier, {
      allowNotFound: true,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(`Failed to resolve ${label.toLowerCase()}`, {
      status: 502,
      errors: {
        identifier: normalizedIdentifier,
        network: normalizedNetwork,
        reason: getErrorReason(error),
      },
    });
  }

  if (!account?.accountId) {
    const notFoundError = AppError.notFound(
      options.notFoundMessage || `${label} could not be resolved on the selected network`,
    );
    notFoundError.errors = {
      identifier: normalizedIdentifier,
      network: normalizedNetwork,
    };
    throw notFoundError;
  }

  if (account.deleted === true) {
    const deletedError = AppError.conflict(
      options.deletedMessage || `${label} is deleted on the selected network`,
    );
    deletedError.errors = {
      identifier: normalizedIdentifier,
      accountId: account.accountId,
      network: normalizedNetwork,
    };
    throw deletedError;
  }

  return account;
}

async function waitForAccountResolution(network, input = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const aliasAccountId = normalizeAliasAccountId(input.aliasAccountId);
  const creationTransactionId = normalizeString(input.creationTransactionId);

  for (let attempt = 0; attempt < ACCOUNT_LOOKUP_RETRY_COUNT; attempt += 1) {
    if (creationTransactionId) {
      const record = await queryTransactionRecord(normalizedNetwork, creationTransactionId, {
        includeChildren: true,
        validateReceiptStatus: false,
        allowNotFound: true,
      }).catch(() => null);
      const recordAccountId = extractCanonicalAccountIdFromRecord(record);

      if (recordAccountId) {
        const resolvedFromRecord = await resolveAccount(normalizedNetwork, recordAccountId, {
          allowNotFound: true,
        }).catch(() => null);

        if (resolvedFromRecord?.accountId) {
          return mergeAccountDetails(resolvedFromRecord, null, {
            alias: aliasAccountId,
          });
        }

        return {
          accountId: recordAccountId,
          alias: aliasAccountId,
          evmAddress: null,
          publicKey: null,
          tinybarBalance: "0",
          memo: null,
          deleted: false,
          raw: {
            sdk: record && typeof record.toJSON === "function" ? record.toJSON() : record,
            mirror: null,
          },
        };
      }
    }

    const account = await resolveAccount(normalizedNetwork, aliasAccountId, {
      allowNotFound: true,
    }).catch(() => null);
    if (account?.accountId) {
      return account;
    }

    await new Promise((resolve) => setTimeout(resolve, ACCOUNT_LOOKUP_RETRY_DELAY_MS));
  }

  return null;
}

async function requireProvisioningOperatorAccount(normalizedNetwork, operator) {
  try {
    return await requireAccount(normalizedNetwork, operator.operatorId, {
      label: "HBAR operator account",
      notFoundMessage: "HBAR operator account could not be resolved for provisioning",
      deletedMessage: "HBAR operator account is deleted and cannot provision wallets",
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(error.message, {
        status: 503,
        code: error.code,
        errors: {
          ...(error.errors && typeof error.errors === "object" ? error.errors : {}),
          network: normalizedNetwork,
          operatorId: operator.operatorId,
        },
      });
    }

    throw error;
  }
}

function assertProvisioningFunding(operatorAccount, initialTinybars, normalizedNetwork, operator) {
  if (initialTinybars <= 0n) {
    throw AppError.validation(
      "HBAR_ACCOUNT_CREATE_INITIAL_BALANCE must be greater than zero",
    );
  }

  const operatorTinybars = BigInt(String(operatorAccount.tinybarBalance || "0"));
  if (operatorTinybars < initialTinybars) {
    throw new AppError(
      "HBAR operator balance is lower than HBAR_ACCOUNT_CREATE_INITIAL_BALANCE; wallet provisioning cannot continue",
      {
        status: 503,
        errors: {
          network: normalizedNetwork,
          operatorId: operator.operatorId,
          operatorBalanceTinybars: operatorAccount.tinybarBalance || "0",
          requiredInitialTinybars: initialTinybars.toString(),
        },
      },
    );
  }
}

async function resolveCreatedAccount(network, input = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const canonicalAccountId = normalizeString(input.accountId);
  const aliasAccountId = normalizeString(input.aliasAccountId);
  const publicKey = normalizeString(input.publicKey);

  if (canonicalAccountId && isCanonicalAccountId(canonicalAccountId)) {
    const sdkAccount = await queryAccountInfo(normalizedNetwork, canonicalAccountId, {
      allowNotFound: true,
    }).catch(() => null);
    const mirrorAccount = await fetchAccount(normalizedNetwork, canonicalAccountId, {
      allowNotFound: true,
    }).catch(() => null);
    const merged = mergeAccountDetails(sdkAccount, mirrorAccount, {
      accountId: canonicalAccountId,
      alias: aliasAccountId || null,
      publicKey: normalizeString(sdkAccount?.publicKey) || publicKey || null,
    });

    if (merged?.accountId) {
      return merged;
    }
  }

  const waitedAccount = await waitForAccountResolution(normalizedNetwork, {
    aliasAccountId,
    creationTransactionId: input.creationTransactionId,
  });

  if (!waitedAccount?.accountId) {
    return null;
  }

  return mergeAccountDetails(waitedAccount, null, {
    accountId: waitedAccount.accountId,
    alias: aliasAccountId || waitedAccount.alias || null,
    publicKey: normalizeString(waitedAccount.publicKey) || publicKey || null,
  });
}

async function createAccountFromPublicKey(network, input = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const publicKey = normalizeProvisioningPublicKey(input.publicKey);
  const publicKeyRaw =
    typeof publicKey.toStringRaw === "function"
      ? normalizeString(publicKey.toStringRaw())
      : normalizeString(input.publicKey);
  const derivedAliasAccountId = publicKey.toAccountId(0, 0).toString();
  const aliasAccountId = normalizeAliasAccountId(
    input.aliasAccountId || derivedAliasAccountId,
  );

  const existingAccount = await resolveAccount(normalizedNetwork, aliasAccountId, {
    allowNotFound: true,
  });
  if (existingAccount?.accountId) {
    return {
      ...existingAccount,
      alias: existingAccount.alias || aliasAccountId,
      publicKey: existingAccount.publicKey || publicKeyRaw || null,
      creationTransactionId: null,
      activationMode: "active_existing_account",
      activationReason: "resolved_existing_account",
    };
  }

  const sdkClient = createSdkClient(normalizedNetwork, { withOperator: true });
  const operator = getOperatorConfig(normalizedNetwork);
  const initialBalance = getInitialAccountBalance();
  const initialTinybars = BigInt(initialBalance.toTinybars().toString());
  const operatorAccount = await requireProvisioningOperatorAccount(normalizedNetwork, operator);

  assertProvisioningFunding(
    operatorAccount,
    initialTinybars,
    normalizedNetwork,
    operator,
  );

  let response;
  try {
    response = await new AccountCreateTransaction()
      .setKey(publicKey)
      .setInitialBalance(initialBalance)
      .execute(sdkClient);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to create HBAR account on-chain", {
      status: 502,
      errors: {
        network: normalizedNetwork,
        aliasAccountId,
        reason: getErrorReason(error),
      },
    });
  }

  let receipt = null;
  try {
    receipt = await response.getReceipt(sdkClient);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("HBAR account creation transaction did not reach a successful receipt", {
      status: 502,
      errors: {
        network: normalizedNetwork,
        aliasAccountId,
        transactionId:
          typeof response.transactionId?.toString === "function"
            ? response.transactionId.toString()
            : null,
        reason: getErrorReason(error),
      },
    });
  }

  const creationTransactionId =
    typeof response.transactionId?.toString === "function"
      ? response.transactionId.toString()
      : null;
  const receiptAccountId = selectCanonicalAccountId(receipt);
  const createdAccount = await resolveCreatedAccount(normalizedNetwork, {
    accountId: receiptAccountId,
    aliasAccountId,
    creationTransactionId,
    publicKey: publicKeyRaw,
  });

  if (!createdAccount?.accountId) {
    throw new AppError("HBAR account was created but the canonical account could not be resolved", {
      status: 502,
      errors: {
        network: normalizedNetwork,
        aliasAccountId,
        accountId: receiptAccountId,
        transactionId: creationTransactionId,
      },
    });
  }

  return {
    ...createdAccount,
    alias: createdAccount.alias || aliasAccountId,
    publicKey: createdAccount.publicKey || publicKeyRaw || null,
    creationTransactionId,
    activationMode: "operator_funded",
    activationReason: "created_during_wallet_provisioning",
  };
}

async function ensureAccountForAlias(network, input = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  if (normalizeString(input.publicKey)) {
    return createAccountFromPublicKey(normalizedNetwork, input);
  }
  const aliasAccountId = normalizeAliasAccountId(input.aliasAccountId);

  const existingAccount = await resolveAccount(normalizedNetwork, aliasAccountId, {
    allowNotFound: true,
  });
  if (existingAccount?.accountId) {
    return existingAccount;
  }

  const sdkClient = createSdkClient(normalizedNetwork, { withOperator: true });
  const operator = getOperatorConfig(normalizedNetwork);
  const initialBalance = getInitialAccountBalance();
  const initialTinybars = BigInt(initialBalance.toTinybars().toString());
  const operatorAccount = await requireProvisioningOperatorAccount(normalizedNetwork, operator);

  assertProvisioningFunding(
    operatorAccount,
    initialTinybars,
    normalizedNetwork,
    operator,
  );

  const transaction = new TransferTransaction()
    .addHbarTransfer(
      AccountId.fromString(operator.operatorId),
      Hbar.fromTinybars(-initialTinybars),
    )
    .addHbarTransfer(AccountId.fromString(aliasAccountId), initialBalance);
  const response = await transaction.execute(sdkClient);
  await response.getReceipt(sdkClient);

  const creationTransactionId =
    typeof response.transactionId?.toString === "function"
      ? response.transactionId.toString()
      : null;
  const createdAccount = await waitForAccountResolution(normalizedNetwork, {
    aliasAccountId,
    creationTransactionId,
  });
  if (!createdAccount?.accountId) {
    throw new AppError("HBAR account was created but could not be resolved from the mirror node", {
      status: 502,
      errors: {
        aliasAccountId,
        transactionId: creationTransactionId,
      },
    });
  }

  return {
    ...createdAccount,
    creationTransactionId,
  };
}

function getClient(network = DEFAULT_NETWORK) {
  const normalizedNetwork = normalizeNetwork(network);

  return Object.freeze({
    network: normalizedNetwork,
    mirrorBaseUrl: getMirrorBaseUrl(normalizedNetwork),
    sdkClient: null,
    getSdkClient(withOperator = true) {
      return createSdkClient(normalizedNetwork, { withOperator });
    },
    getOperatorConfig() {
      return getOperatorConfig(normalizedNetwork);
    },
    fetchAccount(identifier, options = {}) {
      return fetchAccount(normalizedNetwork, identifier, options);
    },
    fetchAccountTransactions(identifier, limit = 50, order = "desc") {
      return fetchAccountTransactions(normalizedNetwork, identifier, limit, order);
    },
    fetchNextTransactions(nextLink) {
      return fetchNextTransactions(normalizedNetwork, nextLink);
    },
    fetchTransaction(transactionId, options = {}) {
      return fetchTransaction(normalizedNetwork, transactionId, options);
    },
    resolveAccount(identifier, options = {}) {
      return resolveAccount(normalizedNetwork, identifier, options);
    },
    requireAccount(identifier, options = {}) {
      return requireAccount(normalizedNetwork, identifier, options);
    },
    queryAccountInfo(identifier, options = {}) {
      return queryAccountInfo(normalizedNetwork, identifier, options);
    },
    queryTransactionRecord(transactionId, options = {}) {
      return queryTransactionRecord(normalizedNetwork, transactionId, options);
    },
    ensureAccountForAlias(input = {}) {
      return ensureAccountForAlias(normalizedNetwork, input);
    },
    createAccountFromPublicKey(input = {}) {
      return createAccountFromPublicKey(normalizedNetwork, input);
    },
  });
}

module.exports = {
  DEFAULT_NETWORK,
  normalizeNetwork,
  getMirrorBaseUrl,
  getOperatorConfig,
  getInitialAccountBalance,
  createSdkClient,
  request,
  requestJson,
  fetchAccount,
  fetchAccountTransactions,
  fetchNextTransactions,
  fetchTransaction,
  isCanonicalAccountId,
  normalizeCanonicalAccountId,
  normalizeAliasAccountId,
  extractAliasPathIdentifier,
  isAliasAccountId,
  normalizeEvmAddress,
  isEvmAddress,
  selectCanonicalAccountId,
  resolveAccount,
  requireAccount,
  queryAccountInfo,
  queryTransactionRecord,
  createAccountFromPublicKey,
  ensureAccountForAlias,
  getClient,
};
