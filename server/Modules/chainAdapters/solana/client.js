const { Connection } = require("@solana/web3.js");

const solanaConfig = require("../../../config/solana");
const { AppError } = require("../../../helpers/errors");
const logger = require("../../../common/utils/logger");
const { handleChainRuntimeFailure } = require("../../../services/chainRuntime.service");

const clients = new Map();
const warnedPublicEndpoints = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPublicSharedRpc(url) {
  return [
    "https://api.mainnet-beta.solana.com",
    "https://api.testnet.solana.com",
    "https://api.devnet.solana.com",
  ].includes(String(url || "").trim());
}

function maybeWarnSharedRpc(network, url) {
  const key = `${network}:${url}`;
  if (!isPublicSharedRpc(url) || warnedPublicEndpoints.has(key)) {
    return;
  }

  warnedPublicEndpoints.add(key);
  logger.warn("Solana adapter is using a shared public RPC endpoint", {
    network,
    url,
    recommendation:
      network === "mainnet" || network === "testnet"
        ? "Configure SOLANA_MAINNET_URL / SOLANA_TESTNET_URL to a dedicated RPC provider for production reliability"
        : "Configure a dedicated Solana RPC provider for production reliability",
  });
}

function isRetryableRpcError(error) {
  const message = error instanceof Error ? error.message : String(error || "");

  return [
    "429",
    "too many requests",
    "rate limit",
    "fetch failed",
    "timed out",
    "timeout",
    "econnreset",
    "socket hang up",
  ].some((token) => message.toLowerCase().includes(token));
}

function buildRpcErrorMessage(network, operation, error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown Solana RPC error");
  const help =
    network === "mainnet" || network === "testnet"
      ? "Configure SOLANA_MAINNET_URL / SOLANA_TESTNET_URL to a dedicated RPC endpoint."
      : "Configure a dedicated Solana RPC endpoint.";

  if (isRetryableRpcError(error)) {
    return `Solana RPC request failed while ${operation} on ${network}: ${message}. ${help}`;
  }

  return message;
}

function getRpcUrl(network = solanaConfig.defaultNetwork) {
  const url = solanaConfig.networks[network];
  if (!url) {
    throw AppError.validation(`Unsupported Solana network "${network}"`);
  }

  return url;
}

function getClient(network = solanaConfig.defaultNetwork) {
  if (clients.has(network)) {
    return clients.get(network);
  }

  const rpcUrl = getRpcUrl(network);
  maybeWarnSharedRpc(network, rpcUrl);
  const connection = new Connection(rpcUrl, solanaConfig.commitment);
  clients.set(network, connection);
  return connection;
}

async function withRpcRetry(network, operation, execute) {
  const attempts = Math.max(Number(solanaConfig.rpcRetry?.maxAttempts) || 1, 1);
  const baseDelayMs = Math.max(Number(solanaConfig.rpcRetry?.baseDelayMs) || 0, 0);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      if (!isRetryableRpcError(error) || attempt === attempts) {
        const finalError = new Error(buildRpcErrorMessage(network, operation, error));
        handleChainRuntimeFailure("solana", finalError, { network });
        throw finalError;
      }

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      logger.warn("Retrying Solana RPC request after transient failure", {
        network,
        operation,
        attempt,
        maxAttempts: attempts,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  const finalError = new Error(`Solana RPC request failed while ${operation} on ${network}`);
  handleChainRuntimeFailure("solana", finalError, { network });
  throw finalError;
}

async function getParsedTransactionsBatched(network, signatures, options = {}) {
  if (!Array.isArray(signatures) || !signatures.length) {
    return [];
  }

  const connection = getClient(network);
  const batchSize = Math.max(Number(solanaConfig.history?.parsedBatchSize) || 10, 1);
  const results = [];

  for (let index = 0; index < signatures.length; index += batchSize) {
    const chunk = signatures.slice(index, index + batchSize);

    try {
      const batch = await withRpcRetry(network, "fetching parsed Solana transactions", () =>
        connection.getParsedTransactions(chunk, options),
      );
      results.push(...batch);
    } catch (_error) {
      logger.warn("Solana batch fetch failed, falling back to sequential fetching", {
        signaturesCount: chunk.length,
        network,
      });
      for (const signature of chunk) {
        await sleep(300);
        const parsed = await withRpcRetry(network, "fetching parsed Solana transaction", () =>
          connection.getParsedTransaction(signature, options),
        );
        results.push(parsed);
      }
    }
  }

  return results;
}

module.exports = {
  getClient,
  withRpcRetry,
  getParsedTransactionsBatched,
};
