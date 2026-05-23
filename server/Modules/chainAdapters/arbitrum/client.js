const { JsonRpcProvider, WebSocketProvider } = require("ethers");

const { AppError } = require("../../../helpers/errors");

const MAINNET_NETWORK = "mainnet";
const DEFAULT_ARBITRUM_CHAIN_ID = 42161;
const httpClients = new Map();
const websocketClients = new Map();
const providerValidation = new Map();

function normalizeConfiguredEnvValue(value) {
    const normalized = String(value || "").trim();
    return normalized.replace(/^['"]+|['"]+$/g, "").trim();
}

function normalizeNetwork(network = MAINNET_NETWORK) {
    const normalized = String(network || MAINNET_NETWORK).toLowerCase();

    if (normalized !== MAINNET_NETWORK) {
        throw AppError.validation(`Unsupported Arbitrum network "${network}"`);
    }

    return normalized;
}

function getConfiguredChainId() {
    const rawValue = normalizeConfiguredEnvValue(
        process.env.ARBITRUM_CHAIN_ID || DEFAULT_ARBITRUM_CHAIN_ID,
    );
    if (!/^\d+$/.test(rawValue)) {
        throw AppError.validation("ARBITRUM_CHAIN_ID must be a valid integer");
    }

    return Number(rawValue);
}

function getHttpRpcUrl() {
    const url = normalizeConfiguredEnvValue(process.env.ARBITRUM_RPC_HTTP);
    if (!url) {
        throw AppError.validation("ARBITRUM_RPC_HTTP is required for Arbitrum chain operations");
    }

    if (!/^https?:\/\//.test(url)) {
        throw AppError.validation("ARBITRUM_RPC_HTTP must be a valid HTTP or HTTPS URL");
    }

    return url;
}

function getWebSocketRpcUrl() {
    const url = normalizeConfiguredEnvValue(process.env.ARBITRUM_RPC_WSS);
    if (!url) {
        return "";
    }

    if (!/^wss?:\/\//.test(url)) {
        throw AppError.validation("ARBITRUM_RPC_WSS must be a valid WebSocket URL");
    }

    return url;
}

function getClient(network = MAINNET_NETWORK) {
    const normalizedNetwork = normalizeNetwork(network);

    if (httpClients.has(normalizedNetwork)) {
        return httpClients.get(normalizedNetwork);
    }

    const provider = new JsonRpcProvider(getHttpRpcUrl());
    httpClients.set(normalizedNetwork, provider);
    return provider;
}

function getWebSocketClient(network = MAINNET_NETWORK) {
    const normalizedNetwork = normalizeNetwork(network);
    const url = getWebSocketRpcUrl();

    if (!url) {
        return null;
    }

    if (websocketClients.has(normalizedNetwork)) {
        return websocketClients.get(normalizedNetwork);
    }

    const provider = new WebSocketProvider(url);
    websocketClients.set(normalizedNetwork, provider);
    return provider;
}

async function assertProviderReady(network = MAINNET_NETWORK) {
    const normalizedNetwork = normalizeNetwork(network);

    if (providerValidation.has(normalizedNetwork)) {
        return providerValidation.get(normalizedNetwork);
    }

    const validationPromise = (async () => {
        const provider = getClient(normalizedNetwork);
        const expectedChainId = getConfiguredChainId();
        const actualNetwork = await provider.getNetwork();
        const actualChainId = Number(actualNetwork.chainId);

        if (actualChainId !== expectedChainId) {
            throw AppError.validation(
                `Arbitrum RPC chain ID mismatch: expected ${expectedChainId}, received ${actualChainId}`,
            );
        }

        return {
            provider,
            chainId: actualChainId,
            rpcUrl: getHttpRpcUrl(),
        };
    })();

    providerValidation.set(normalizedNetwork, validationPromise);

    try {
        return await validationPromise;
    } catch (error) {
        providerValidation.delete(normalizedNetwork);
        throw error;
    }
}

module.exports = {
    normalizeNetwork,
    getClient,
    getWebSocketClient,
    getConfiguredChainId,
    assertProviderReady,
};
