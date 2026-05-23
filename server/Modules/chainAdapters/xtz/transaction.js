const crypto = require("crypto");
const { blake2b } = require("@noble/hashes/blake2b");

const { AppError } = require("../../../helpers/errors");
const logger = require("../../../common/utils/logger");
const clientInfo = require("./client");
const amountInfo = require("./amount");
const walletInfo = require("./wallet");

const REVEAL_FEE = 1300;
const TRANSFER_FEE = 1500;

function resolveDestinationAddress(input = {}) {
  const address =
    input.destinationAddress ??
    input.toAddress ??
    input.destination ??
    input.to ??
    "";
  return String(address).trim();
}

function normalizeExecutionParams(input = {}) {
  return {};
}

function logTezosSendStep(step, details = {}) {
  logger.info("XTZ send step", {
    step,
    ...details,
  });
}

function serializeTezosError(error) {
  const providerStatusFromAppError =
    error?.errors && typeof error.errors === "object"
      ? error.errors.providerStatus || null
      : null;
  const providerDataFromAppError =
    error?.errors && typeof error.errors === "object"
      ? error.errors.providerData ?? null
      : null;

  return {
    message: error instanceof Error ? error.message : String(error),
    stage:
      error?.errors && typeof error.errors === "object"
        ? error.errors.stage || null
        : null,
    providerStatus:
      providerStatusFromAppError || Number(error?.response?.status || 0) || null,
    providerData:
      providerDataFromAppError ?? error?.response?.data ?? null,
    code: error?.code || null,
  };
}

function validateDestination(input) {
  const destinationAddress = resolveDestinationAddress(input);
  logTezosSendStep("destination_validation_started", {
    destinationAddress,
  });
  if (!destinationAddress) {
    throw AppError.validation("Destination address is required");
  }
  if (!walletInfo.validateAddress(destinationAddress)) {
    throw AppError.validation("Invalid Tezos destination address");
  }
  logTezosSendStep("destination_validation_succeeded", {
    destinationAddress,
  });
  return {
    destinationAddress,
    executionParams: normalizeExecutionParams(input)
  };
}

async function estimateTransfer(input) {
  const { network, fromAddress, amount } = input;
  const destinationAddress = resolveDestinationAddress(input);
  const client = clientInfo.getClient(network);

  let totalFeeMutez = TRANSFER_FEE;
  try {
    const config = await client.getAccountConfig(fromAddress);
    if (!config.isRevealed) {
      totalFeeMutez += REVEAL_FEE;
    }
  } catch (error) {
    // Failsafe fallback
  }

  return {
    networkFeeBaseUnits: String(totalFeeMutez),
    networkFee: amountInfo.fromBaseUnits(String(totalFeeMutez)),
    preparedTransaction: {
      fromAddress,
      toAddress: destinationAddress,
      amount,
    },
    executionParams: {}
  };
}

async function executeTransfer(input) {
  const { network, fromAddress, amount, mnemonic } = input;
  let stage = "input_normalization";
  const toAddress = resolveDestinationAddress(input);
  const client = clientInfo.getClient(network);

  try {
    logTezosSendStep("input_normalized", {
      network,
      fromAddress,
      toAddress,
      amount,
      hasMnemonic: Boolean(String(mnemonic || "").trim()),
    });

    stage = "destination_validation";
    validateDestination({ destinationAddress: toAddress });

    stage = "derive_keypair";
    const { address: derivedAddress, publicKey, privateKey } =
      walletInfo.deriveKeypairFromMnemonic(mnemonic);

    logTezosSendStep("keypair_derived", {
      fromAddress,
      derivedAddress,
      publicKeyPrefix: String(publicKey || "").slice(0, 8),
    });

    if (String(derivedAddress || "").trim() !== String(fromAddress || "").trim()) {
      throw AppError.conflict("Derived Tezos address does not match sender address");
    }

    const privateKeyBytes = Buffer.from(privateKey, 'hex');

    const privObj = crypto.createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        privateKeyBytes
      ]),
      format: 'der',
      type: 'pkcs8'
    });
    
    stage = "get_account_config";
    logTezosSendStep("account_config_fetch_started", {
      fromAddress,
      network,
    });
    const config = await client.getAccountConfig(fromAddress);
    logTezosSendStep("account_config_fetch_succeeded", {
      fromAddress,
      branch: config.branch,
      counter: config.counter,
      isRevealed: config.isRevealed,
      protocol: config.protocol || null,
    });

    let counter = config.counter;
    let totalFee = 0;
    const operations = [];

    logTezosSendStep("reveal_detection_completed", {
      fromAddress,
      isRevealed: config.isRevealed,
    });

    if (!config.isRevealed) {
      counter++;
      totalFee += REVEAL_FEE;
      operations.push({
        kind: "reveal",
        source: fromAddress,
        fee: String(REVEAL_FEE),
        counter: String(counter),
        gas_limit: "10000",
        storage_limit: "0",
        public_key: publicKey
      });
    }

    counter++;
    totalFee += TRANSFER_FEE;
    operations.push({
      kind: "transaction",
      source: fromAddress,
      fee: String(TRANSFER_FEE),
      counter: String(counter),
      gas_limit: "10500",
      storage_limit: "300",
      amount: amountInfo.toBaseUnits(amount),
      destination: toAddress
    });

    logTezosSendStep("operation_batch_built", {
      branch: config.branch,
      nextCounter: counter,
      operationKinds: operations.map((operation) => operation.kind),
      revealIncluded: operations.some((operation) => operation.kind === "reveal"),
      operationCount: operations.length,
    });

    stage = "forge_operations";
    logTezosSendStep("forge_operations_started", {
      branch: config.branch,
      operations,
    });
    const forgedHex = await client.forgeOperations(config.branch, operations);
    logTezosSendStep("forge_operations_succeeded", {
      forgedHexLength: String(forgedHex || "").length,
      forgedHexPreview: String(forgedHex || "").slice(0, 32),
    });
    
    stage = "sign_operation";
    const watermark = Buffer.from('03', 'hex');
    const msg = Buffer.concat([watermark, Buffer.from(forgedHex, 'hex')]);
    const hash = Buffer.from(blake2b(msg, { dkLen: 32 }));
    logTezosSendStep("signing_input_ready", {
      forgedHexLength: forgedHex.length,
      signingPayloadBytesLength: msg.length,
      signingHashHex: hash.toString("hex"),
    });
    
    const signatureHex = crypto.sign(null, hash, privObj).toString('hex');
    logTezosSendStep("signature_created", {
      signatureHexLength: signatureHex.length,
      signatureHexPreview: signatureHex.slice(0, 32),
    });
    const signedForge = forgedHex + signatureHex;

    stage = "inject_operation";
    logTezosSendStep("inject_operation_started", {
      signedOpHexLength: signedForge.length,
    });
    const txHash = await client.injectOperation(signedForge);
    logTezosSendStep("inject_operation_succeeded", {
      txHash,
    });

    if (!txHash) {
      throw new Error("Failed to inject Tezos transaction: resulting txHash was empty");
    }

    return {
      txHash,
      networkFeeBaseUnits: String(totalFee),
      networkFee: amountInfo.fromBaseUnits(String(totalFee)),
      chainStatus: "submitted",
      succeeded: false,
      validated: false,
      chainTimestamp: new Date(),
      rawRequest: { fromAddress, toAddress, amount },
      rawResponse: { operations, txHash },
      executionParams: {}
    };
  } catch (error) {
    const details = serializeTezosError(error);

    logger.error("XTZ send failed", {
      stage,
      network,
      fromAddress,
      toAddress,
      amount,
      error: details.message,
      errorStage: details.stage,
      providerStatus: details.providerStatus,
      providerData: details.providerData,
      code: details.code,
    });

    if (error instanceof AppError) {
      if (
        error.errors &&
        typeof error.errors === "object" &&
        !error.errors.stage
      ) {
        error.errors.stage = stage;
      }
      throw error;
    }

    throw new AppError("Failed to submit XTZ transaction", {
      status: 502,
      errors: {
        stage,
        reason: details.message,
        providerStatus: details.providerStatus,
        providerData: details.providerData,
      },
    });
  }
}

async function fetchHistory(input) {
  const { network, address, limit } = input;
  const client = clientInfo.getClient(network);
  return client.fetchHistory(address, limit);
}

module.exports = {
  normalizeExecutionParams,
  validateDestination,
  estimateTransfer,
  executeTransfer,
  fetchHistory
};
